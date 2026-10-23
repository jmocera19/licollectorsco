// eBay vault importing, independent of process/CLI concerns. Callers supply the
// item IDs, credentials, destination path, and an HTTP adapter; tests replace the
// adapter and use temporary JSON files. The result contract is
// `{ added, failed }`, where every failed entry is `{ id, reason }`.

const {
  isValidItemId,
  readJsonFile,
  validateVaultData,
  upsertVaultItem,
  writeJsonAtomic,
} = require('./content.cjs');

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const TOKEN_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const ITEM_URL = (itemId) => `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(`v1|${itemId}|0`)}`;

const defaultHttp = async ({ url, method = 'GET', headers, body }) => {
  const response = await fetch(url, { method, headers, body });
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
};

const normalizeFailureReason = (error) => {
  const message = error && error.message ? String(error.message) : '';
  if (/timed out|ETIMEDOUT|aborted/i.test(message)) return 'timeout';
  if (/status 401|status 403|invalid client|unauthorized/i.test(message)) return 'auth-failed';
  if (/status 404|item not found|not found/i.test(message)) return 'item-not-found';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed|getaddrinfo|network/i.test(message)) return 'network-failed';
  if (/invalid token response|missing access_token/i.test(message)) return 'invalid-response';
  if (/invalid import response|invalid import data/i.test(message)) return 'invalid-response';
  if (/invalid json|unexpected token|json/i.test(message)) return 'invalid-response';
  return 'unknown';
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`eBay returned invalid JSON: ${text.slice(0, 200)}`);
  }
};

const requestAccessToken = async ({ http, clientId, clientSecret }) => {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await http({
    url: TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: TOKEN_SCOPE,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve eBay access token (Status ${response.status}): ${response.text}`);
  }

  const data = parseJson(response.text);
  if (!data || typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('eBay returned an invalid token response: missing access_token.');
  }
  return data.access_token;
};

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidResponse = (field) => {
  throw new Error(`Invalid import response: ${field} has an unexpected type.`);
};

const extractVaultItem = (itemId, itemData) => {
  if (!isPlainObject(itemData)) invalidResponse('item');

  const { title, price, image, itemWebUrl } = itemData;

  if (title !== undefined && title !== null && typeof title !== 'string') invalidResponse('title');

  if (price !== undefined && price !== null) {
    if (!isPlainObject(price)) invalidResponse('price');
    if (price.value !== undefined && price.value !== null
      && typeof price.value !== 'string'
      && !(typeof price.value === 'number' && Number.isFinite(price.value))) {
      invalidResponse('price.value');
    }
  }

  if (image !== undefined && image !== null) {
    if (!isPlainObject(image)) invalidResponse('image');
    if (image.imageUrl !== undefined && image.imageUrl !== null && typeof image.imageUrl !== 'string') {
      invalidResponse('image.imageUrl');
    }
  }

  if (itemWebUrl !== undefined && itemWebUrl !== null && typeof itemWebUrl !== 'string') {
    invalidResponse('itemWebUrl');
  }

  return {
    id: itemId,
    title: title || 'Unknown Item',
    price: price && price.value ? `$${price.value}` : 'Check Listing',
    image: image && image.imageUrl ? image.imageUrl : '',
    url: itemWebUrl || `https://www.ebay.com/itm/${itemId}`,
  };
};

/**
 * @param {object} options
 * @param {string[]} options.itemIds
 * @param {string | undefined} options.clientId
 * @param {string | undefined} options.clientSecret
 * @param {string} options.dataPath
 * @param {Function} [options.http]
 * @param {number} [options.delayMs]
 * @param {Console} [options.logger]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @returns {Promise<{ added: string[], failed: Array<{ id: string, reason: string }> }>}
 */
const importEbayItems = async ({
  itemIds,
  clientId,
  clientSecret,
  dataPath,
  http = defaultHttp,
  delayMs = 500,
  logger = console,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) => {
  const added = [];
  const failed = [];

  const invalidIds = itemIds.filter((itemId) => !isValidItemId(itemId));
  if (invalidIds.length > 0) {
    logger.error(`❌ Invalid eBay item ID(s): ${invalidIds.join(', ')}. IDs must be 9-15 digits.`);
    invalidIds.forEach((itemId) => failed.push({ id: itemId, reason: 'invalid-item-id' }));
    return { added, failed };
  }

  if (!clientId || !clientSecret) {
    logger.error('❌ Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env file.');
    itemIds.forEach((itemId) => failed.push({ id: itemId, reason: 'missing-credentials' }));
    return { added, failed };
  }

  const readResult = readJsonFile(dataPath, validateVaultData);
  if (readResult.status !== 'ok') {
    logger.error(`❌ Failed to read data.json (${readResult.step}): ${readResult.message}`);
    itemIds.forEach((itemId) => failed.push({ id: itemId, reason: 'unknown' }));
    return { added, failed };
  }

  let token;
  try {
    token = await requestAccessToken({ http, clientId, clientSecret });
  } catch (error) {
    logger.error(`❌ OAuth Token Error: ${error.message}`);
    const reason = normalizeFailureReason(error) === 'unknown' ? 'auth-failed' : normalizeFailureReason(error);
    itemIds.forEach((itemId) => failed.push({ id: itemId, reason }));
    return { added, failed };
  }

  let dataContent = readResult.data;
  const fetchedIds = [];

  for (const itemId of itemIds) {
    try {
      const url = ITEM_URL(itemId);
      logger.log(`\nFetching eBay listing: ${url}`);

      const response = await http({
        url,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`eBay API returned status ${response.status}: ${response.text}`);
      }

      const newItem = extractVaultItem(itemId, parseJson(response.text));
      const candidate = upsertVaultItem(dataContent, newItem).data;
      const candidateProblem = validateVaultData(candidate);
      if (candidateProblem) {
        throw new Error(`Invalid import data: ${candidateProblem}`);
      }
      dataContent = candidate;
      logger.log('Extracted:', JSON.stringify(newItem, null, 2));

      fetchedIds.push(itemId);

      if (delayMs > 0) await sleep(delayMs);
    } catch (error) {
      logger.error(`❌ Error retrieving eBay ID ${itemId}: ${error.message}`);
      failed.push({ id: itemId, reason: normalizeFailureReason(error) });
    }
  }

  // Intentional partial-batch behavior: successfully fetched IDs are written
  // atomically even when other IDs failed. A concurrent edit aborts the write
  // instead of overwriting it.
  if (fetchedIds.length > 0) {
    const writeProblem = validateVaultData(dataContent);
    if (writeProblem) {
      logger.error(`❌ Refusing to save invalid data.json: ${writeProblem}`);
      fetchedIds.forEach((itemId) => failed.push({ id: itemId, reason: 'invalid-response' }));
      return { added, failed };
    }

    const writeResult = writeJsonAtomic(dataPath, dataContent, {
      expectedFingerprint: readResult.fingerprint,
    });
    if (!writeResult.ok) {
      const reason = writeResult.code === 'stale' ? 'stale-content' : 'unknown';
      logger.error(`❌ Failed to save data.json: ${writeResult.message}`);
      fetchedIds.forEach((itemId) => failed.push({ id: itemId, reason }));
      return { added, failed };
    }
    // Report an ID as added only after its data was committed to data.json.
    added.push(...fetchedIds);
  }

  return { added, failed };
};

module.exports = {
  importEbayItems,
  normalizeFailureReason,
  extractVaultItem,
  TOKEN_URL,
};
