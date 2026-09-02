import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ITEM_ID_PATTERN = /^\d{9,15}$/;
const VAULT_RESULT_PREFIX = '__VAULT_RESULT__ ';

const added = [];
const failed = [];

// Machine-readable summary emitted exactly once on every normal terminal path.
// A forced timeout or abnormal crash may skip it; callers must fall back to
// process metadata and capped output when the line is absent.
const emitSummary = () => {
  console.log(`${VAULT_RESULT_PREFIX}${JSON.stringify({ added, failed })}`);
};

function normalizeFailureReason(error) {
  const message = error && error.message ? String(error.message) : '';
  if (/timed out|ETIMEDOUT|aborted/i.test(message)) return 'timeout';
  if (/status 401|status 403|invalid client|unauthorized/i.test(message)) return 'auth-failed';
  if (/status 404|item not found|not found/i.test(message)) return 'item-not-found';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed|getaddrinfo|network/i.test(message)) return 'network-failed';
  if (/invalid json|unexpected token|json/i.test(message)) return 'invalid-response';
  return 'unknown';
}

// Atomic JSON write: unique temp file in the destination directory, then a
// same-volume rename (Windows: MoveFileEx REPLACE_EXISTING). On failure only
// this operation's own temp file is removed and the destination is untouched.
// Pairs with the duplicated CJS helper in manager/main.js.
function writeJsonAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
    return { ok: true };
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      /* only the operation's own temp file is targeted */
    }
    return { ok: false, message: error.message };
  }
}

// Manual environment variables parser to avoid third-party dependencies
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.trim();
      }
    });
  }
}

async function getAccessToken(clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to retrieve eBay access token (Status ${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function run() {
  const itemIds = process.argv.slice(2);

  if (itemIds.length === 0) {
    console.error("❌ Please provide at least one eBay Item ID.");
    console.log("Usage: node scripts/add-to-vault.js <ID_1> <ID_2> <ID_3>");
    return 1;
  }

  // Validate every supplied ID before loading credentials or contacting eBay.
  const invalidIds = itemIds.filter((itemId) => !ITEM_ID_PATTERN.test(itemId));
  if (invalidIds.length > 0) {
    console.error(`❌ Invalid eBay item ID(s): ${invalidIds.join(', ')}. IDs must be 9-15 digits.`);
    invalidIds.forEach((itemId) => failed.push({ id: itemId, reason: 'invalid-item-id' }));
    return 1;
  }

  loadEnv();

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env file.");
    itemIds.forEach((itemId) => failed.push({ id: itemId, reason: 'missing-credentials' }));
    return 1;
  }

  const dataPath = path.resolve(__dirname, '../src/data.json');
  let dataContent;
  try {
    dataContent = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to read or parse data.json: ${err.message}`);
    itemIds.forEach((itemId) => failed.push({ id: itemId, reason: 'unknown' }));
    return 1;
  }

  let token;
  try {
    token = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    console.error(`❌ OAuth Token Error: ${err.message}`);
    itemIds.forEach((itemId) => failed.push({ id: itemId, reason: 'auth-failed' }));
    return 1;
  }

  const fetchedIds = [];

  for (const itemId of itemIds) {
    try {
      const restfulId = encodeURIComponent(`v1|${itemId}|0`);
      const url = `https://api.ebay.com/buy/browse/v1/item/${restfulId}`;
      console.log(`\nFetching eBay listing: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`eBay API returned status ${response.status}: ${errText}`);
      }

      const itemData = await response.json();

      // Extract fields safely
      const title = itemData.title || 'Unknown Item';
      const price = itemData.price && itemData.price.value ? `$${itemData.price.value}` : 'Check Listing';
      const image = itemData.image && itemData.image.imageUrl ? itemData.image.imageUrl : '';
      const itemUrl = itemData.itemWebUrl || `https://www.ebay.com/itm/${itemId}`;

      const newItem = { id: itemId, title, price, image, url: itemUrl };
      console.log("Extracted:", JSON.stringify(newItem, null, 2));

      const existIndex = dataContent.vault.findIndex(v => v.id === itemId);
      if (existIndex >= 0) {
        dataContent.vault[existIndex] = newItem;
      } else {
        dataContent.vault.push(newItem);
      }

      fetchedIds.push(itemId);

      // Small delay to be clean
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`❌ Error retrieving eBay ID ${itemId}:`, err.message);
      failed.push({ id: itemId, reason: normalizeFailureReason(err) });
    }
  }

  // Intentional partial-batch behavior: successfully fetched IDs are written
  // atomically even when other IDs failed; the exit code stays nonzero when
  // any ID failed.
  if (fetchedIds.length > 0) {
    const writeResult = writeJsonAtomic(dataPath, dataContent);
    if (!writeResult.ok) {
      console.error(`\n❌ Failed to save data.json: ${writeResult.message}`);
      fetchedIds.forEach((itemId) => failed.push({ id: itemId, reason: 'unknown' }));
      return 1;
    }
    // Report an ID as added only after its data was committed to data.json.
    fetchedIds.forEach((itemId) => added.push(itemId));
  }

  const stats = fs.statSync(dataPath);
  if (stats.size > 500 * 1024) {
    console.warn(`\n⚠️  WARNING: src/data.json is approaching heavy capacities (${(stats.size / 1024).toFixed(2)} KB).`);
  }

  if (failed.length > 0) {
    console.error("\n❌ Batch sync encountered errors.");
  } else {
    console.log('\n--- BATCH SYNC SUCCESS! ---');
    console.log('✅ src/data.json is rewritten with fresh logic constraints.');
  }

  return failed.length > 0 ? 1 : 0;
}

try {
  process.exitCode = await run();
} catch (error) {
  console.error(`❌ Unexpected failure: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
}

emitSummary();
