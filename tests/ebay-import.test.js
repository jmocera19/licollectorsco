import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { importEbayItems, TOKEN_URL } = require('../shared/ebay-import.cjs');
const { validateVaultData } = require('../shared/content.cjs');
const { lockPathFor } = require('../shared/content.cjs');

const silentLogger = { log() {}, error() {} };
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const runCli = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'add-to-vault.js'), ...args], {
    cwd: projectRoot,
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

const siteData = () => ({
  livestream: { isLive: false, platform: 'eBay', url: 'https://ebay.com/usr/test' },
  grading: { title: 'Grading', description: 'Description' },
  vault: [],
});

const tempDataFile = (t, value = siteData()) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-ebay-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'data.json');
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  return filePath;
};

const tokenResponse = (token = 'token') => ({
  ok: true,
  status: 200,
  text: JSON.stringify({ access_token: token }),
});

const itemFixture = (id) => ({
  title: `Item ${id}`,
  price: { value: '10.00' },
  image: { imageUrl: `https://images.example/${id}.jpg` },
  itemWebUrl: `https://www.ebay.com/itm/${id}`,
});

const itemResponse = (id) => ({
  ok: true,
  status: 200,
  text: JSON.stringify(itemFixture(id)),
});

const itemIdFromUrl = (url) => decodeURIComponent(url.split('/').pop()).split('|')[1];

const baseOptions = (dataPath, overrides = {}) => ({
  itemIds: ['111111111', '222222222'],
  clientId: 'client',
  clientSecret: 'secret',
  dataPath,
  delayMs: 0,
  logger: silentLogger,
  ...overrides,
});

test('invalid IDs fail before any network or file work', async (t) => {
  const dataPath = tempDataFile(t);
  const before = fs.readFileSync(dataPath, 'utf8');
  let calls = 0;

  const result = await importEbayItems(baseOptions(dataPath, {
    itemIds: ['not-an-id'],
    http: async () => { calls += 1; return tokenResponse(); },
  }));

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.failed, [{ id: 'not-an-id', reason: 'invalid-item-id' }]);
  assert.equal(calls, 0);
  assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
});

test('missing credentials fail without contacting eBay', async (t) => {
  const dataPath = tempDataFile(t);
  let calls = 0;

  const result = await importEbayItems(baseOptions(dataPath, {
    clientId: undefined,
    http: async () => { calls += 1; return tokenResponse(); },
  }));

  assert.equal(calls, 0);
  assert.deepEqual(result.failed.map((entry) => entry.reason), ['missing-credentials', 'missing-credentials']);
});

test('authentication failure marks the whole batch', async (t) => {
  const dataPath = tempDataFile(t);

  const result = await importEbayItems(baseOptions(dataPath, {
    http: async () => ({ ok: false, status: 401, text: 'unauthorized' }),
  }));

  assert.deepEqual(result.failed.map((entry) => entry.reason), ['auth-failed', 'auth-failed']);
});

test('a token timeout fails the batch without touching data.json', async (t) => {
  const dataPath = tempDataFile(t);
  const before = fs.readFileSync(dataPath, 'utf8');

  const result = await importEbayItems(baseOptions(dataPath, {
    http: async () => { throw new Error('The operation timed out'); },
  }));

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.failed, [
    { id: '111111111', reason: 'timeout' },
    { id: '222222222', reason: 'timeout' },
  ]);
  assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
});

test('an item timeout does not block a valid item in the same batch', async (t) => {
  const dataPath = tempDataFile(t);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    const id = itemIdFromUrl(url);
    if (id === '111111111') throw new Error('The operation timed out');
    return itemResponse(id);
  };

  const result = await importEbayItems(baseOptions(dataPath, { http }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, ['222222222']);
  assert.deepEqual(result.failed, [{ id: '111111111', reason: 'timeout' }]);
  assert.deepEqual(stored.vault.map((item) => item.id), ['222222222']);
  assert.equal(validateVaultData(stored), null);
});

test('successful imports preserve unrelated site sections and write every item', async (t) => {
  const dataPath = tempDataFile(t);
  const calls = [];
  const http = async ({ url, method, headers, body }) => {
    calls.push({ url, method, headers, body });
    if (url === TOKEN_URL) return tokenResponse();
    return itemResponse(itemIdFromUrl(url));
  };

  const result = await importEbayItems(baseOptions(dataPath, { http }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, ['111111111', '222222222']);
  assert.deepEqual(result.failed, []);
  assert.equal(stored.livestream.platform, 'eBay');
  assert.equal(stored.grading.title, 'Grading');
  assert.deepEqual(stored.vault.map((item) => item.id), ['111111111', '222222222']);
  assert.deepEqual(stored.vault[0], {
    id: '111111111',
    title: 'Item 111111111',
    price: '$10.00',
    image: 'https://images.example/111111111.jpg',
    url: 'https://www.ebay.com/itm/111111111',
  });
  assert.equal(calls[0].url, TOKEN_URL);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].headers.Authorization, /^Basic /);
  assert.match(calls[0].body, /grant_type=client_credentials/);
});

test('partial failures keep successful items and report the reason', async (t) => {
  const dataPath = tempDataFile(t);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    const id = itemIdFromUrl(url);
    if (id === '111111111') return { ok: false, status: 404, text: 'not found' };
    return itemResponse(id);
  };

  const result = await importEbayItems(baseOptions(dataPath, { http }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, ['222222222']);
  assert.deepEqual(result.failed, [{ id: '111111111', reason: 'item-not-found' }]);
  assert.deepEqual(stored.vault.map((item) => item.id), ['222222222']);
});

test('network and malformed-response failures are classified', async (t) => {
  const dataPath = tempDataFile(t);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    const id = itemIdFromUrl(url);
    if (id === '111111111') throw new Error('fetch failed');
    return { ok: true, status: 200, text: 'not json' };
  };

  const result = await importEbayItems(baseOptions(dataPath, { http }));

  assert.deepEqual(result.failed, [
    { id: '111111111', reason: 'network-failed' },
    { id: '222222222', reason: 'invalid-response' },
  ]);
  assert.deepEqual(result.added, []);
});

test('a concurrent edit aborts the write instead of overwriting it', async (t) => {
  const dataPath = tempDataFile(t);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) {
      fs.appendFileSync(dataPath, '\n', 'utf8');
      return tokenResponse();
    }
    return itemResponse(itemIdFromUrl(url));
  };

  const result = await importEbayItems(baseOptions(dataPath, { http, itemIds: ['111111111'] }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.failed, [{ id: '111111111', reason: 'stale-content' }]);
  assert.deepEqual(stored.vault, []);
  assert.equal(validateVaultData(stored), null);
});

test('wrong field types fail without touching data.json', async (t) => {
  const responses = [
    { title: { unexpected: 'object' } },
    { price: { value: { unexpected: 'object' } } },
    { image: { imageUrl: 123 } },
    { itemWebUrl: ['unexpected'] },
  ];

  for (const response of responses) {
    const dataPath = tempDataFile(t);
    const before = fs.readFileSync(dataPath, 'utf8');
    const http = async ({ url }) => {
      if (url === TOKEN_URL) return tokenResponse();
      return { ok: true, status: 200, text: JSON.stringify(response) };
    };

    const result = await importEbayItems(baseOptions(dataPath, { http, itemIds: ['111111111'] }));

    assert.deepEqual(result.added, []);
    assert.deepEqual(result.failed, [{ id: '111111111', reason: 'invalid-response' }]);
    assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
  }
});

test('a malformed item does not block a valid item in the same batch', async (t) => {
  const dataPath = tempDataFile(t);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    const id = itemIdFromUrl(url);
    if (id === '111111111') return { ok: true, status: 200, text: JSON.stringify({ title: 42 }) };
    return itemResponse(id);
  };

  const result = await importEbayItems(baseOptions(dataPath, { http }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, ['222222222']);
  assert.deepEqual(result.failed, [{ id: '111111111', reason: 'invalid-response' }]);
  assert.deepEqual(stored.vault.map((item) => item.id), ['222222222']);
  assert.equal(validateVaultData(stored), null);
});

test('missing optional fields keep their documented fallbacks', async (t) => {
  const dataPath = tempDataFile(t);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    return { ok: true, status: 200, text: JSON.stringify({}) };
  };

  const result = await importEbayItems(baseOptions(dataPath, { http, itemIds: ['111111111'] }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, ['111111111']);
  assert.deepEqual(stored.vault[0], {
    id: '111111111',
    title: 'Unknown Item',
    price: 'Check Listing',
    image: '',
    url: 'https://www.ebay.com/itm/111111111',
  });
  assert.equal(validateVaultData(stored), null);
});

test('re-importing an existing item updates it in place', async (t) => {
  const initial = siteData();
  initial.vault.push({ id: '111111111', title: 'Old', price: '$1.00', image: '', url: '' });
  const dataPath = tempDataFile(t, initial);
  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    return itemResponse(itemIdFromUrl(url));
  };

  const result = await importEbayItems(baseOptions(dataPath, { http, itemIds: ['111111111'] }));
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  assert.deepEqual(result.added, ['111111111']);
  assert.equal(stored.vault.length, 1);
  assert.equal(stored.vault[0].title, 'Item 111111111');
});

test('a token response without access_token is an invalid response', async (t) => {
  const dataPath = tempDataFile(t);

  const result = await importEbayItems(baseOptions(dataPath, {
    itemIds: ['111111111'],
    http: async () => ({ ok: true, status: 200, text: JSON.stringify({ nope: true }) }),
  }));

  assert.deepEqual(result.failed, [{ id: '111111111', reason: 'invalid-response' }]);
});

test('a saved import surfaces lock cleanup warnings without failing the item', async (t) => {
  const dataPath = tempDataFile(t);
  const original = fs.rmSync;

  fs.rmSync = function (target, options) {
    if (target === lockPathFor(dataPath)) {
      const error = new Error('Injected busy lock');
      error.code = 'EBUSY';
      throw error;
    }
    return original.call(fs, target, options);
  };

  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    return itemResponse(itemIdFromUrl(url));
  };

  try {
    const result = await importEbayItems(baseOptions(dataPath, {
      http,
      itemIds: ['111111111'],
    }));

    assert.deepEqual(result.added, ['111111111']);
    assert.deepEqual(result.failed, []);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /lock cleanup is required/);
  } finally {
    fs.rmSync = original;
  }

  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.deepEqual(stored.vault.map((item) => item.id), ['111111111']);
  assert.equal(validateVaultData(stored), null);
  assert.equal(fs.existsSync(lockPathFor(dataPath)), true);

  fs.rmSync(lockPathFor(dataPath), { recursive: true, force: true });
});

test('a filesystem write failure reports write-failed and leaves content unchanged', async (t) => {
  const dataPath = tempDataFile(t);
  const before = fs.readFileSync(dataPath, 'utf8');
  const originalRename = fs.renameSync;

  fs.renameSync = function (source, destination) {
    if (destination === dataPath) {
      const error = new Error('Injected permission failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalRename.call(fs, source, destination);
  };

  const http = async ({ url }) => {
    if (url === TOKEN_URL) return tokenResponse();
    return itemResponse(itemIdFromUrl(url));
  };

  let result;
  try {
    result = await importEbayItems(baseOptions(dataPath, {
      http,
      itemIds: ['111111111'],
    }));
  } finally {
    fs.renameSync = originalRename;
  }

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.failed, [{ id: '111111111', reason: 'write-failed' }]);
  assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
  assert.equal(fs.existsSync(lockPathFor(dataPath)), false);
  assert.deepEqual(
    fs.readdirSync(path.dirname(dataPath)).filter((entry) => entry.endsWith('.tmp')),
    [],
  );
});

test('the CLI exits nonzero and emits a failure summary for invalid IDs', async () => {
  const result = await runCli(['not-an-id']);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /__VAULT_RESULT__/);
  assert.match(result.stdout, /"invalid-item-id"/);
  assert.match(result.stderr, /Invalid eBay item ID/);
});
