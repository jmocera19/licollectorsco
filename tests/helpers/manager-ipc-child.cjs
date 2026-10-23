const path = require('node:path');
const Module = require('node:module');

// Only Electron is replaced; real handlers, mutations, disk writes, and CLI
// execution run from the copied Manager source against fixture content.
const handlers = new Map();
const load = Module._load;
Module._load = function (id, ...args) {
  if (id === 'electron') {
    return {
      app: { whenReady: () => ({ then() {} }), on() {} },
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    };
  }
  return load.call(this, id, ...args);
};
try {
  require(path.join(process.env.LICO_TEST_ROOT, 'manager', 'main.js'));
} finally {
  Module._load = load;
}

(async () => {
  const [channel, serializedArgs] = process.argv.slice(2);
  if (channel === 'sync-live' || !handlers.has(channel)) throw new Error('Unexpected fixture IPC action.');
  const result = await handlers.get(channel)(null, ...JSON.parse(serializedArgs));
  console.log(`__MANAGER_RESULT__ ${JSON.stringify(result)}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
