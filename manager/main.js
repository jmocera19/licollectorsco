const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { createSyncWorkflow } = require('./sync');
const { createMutationLock } = require('./mutation-lock');

const {
  isValidItemId,
  isValidSlug,
  isPlainObject,
  validatePostPayload,
  validatePostsData,
  validateVaultData,
  readJsonFile,
  applyPostPublish,
  applyPostDelete,
  removeVaultItem,
  writeJsonAtomic,
} = require('../shared/content.cjs');

const dataPath = path.join(__dirname, '../src/data.json');
const postsPath = path.join(__dirname, '../src/posts.json');
const cwdPath = path.join(__dirname, '..');
const COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;
const OUTPUT_TAIL_LENGTH = 2000;
const VAULT_RESULT_PREFIX = '__VAULT_RESULT__ ';

let mainWindow = null;

const runExternal = (file, args, { useGit = false, extraEnv } = {}) => new Promise((resolve) => {
  const options = {
    cwd: cwdPath,
    env: {
      ...process.env,
      ...(useGit ? { GIT_TERMINAL_PROMPT: '0' } : {}),
      ...(extraEnv || {}),
    },
    maxBuffer: COMMAND_MAX_BUFFER,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  };

  const resolveFailure = (error, stdout = '', stderr = '') => resolve({
    ok: !error,
    stdout,
    stderr,
    error,
    code: error ? error.code : 0,
    signal: error ? (error.signal || null) : null,
    killed: Boolean(error && error.killed),
    timedOut: Boolean(error && (error.code === 'ETIMEDOUT' || error.killed)),
  });

  try {
    execFile(file, args, options, resolveFailure);
  } catch (error) {
    resolveFailure(error);
  }
});

const runGit = (args) => runExternal('git', args, { useGit: true });
const runNode = (args) => runExternal(process.execPath, args, { extraEnv: { ELECTRON_RUN_AS_NODE: '1' } });

const mutationLock = createMutationLock();

const newYorkDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const runMutation = async (name, busy, operation) => {
  const lease = mutationLock.acquire(name);
  if (!lease.ok) return busy;
  try {
    return await operation();
  } finally {
    lease.release();
  }
};

const syncWorkflow = createSyncWorkflow({
  git: runGit,
  runNode,
  getToday: newYorkDate,
  confirm: async ({ title, message, detail }) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('The manager window is unavailable, so Sync cannot be confirmed.');
    }

    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Commit & Push'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title,
      message,
      detail,
    });

    return { confirmed: response.response === 1 };
  },
});

const validateOverwriteOptions = (options) => {
  if (options === undefined || options === null) return { ok: true, overwrite: false };
  if (!isPlainObject(options)) return { ok: false, message: 'Publish options must be an object.' };
  const { overwrite } = options;
  if (overwrite === undefined) return { ok: true, overwrite: false };
  if (typeof overwrite !== 'boolean') return { ok: false, message: 'The overwrite option must be true or false.' };
  return { ok: true, overwrite };
};

const tailOutput = (value) => {
  const text = typeof value === 'string' ? value : '';
  return text.length > OUTPUT_TAIL_LENGTH ? text.slice(-OUTPUT_TAIL_LENGTH) : text;
};

const cleanupWarning = (result, saved) => {
  const prefix = saved ? 'Content was saved' : 'Content was not saved';
  const messages = [];
  if (result.cleanup) {
    messages.push(`${prefix}, but lock cleanup is required: ${result.cleanup.message} Remove ${result.cleanup.path} after confirming no writer is active.`);
  }
  if (result.tempCleanup) {
    messages.push(`${prefix}, but temporary-file cleanup is required: remove ${result.tempCleanup.path} after confirming no writer is active.`);
  }
  return messages.join(' ');
};

const parseVaultResultLine = (stdout) => {
  if (typeof stdout !== 'string') return null;
  const lines = stdout.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (!line.startsWith(VAULT_RESULT_PREFIX)) return null;
    try {
      const parsed = JSON.parse(line.slice(VAULT_RESULT_PREFIX.length));
      if (isPlainObject(parsed) && Array.isArray(parsed.added) && Array.isArray(parsed.failed)) {
        return parsed;
      }
    } catch (error) {
      /* malformed summary falls through to null */
    }
    return null;
  }
  return null;
};

const normalizedImportMessage = (reason) => {
  switch (reason) {
    case 'missing-credentials':
      return 'eBay credentials are missing. Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to the .env file, then try again.';
    case 'auth-failed':
      return 'eBay rejected the credentials. Check EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in the .env file.';
    case 'item-not-found':
      return 'eBay could not find that item ID. The listing may have ended or been removed.';
    case 'network-failed':
      return 'Could not reach eBay. Check the network connection and try again.';
    case 'timeout':
      return 'The eBay import timed out. Try again.';
    case 'stale-content':
      return 'data.json changed while the import was running. Reload the vault and try again.';
    case 'invalid-response':
      return 'eBay returned an unexpected response. Try again.';
    default:
      return 'Import failed. Review the console output and try again.';
  }
};

const importReasonFromResult = (resultLine, result) => {
  if (resultLine && resultLine.failed.length > 0) {
    return typeof resultLine.failed[0].reason === 'string' ? resultLine.failed[0].reason : 'unknown';
  }
  if (result.timedOut) return 'timeout';
  return 'unknown';
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    backgroundColor: '#0A192F',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Renderer hardening: block unexpected navigations (e.g. drag-and-drop) and
  // deny new windows. Initial loadFile and programmatic reloads are unaffected.
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile('index.html');
};

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: Load Active Data.json ---
ipcMain.handle('read-vault', async () => {
  const result = readJsonFile(dataPath, validateVaultData);
  if (result.status !== 'ok') return result;
  return { status: 'ok', vault: result.data.vault };
});

// --- IPC: Remove Target Item ID ---
ipcMain.handle('remove-vault-item', async (event, targetId) => runMutation(
  'vault-remove',
  {
    success: false,
    error: 'operation-in-progress',
    message: 'Another content operation is still running. Wait for it to finish before removing items.',
  },
  async () => {
    if (!isValidItemId(targetId)) {
      return {
        success: false,
        error: 'invalid-item-id',
        id: targetId,
        message: 'Enter a numeric eBay item ID of 9-15 digits.',
      };
    }

    const readResult = readJsonFile(dataPath, validateVaultData);
    if (readResult.status !== 'ok') {
      return {
        success: false,
        error: `${readResult.step}-failed`,
        step: readResult.step,
        message: readResult.message,
      };
    }

    const removal = removeVaultItem(readResult.data, targetId);
    if (!removal.removed) {
      return {
        success: false,
        error: 'not-found',
        id: targetId,
        message: `No vault item with ID ${targetId} was found. Nothing was removed.`,
      };
    }

    const writeResult = await writeJsonAtomic(dataPath, removal.data, {
      expectedFingerprint: readResult.fingerprint,
    });
    if (!writeResult.ok) {
      const warning = cleanupWarning(writeResult, false);
      return {
        success: false,
        error: writeResult.code === 'stale' ? 'stale-content' : 'write-failed',
        message: writeResult.code === 'stale'
          ? `data.json changed while the item was being removed. Nothing was removed; reload and retry.${warning ? ` ${warning}` : ''}`
          : `Could not save data.json: ${writeResult.message}${warning ? ` ${warning}` : ''}`,
        ...(warning ? { warnings: [warning] } : {}),
      };
    }

    const warning = cleanupWarning(writeResult, true);
    return {
      success: true,
      removedId: targetId,
      remainingCount: removal.data.vault.length,
      ...(warning ? { warning } : {}),
    };
  },
));

// --- IPC: Run add-to-vault Scraper ---
ipcMain.handle('add-vault-item', async (event, itemId) => runMutation(
  'vault-import',
  {
    success: false,
    error: 'operation-in-progress',
    message: 'Another content operation is still running. Wait for it to finish before importing items.',
  },
  async () => {
    if (!isValidItemId(itemId)) {
      return {
        success: false,
        error: 'invalid-item-id',
        message: 'Enter a numeric eBay item ID of 9-15 digits.',
      };
    }

    const result = await runNode(['scripts/add-to-vault.js', itemId]);
    const resultLine = parseVaultResultLine(result.stdout);
    const warnings = resultLine && Array.isArray(resultLine.warnings) ? resultLine.warnings : [];

    if (result.ok) {
      const failedEntry = resultLine
        ? resultLine.failed.find((entry) => isPlainObject(entry) && entry.id === itemId)
        : null;
      if (failedEntry) {
        return {
          success: false,
          error: 'import-failed',
          reason: typeof failedEntry.reason === 'string' ? failedEntry.reason : 'unknown',
          message: normalizedImportMessage(typeof failedEntry.reason === 'string' ? failedEntry.reason : 'unknown'),
          detail: {
            stdoutTail: tailOutput(result.stdout),
            stderrTail: tailOutput(result.stderr),
            code: result.code,
            timedOut: result.timedOut,
          },
          ...(warnings.length ? { warnings } : {}),
        };
      }

      // Verify the imported item independently of the child script's summary.
      const readResult = readJsonFile(dataPath, validateVaultData);
      if (readResult.status !== 'ok') {
        return {
          success: false,
          error: 'verify-failed',
          message: `The import script finished, but data.json could not be read: ${readResult.message}`,
          ...(warnings.length ? { warnings } : {}),
        };
      }

      const imported = readResult.data.vault.find((item) => isPlainObject(item) && item.id === itemId);
      if (!imported) {
        return {
          success: false,
          error: 'import-failed',
          reason: importReasonFromResult(resultLine, result),
          message: 'The import script finished, but the item was not found in the vault afterwards.',
          detail: {
            stdoutTail: tailOutput(result.stdout),
            stderrTail: tailOutput(result.stderr),
            code: result.code,
            timedOut: result.timedOut,
          },
          ...(warnings.length ? { warnings } : {}),
        };
      }

      return {
        success: true,
        item: { id: imported.id, title: imported.title, price: imported.price },
        ...(warnings.length ? { warnings } : {}),
      };
    }

    const reason = importReasonFromResult(resultLine, result);
    return {
      success: false,
      error: 'import-failed',
      reason,
      message: normalizedImportMessage(reason),
      detail: {
        stdoutTail: tailOutput(result.stdout),
        stderrTail: tailOutput(result.stderr),
        code: result.code,
        timedOut: result.timedOut,
      },
      ...(warnings.length ? { warnings } : {}),
    };
  },
));

// --- IPC: Perform Git Sync Automation ---
ipcMain.handle('sync-live', () => runMutation(
  'sync',
  {
    status: 'blocked',
    step: 'concurrency',
    reason: 'operation-in-progress',
    message: 'Another content operation is still running. Wait for it to finish, then start Sync again.',
    hint: 'Wait for the current import, save, or delete to finish.',
  },
  () => syncWorkflow.syncLive(),
));

// --- IPC: Read All Blog Posts ---
ipcMain.handle('read-posts', async () => {
  const result = readJsonFile(postsPath, validatePostsData);
  if (result.status !== 'ok') return result;
  return { status: 'ok', posts: result.data.posts };
});

// --- IPC: Publish New Blog Post (conflict-before-write) ---
ipcMain.handle('publish-post', async (event, post, options) => runMutation(
  'post-publish',
  {
    status: 'error',
    step: 'concurrency',
    message: 'Another content operation is still running. Wait for it to finish before publishing.',
  },
  async () => {
      const optionsResult = validateOverwriteOptions(options);
      if (!optionsResult.ok) {
        return { status: 'invalid', errors: [optionsResult.message], message: optionsResult.message };
      }

      const postResult = validatePostPayload(post);
    if (!postResult.ok) {
      return { status: 'invalid', errors: postResult.errors, message: 'The post could not be validated.' };
    }

    const readResult = readJsonFile(postsPath, validatePostsData);
    if (readResult.status !== 'ok') {
      return { status: 'error', step: readResult.step, message: readResult.message };
    }

    const outcome = applyPostPublish(readResult.data, postResult.post, {
      overwrite: optionsResult.overwrite,
      date: newYorkDate(),
    });

    // Conflict check happens before any write; nothing is modified here.
    if (outcome.status === 'conflict') {
      return {
        status: 'conflict',
        slug: postResult.post.slug,
        existing: outcome.existing,
        wrote: false,
      };
    }

    const writeResult = await writeJsonAtomic(postsPath, outcome.data, {
      expectedFingerprint: readResult.fingerprint,
    });
    if (!writeResult.ok) {
      const warning = cleanupWarning(writeResult, false);
      return {
        status: 'error',
        step: writeResult.code === 'stale' ? 'stale' : 'write',
        message: `${writeResult.code === 'stale'
          ? 'posts.json changed while the post was being saved. Nothing was written; reload and retry.'
          : `Could not save posts.json: ${writeResult.message}`}${warning ? ` ${warning}` : ''}`,
        ...(warning ? { warnings: [warning] } : {}),
      };
    }

    const warning = cleanupWarning(writeResult, true);
    return {
      status: 'published',
      slug: outcome.post.slug,
      date: outcome.post.date,
      created: outcome.created,
      ...(warning ? { warning } : {}),
    };
  },
));

// --- IPC: Delete Blog Post ---
ipcMain.handle('delete-post', async (event, slug) => runMutation(
  'post-delete',
  {
    status: 'error',
    step: 'concurrency',
    message: 'Another content operation is still running. Wait for it to finish before deleting.',
  },
  async () => {
      const trimmedSlug = typeof slug === 'string' ? slug.trim() : '';
      if (!isValidSlug(trimmedSlug)) {
        return { status: 'invalid', message: 'Invalid post slug.' };
      }

    const readResult = readJsonFile(postsPath, validatePostsData);
    if (readResult.status !== 'ok') {
      return { status: 'error', step: readResult.step, message: readResult.message };
    }

    const deletion = applyPostDelete(readResult.data, trimmedSlug);
    if (!deletion.removed) {
      return {
        status: 'not-found',
        slug: trimmedSlug,
        message: `No post with slug "${trimmedSlug}" was found. Nothing was deleted.`,
      };
    }

    const writeResult = await writeJsonAtomic(postsPath, deletion.data, {
      expectedFingerprint: readResult.fingerprint,
    });
    if (!writeResult.ok) {
      const warning = cleanupWarning(writeResult, false);
      return {
        status: 'error',
        step: writeResult.code === 'stale' ? 'stale' : 'write',
        message: `${writeResult.code === 'stale'
          ? 'posts.json changed while the post was being deleted. Nothing was deleted; reload and retry.'
          : `Could not save posts.json: ${writeResult.message}`}${warning ? ` ${warning}` : ''}`,
        ...(warning ? { warnings: [warning] } : {}),
      };
    }

    const warning = cleanupWarning(writeResult, true);
    return {
      status: 'deleted',
      slug: trimmedSlug,
      remainingCount: deletion.data.posts.length,
      ...(warning ? { warning } : {}),
    };
  },
));

