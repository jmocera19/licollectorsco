// Child-process boundary faults. Targets only the test's copied project, never
// real content. NODE_OPTIONS also loads this into the Manager's actual CLI child.
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.LICO_TEST_ROOT;
if (!root) throw new Error('An owned fixture root is required.');
const lockPaths = ['data.json', 'posts.json'].map((name) => path.join(root, 'src', `${name}.lock`));
const ownerPaths = lockPaths.map((lockPath) => path.join(lockPath, 'owner.json'));
const originalWrite = fs.writeFileSync;
const originalRemove = fs.rmSync;
const cleanupAttempts = new Map();

fs.writeFileSync = function (target, ...args) {
  if (process.env.LICO_TEST_OWNER_FAILURE === '1' && ownerPaths.includes(target)) {
    if (process.env.LICO_TEST_PARTIAL_OWNER === '1') originalWrite.call(fs, target, '{"token":');
    throw Object.assign(new Error('ENOSPC: fixture owner metadata write failed'), { code: 'ENOSPC' });
  }
  return originalWrite.call(fs, target, ...args);
};

fs.rmSync = function (target, ...args) {
  if (lockPaths.includes(target)) {
    const attempt = (cleanupAttempts.get(target) || 0) + 1;
    cleanupAttempts.set(target, attempt);
    if (attempt <= Number(process.env.LICO_TEST_CLEANUP_FAILURES || 0)) {
      throw Object.assign(new Error('EBUSY: fixture lock cleanup busy'), { code: 'EBUSY' });
    }
  }
  return originalRemove.call(fs, target, ...args);
};

global.fetch = async (url) => {
  let data;
  let status = 200;
  if (url === 'https://api.ebay.com/identity/v1/oauth2/token') {
    data = { access_token: 'fixture-token' };
  } else if (url.startsWith('https://api.ebay.com/buy/browse/v1/item/')) {
    const id = decodeURIComponent(url.split('/').at(-1)).split('|')[1];
    if (id === process.env.LICO_TEST_ITEM_FAILURE) {
      status = 404;
      data = { error: 'Item not found' };
    } else {
      data = { title: `Fixture ${id}`, price: { value: '10.00' } };
    }
  } else {
    throw new Error(`Unexpected fixture request: ${url}`);
  }
  return { ok: status === 200, status, text: async () => JSON.stringify(data) };
};
