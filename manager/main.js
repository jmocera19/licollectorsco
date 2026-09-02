const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const dataPath = path.join(__dirname, '../src/data.json');
const postsPath = path.join(__dirname, '../src/posts.json');
const cwdPath = path.join(__dirname, '..');
const COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;
const MAX_DIFF_PREVIEW_LENGTH = 4 * 1024;
const MANAGED_FILES = ['src/data.json', 'src/posts.json', 'public/sitemap.xml'];
const MANAGED_FILE_SET = new Set(MANAGED_FILES);
const ITEM_ID_RE = /^\d{9,15}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;
const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 300;
const MAX_BODY_LENGTH = 200_000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;
const OUTPUT_TAIL_LENGTH = 2000;
const VAULT_RESULT_PREFIX = '__VAULT_RESULT__ ';

let mainWindow = null;
let importInFlight = false;

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

const normalizePath = (filePath) => filePath.replaceAll('\\', '/').replace(/^\.\//, '');

const normalizePaths = (paths) => [...new Set(paths.map(normalizePath))].sort((left, right) => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
});

const samePaths = (left, right) => JSON.stringify(normalizePaths(left)) === JSON.stringify(normalizePaths(right));

const commandDetail = (result) => {
  if (result.timedOut) return `Timed out after ${COMMAND_TIMEOUT_MS}ms.`;
  return result.stderr.trim() || result.stdout.trim() || result.error?.message || `Exited with code ${result.code}.`;
};

const commandFailure = (step, label, result, hint) => ({
  status: 'error',
  step,
  message: `${label} failed.`,
  detail: commandDetail(result),
  hint,
  stdout: result.stdout,
  stderr: result.stderr,
  code: result.code,
});

const blockedResult = (step, reason, message, hint, files = []) => ({
  status: 'blocked',
  step,
  reason,
  message,
  hint,
  files: normalizePaths(files),
});

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

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidItemId = (value) => typeof value === 'string' && ITEM_ID_RE.test(value);

const isValidSlug = (value) => typeof value === 'string'
  && value.length >= 1
  && value.length <= MAX_SLUG_LENGTH
  && SLUG_RE.test(value);

const normalizeTags = (value) => {
  if (!Array.isArray(value)) return { error: 'Tags must be a list of short text labels.' };
  const tags = [];
  for (const tag of value) {
    if (typeof tag !== 'string') return { error: 'Tags must be a list of short text labels.' };
    const trimmed = tag.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TAG_LENGTH) {
      return { error: `Each tag must be at most ${MAX_TAG_LENGTH} characters.` };
    }
    if (!tags.includes(trimmed)) tags.push(trimmed);
  }
  if (tags.length > MAX_TAGS) return { error: `Use at most ${MAX_TAGS} tags.` };
  return { tags };
};

const validatePostPayload = (post) => {
  if (!isPlainObject(post)) {
    return { ok: false, errors: ['The post payload must be an object.'] };
  }

  const errors = [];
  const slug = typeof post.slug === 'string' ? post.slug.trim() : '';
  const title = typeof post.title === 'string' ? post.title.trim() : '';
  const excerpt = typeof post.excerpt === 'string' ? post.excerpt.trim() : '';
  const body = typeof post.body === 'string' ? post.body.trim() : '';

  if (!isValidSlug(slug)) {
    errors.push('Slug must be 1-80 lowercase letters, numbers, or single hyphens, and may not start or end with a hyphen.');
  }
  if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    errors.push(`Title must be 1-${MAX_TITLE_LENGTH} characters.`);
  }
  if (excerpt.length < 1 || excerpt.length > MAX_EXCERPT_LENGTH) {
    errors.push(`Excerpt must be 1-${MAX_EXCERPT_LENGTH} characters.`);
  }
  if (body.length < 1 || body.length > MAX_BODY_LENGTH) {
    errors.push(`Body must be 1-${MAX_BODY_LENGTH} characters.`);
  }

  const tagsResult = normalizeTags(post.tags);
  if (tagsResult.error) errors.push(tagsResult.error);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    post: { slug, title, excerpt, body, tags: tagsResult.tags },
  };
};

const validateOverwriteOptions = (options) => {
  if (options === undefined || options === null) return { ok: true, overwrite: false };
  if (!isPlainObject(options)) return { ok: false, message: 'Publish options must be an object.' };
  const { overwrite } = options;
  if (overwrite === undefined) return { ok: true, overwrite: false };
  if (typeof overwrite !== 'boolean') return { ok: false, message: 'The overwrite option must be true or false.' };
  return { ok: true, overwrite };
};

const validateVaultData = (data) => {
  if (!isPlainObject(data)) return 'data.json does not contain a JSON object.';
  if (!Array.isArray(data.vault)) return 'data.json does not contain a vault array.';
  for (const item of data.vault) {
    if (!isPlainObject(item)) return 'data.json contains a vault entry that is not an object.';
    if (typeof item.id !== 'string' || typeof item.title !== 'string'
      || typeof item.price !== 'string' || typeof item.image !== 'string'
      || typeof item.url !== 'string') {
      return 'data.json contains a vault entry missing a string id, title, price, image, or url.';
    }
  }
  return null;
};

const validatePostsData = (data) => {
  if (!isPlainObject(data)) return 'posts.json does not contain a JSON object.';
  if (!Array.isArray(data.posts)) return 'posts.json does not contain a posts array.';
  for (const post of data.posts) {
    if (!isPlainObject(post)) return 'posts.json contains a post entry that is not an object.';
    if (typeof post.slug !== 'string' || typeof post.title !== 'string' || typeof post.date !== 'string') {
      return 'posts.json contains a post entry missing a string slug, title, or date.';
    }
  }
  return null;
};

const readJsonFile = (filePath, validateShape) => {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { status: 'error', step: 'read', message: error.message };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { status: 'error', step: 'parse', message: error.message };
  }

  const shapeProblem = validateShape(parsed);
  if (shapeProblem) {
    return { status: 'error', step: 'shape', message: shapeProblem };
  }

  return { status: 'ok', data: parsed };
};

// Atomic JSON write: unique temp file in the destination directory, then a
// same-volume rename (Windows: MoveFileEx REPLACE_EXISTING). On failure only
// this operation's own temp file is removed and the destination is untouched.
// Pairs with the duplicated ESM helper in scripts/add-to-vault.js.
const writeJsonAtomic = (filePath, value) => {
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
    return { ok: false, message: error.message, code: error.code };
  }
};

const tailOutput = (value) => {
  const text = typeof value === 'string' ? value : '';
  return text.length > OUTPUT_TAIL_LENGTH ? text.slice(-OUTPUT_TAIL_LENGTH) : text;
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

const parseStatus = (stdout) => {
  const records = stdout.split('\0');
  const entries = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;

    if (record.length < 4) {
      return {
        ok: false,
        message: 'Git returned an invalid NUL-delimited status record.',
      };
    }

    const indexStatus = record[0];
    const worktreeStatus = record[1];
    const renameOrCopy = ['R', 'C'].includes(indexStatus) || ['R', 'C'].includes(worktreeStatus);
    entries.push({
      indexStatus,
      worktreeStatus,
      path: normalizePath(record.slice(3)),
      renameOrCopy,
    });

    if (renameOrCopy) {
      const sourcePath = records[index + 1];
      if (!sourcePath) {
        return {
          ok: false,
          message: 'Git returned an incomplete rename or copy status record.',
        };
      }
      entries.push({
        indexStatus: '?',
        worktreeStatus: '?',
        path: normalizePath(sourcePath),
        renameOrCopy: true,
      });
      index += 1;
    }
  }

  return { ok: true, entries };
};

const parseNulPaths = (stdout) => normalizePaths(stdout.split('\0').filter(Boolean));

const validateStatus = async () => {
  const result = await runGit(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!result.ok) {
    return {
      ok: false,
      result: commandFailure(
        'status',
        'Checking the repository worktree',
        result,
        'Resolve the Git error outside the manager, then start Sync again.',
      ),
    };
  }

  const parsed = parseStatus(result.stdout);
  if (!parsed.ok) {
    return {
      ok: false,
      result: {
        status: 'error',
        step: 'status',
        message: parsed.message,
        hint: 'Resolve the Git status output problem outside the manager, then start Sync again.',
      },
    };
  }

  const stagedPaths = normalizePaths(parsed.entries
    .filter((entry) => entry.indexStatus !== ' ' && entry.indexStatus !== '?')
    .map((entry) => entry.path));
  if (stagedPaths.length > 0) {
    return {
      ok: false,
      result: blockedResult(
        'status',
        'staged-changes',
        `Cannot sync: pre-existing staged changes were found in ${stagedPaths.join(', ')}.`,
        'Unstage or resolve these changes outside the manager, then start Sync again.',
        stagedPaths,
      ),
    };
  }

  const unrelatedPaths = normalizePaths(parsed.entries
    .filter((entry) => entry.renameOrCopy || !MANAGED_FILE_SET.has(entry.path))
    .map((entry) => entry.path));
  if (unrelatedPaths.length > 0) {
    return {
      ok: false,
      result: blockedResult(
        'status',
        'unrelated-changes',
        `Cannot sync: unrelated modified or untracked files were found in ${unrelatedPaths.join(', ')}.`,
        'Resolve these files outside the manager, then start Sync again.',
        unrelatedPaths,
      ),
    };
  }

  return { ok: true, changed: normalizePaths(parsed.entries.map((entry) => entry.path)) };
};

const validateRepository = async ({ fetchOrigin }) => {
  const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchResult.ok) {
    return {
      ok: false,
      result: commandFailure(
        'branch',
        'Checking the current branch',
        branchResult,
        'Check out main outside the manager, then start Sync again.',
      ),
    };
  }

  const branch = branchResult.stdout.trim();
  if (branch !== 'main') {
    return {
      ok: false,
      result: blockedResult(
        'branch',
        'not-main',
        `Cannot sync from branch ${branch || '(unknown)'}.`,
        'Switch to main outside the manager, then start Sync again.',
      ),
    };
  }

  if (fetchOrigin) {
    const fetchResult = await runGit(['fetch', '--quiet', 'origin']);
    if (!fetchResult.ok) {
      return {
        ok: false,
        result: commandFailure(
          'fetch',
          'Fetching origin',
          fetchResult,
          'Resolve the network or Git authentication problem outside the manager, then start Sync again.',
        ),
      };
    }
  }

  const divergenceResult = await runGit(['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
  if (!divergenceResult.ok) {
    return {
      ok: false,
      result: commandFailure(
        'divergence',
        'Comparing main with origin/main',
        divergenceResult,
        'Ensure origin/main exists and resolve the Git reference problem outside the manager, then start Sync again.',
      ),
    };
  }

  const counts = divergenceResult.stdout.trim().split(/\s+/);
  if (counts.length !== 2 || counts.some((count) => !/^\d+$/.test(count))) {
    return {
      ok: false,
      result: {
        status: 'error',
        step: 'divergence',
        message: 'Git returned an invalid main/origin-main comparison.',
        detail: `Expected two integer counts but received: ${divergenceResult.stdout.trim() || '(empty output)'}`,
        hint: 'Resolve the Git reference problem outside the manager, then start Sync again.',
      },
    };
  }

  // For HEAD...origin/main, the left count is ahead and the right count is behind.
  const ahead = Number(counts[0]);
  const behind = Number(counts[1]);
  if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
    return {
      ok: false,
      result: {
        status: 'error',
        step: 'divergence',
        message: 'Git returned an unsafe main/origin-main comparison.',
        detail: `Ahead: ${counts[0]}; behind: ${counts[1]}.`,
        hint: 'Resolve the Git reference problem outside the manager, then start Sync again.',
      },
    };
  }

  if (ahead > 0) {
    return {
      ok: false,
      result: {
        ...blockedResult(
          'divergence',
          'ahead',
          `Cannot sync: local main has ${ahead} unpushed commit${ahead === 1 ? '' : 's'} ahead of origin/main.`,
          'Resolve the unpushed commits outside the manager, then start Sync again.',
        ),
        ahead,
        behind,
      },
    };
  }

  if (behind > 0) {
    return {
      ok: false,
      result: {
        ...blockedResult(
          'divergence',
          'behind',
          `Cannot sync: local main is ${behind} commit${behind === 1 ? '' : 's'} behind origin/main.`,
          'Update main outside the manager, then start Sync again.',
        ),
        ahead,
        behind,
      },
    };
  }

  return validateStatus();
};

const getDiffFingerprint = async ({ cached = false, step = 'fingerprint' } = {}) => {
  const args = ['diff', '--no-color', '--no-ext-diff', '--no-textconv'];
  args.push(cached ? '--cached' : 'HEAD', '--', ...MANAGED_FILES);

  const result = await runGit(args);
  if (!result.ok) {
    return {
      ok: false,
      result: commandFailure(
        step,
        cached ? 'Reading the staged managed-file diff' : 'Reading the managed-file diff',
        result,
        'Resolve the Git diff problem outside the manager, then start Sync again.',
      ),
    };
  }

  return {
    ok: true,
    diff: result.stdout,
    fingerprint: crypto.createHash('sha256').update(result.stdout, 'utf8').digest('hex'),
  };
};

const unstageManagerPaths = async (paths) => {
  const managerPaths = normalizePaths(paths);
  if (managerPaths.length === 0) return { ok: true, paths: managerPaths };

  const result = await runGit(['restore', '--staged', '--', ...managerPaths]);
  if (!result.ok) {
    return {
      ok: false,
      result: commandFailure(
        'unstage',
        'Unstaging manager-staged paths',
        result,
        'Inspect the index outside the manager before retrying; only manager-staged paths were targeted.',
      ),
    };
  }

  return { ok: true, paths: managerPaths };
};

const attachUnstageResult = async (failure, paths) => {
  const cleanup = await unstageManagerPaths(paths);
  if (cleanup.ok) {
    return {
      ...failure,
      message: `${failure.message} Only manager-staged paths were unstaged; working-tree changes were preserved.`,
      cleanup: { status: 'completed', paths: cleanup.paths },
    };
  }

  return {
    ...failure,
    message: `${failure.message} Only manager-staged paths were targeted for unstaging, but cleanup failed.`,
    cleanup: cleanup.result,
  };
};

const requestSyncConfirmation = async (commitMessage, changedPaths, diff, fingerprint) => {
  let windowAvailable = false;
  try {
    windowAvailable = Boolean(mainWindow && !mainWindow.isDestroyed());
  } catch (error) {
    return {
      ok: false,
      result: {
        status: 'error',
        step: 'dialog',
        message: 'The sync confirmation window could not be inspected.',
        detail: error.message,
        hint: 'Reopen the manager and start Sync again.',
      },
    };
  }

  if (!windowAvailable) {
    return {
      ok: false,
      result: {
        status: 'error',
        step: 'dialog',
        message: 'The manager window is unavailable, so Sync cannot be confirmed.',
        hint: 'Reopen the manager and start Sync again.',
      },
    };
  }

  const diffPreview = diff.length > MAX_DIFF_PREVIEW_LENGTH
    ? [
      diff.slice(0, MAX_DIFF_PREVIEW_LENGTH),
      '',
      `Diff preview truncated at ${MAX_DIFF_PREVIEW_LENGTH} characters.`,
      'Cancel and review the complete git diff before starting Sync again if you need to inspect every line.',
    ].join('\n')
    : diff || '(No textual diff.)';

  const detail = [
    `Commit: "${commitMessage}"`,
    `Managed-file diff fingerprint: ${fingerprint}`,
    '',
    'Changed managed paths:',
    ...changedPaths.map((filePath) => `- ${filePath}`),
    '',
    'Managed-file diff preview:',
    diffPreview,
  ].join('\n');

  try {
    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Commit & Push'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Sync to Live Site',
      message: 'Pushing to main deploys to production through Cloudflare Pages.',
      detail,
    });
    return { ok: true, confirmed: response.response === 1 };
  } catch (error) {
    return {
      ok: false,
      result: {
        status: 'error',
        step: 'dialog',
        message: 'The sync confirmation dialog failed to open.',
        detail: error.message,
        hint: 'Reopen the manager and start Sync again.',
      },
    };
  }
};

const changedDuringConfirmation = (approvedPaths, currentPaths, approvedFingerprint, currentFingerprint) => ({
  status: 'changed-during-confirmation',
  message: 'Managed content changed while confirmation was open. Nothing was staged, committed, or pushed.',
  hint: 'Start Sync again to review and approve the current managed-file diff.',
  approvedPaths: normalizePaths(approvedPaths),
  currentPaths: normalizePaths(currentPaths),
  approvedFingerprint,
  currentFingerprint,
});

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
ipcMain.handle('remove-vault-item', async (event, targetId) => {
  if (!isValidItemId(targetId)) {
    return {
      success: false,
      error: 'invalid-item-id',
      id: targetId,
      message: 'Enter a numeric eBay item ID of 9-15 digits.',
    };
  }

  if (importInFlight) {
    return {
      success: false,
      error: 'import-in-progress',
      message: 'An eBay import is still running. Wait for it to finish before removing items.',
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

  const dataObj = readResult.data;
  const remaining = dataObj.vault.filter((item) => isPlainObject(item) && item.id !== targetId);
  if (remaining.length === dataObj.vault.length) {
    return {
      success: false,
      error: 'not-found',
      id: targetId,
      message: `No vault item with ID ${targetId} was found. Nothing was removed.`,
    };
  }

  dataObj.vault = remaining;
  const writeResult = writeJsonAtomic(dataPath, dataObj);
  if (!writeResult.ok) {
    return {
      success: false,
      error: 'write-failed',
      message: `Could not save data.json: ${writeResult.message}`,
    };
  }

  return { success: true, removedId: targetId, remainingCount: remaining.length };
});

// --- IPC: Run add-to-vault Scraper ---
ipcMain.handle('add-vault-item', async (event, itemId) => {
  if (!isValidItemId(itemId)) {
    return {
      success: false,
      error: 'invalid-item-id',
      message: 'Enter a numeric eBay item ID of 9-15 digits.',
    };
  }

  if (importInFlight) {
    return {
      success: false,
      error: 'import-in-progress',
      message: 'Another eBay import is already running. Wait for it to finish.',
    };
  }

  importInFlight = true;
  try {
    const result = await runNode(['scripts/add-to-vault.js', itemId]);
    const resultLine = parseVaultResultLine(result.stdout);

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
        };
      }

      // Verify the imported item independently of the child script's summary.
      const readResult = readJsonFile(dataPath, validateVaultData);
      if (readResult.status !== 'ok') {
        return {
          success: false,
          error: 'verify-failed',
          message: `The import script finished, but data.json could not be read: ${readResult.message}`,
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
        };
      }

      return {
        success: true,
        item: { id: imported.id, title: imported.title, price: imported.price },
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
    };
  } finally {
    importInFlight = false;
  }
});

// --- IPC: Perform Git Sync Automation ---
ipcMain.handle('sync-live', async () => {
  const dateStr = new Date().toISOString().split('T')[0];
  const commitMessage = `Content update: ${dateStr}`;

  try {
    // Fetch and validate before generating anything, then validate locally again afterward.
    let validation = await validateRepository({ fetchOrigin: true });
    if (!validation.ok) return validation.result;

    const sitemapResult = await runNode(['scripts/generate-sitemap.js']);
    if (!sitemapResult.ok) {
      return commandFailure(
        'sitemap',
        'Generating the sitemap',
        sitemapResult,
        'Fix the sitemap or source post data outside the manager, then start Sync again.',
      );
    }

    validation = await validateRepository({ fetchOrigin: false });
    if (!validation.ok) return validation.result;
    if (validation.changed.length === 0) {
      return {
        status: 'no-changes',
        message: 'No manager-controlled changes were found; nothing was committed or pushed.',
      };
    }

    const approvedPaths = normalizePaths(validation.changed);
    const approvedDiff = await getDiffFingerprint();
    if (!approvedDiff.ok) return approvedDiff.result;

    const confirmation = await requestSyncConfirmation(
      commitMessage,
      approvedPaths,
      approvedDiff.diff,
      approvedDiff.fingerprint,
    );
    if (!confirmation.ok) return confirmation.result;
    if (!confirmation.confirmed) {
      return {
        status: 'cancelled',
        message: 'Sync cancelled. Nothing was staged, committed, or pushed.',
        hint: 'The generated sitemap may still be modified on disk; start Sync again when ready.',
      };
    }

    // Fetch again after confirmation so a newly changed origin blocks the push.
    validation = await validateRepository({ fetchOrigin: true });
    if (!validation.ok) return validation.result;

    const currentPaths = normalizePaths(validation.changed);
    const currentDiff = await getDiffFingerprint();
    if (!currentDiff.ok) return currentDiff.result;
    if (!samePaths(approvedPaths, currentPaths) || currentDiff.fingerprint !== approvedDiff.fingerprint) {
      return changedDuringConfirmation(
        approvedPaths,
        currentPaths,
        approvedDiff.fingerprint,
        currentDiff.fingerprint,
      );
    }

    const addResult = await runGit(['add', '--', ...approvedPaths]);
    if (!addResult.ok) {
      return attachUnstageResult(
        commandFailure(
          'staging',
          'Staging the approved managed paths',
          addResult,
          'Review the Git error and start Sync again; no commit or push was attempted.',
        ),
        approvedPaths,
      );
    }

    const stagedPathsResult = await runGit(['diff', '--cached', '--name-only', '-z', '--']);
    if (!stagedPathsResult.ok) {
      return attachUnstageResult(
        commandFailure(
          'staged-paths',
          'Checking staged paths',
          stagedPathsResult,
          'Review the Git error and start Sync again; no commit or push was attempted.',
        ),
        approvedPaths,
      );
    }

    const stagedPaths = parseNulPaths(stagedPathsResult.stdout);
    if (!samePaths(approvedPaths, stagedPaths)) {
      return attachUnstageResult(
        {
          status: 'error',
          step: 'staged-paths',
          message: `Staged paths do not match the approved managed paths. Approved: ${approvedPaths.join(', ') || '(none)'}; staged: ${stagedPaths.join(', ') || '(none)'}.`,
          hint: 'Review the index outside the manager, then start Sync again.',
        },
        approvedPaths,
      );
    }

    const stagedDiff = await getDiffFingerprint({ cached: true, step: 'staged-fingerprint' });
    if (!stagedDiff.ok) {
      return attachUnstageResult(stagedDiff.result, approvedPaths);
    }
    if (stagedDiff.fingerprint !== approvedDiff.fingerprint) {
      return attachUnstageResult(
        {
          status: 'error',
          step: 'staged-fingerprint',
          message: 'The staged managed-file diff does not match the approved diff.',
          hint: 'Review the index outside the manager, then start Sync again.',
          approvedFingerprint: approvedDiff.fingerprint,
          stagedFingerprint: stagedDiff.fingerprint,
        },
        approvedPaths,
      );
    }

    const commitResult = await runGit(['commit', '-m', commitMessage]);
    if (!commitResult.ok) {
      return attachUnstageResult(
        {
          ...commandFailure(
            'commit',
            'Committing the approved managed paths',
            commitResult,
            'Review the Git error and start Sync again.',
          ),
          status: 'commit-failed',
        },
        approvedPaths,
      );
    }

    const hashResult = await runGit(['rev-parse', '--short', 'HEAD']);
    const commitHash = hashResult.stdout.trim();
    if (!hashResult.ok || !commitHash) {
      const hashError = hashResult.ok
        ? 'Git returned an empty commit hash.'
        : commandDetail(hashResult);
      return {
        status: 'committed-not-pushed',
        step: 'commit-hash',
        message: 'A local commit was successfully created, but its hash could not be determined. Nothing was pushed.',
        error: hashError,
        detail: hashError,
        hint: 'Resolve the local commit outside the manager before pushing.',
        stdout: hashResult.stdout,
        stderr: hashResult.stderr,
        code: hashResult.code,
      };
    }

    const pushResult = await runGit(['push', 'origin', 'main']);
    if (!pushResult.ok) {
      return {
        status: 'committed-push-failed',
        step: 'push',
        commitHash,
        message: `Commit ${commitHash} succeeded locally, but pushing main failed. The commit remains local.`,
        detail: commandDetail(pushResult),
        hint: 'Resolve the Git, network, authentication, or remote-history issue outside the manager, then push manually.',
        stdout: pushResult.stdout,
        stderr: pushResult.stderr,
        code: pushResult.code,
      };
    }

    return {
      status: 'deployed',
      commitHash,
      stdout: pushResult.stdout,
    };
  } catch (error) {
    return {
      status: 'error',
      step: 'sync-live',
      message: 'Sync failed unexpectedly.',
      detail: error.message,
      hint: 'Review the manager error and start Sync again.',
    };
  }
});

// --- IPC: Read All Blog Posts ---
ipcMain.handle('read-posts', async () => {
  const result = readJsonFile(postsPath, validatePostsData);
  if (result.status !== 'ok') return result;
  return { status: 'ok', posts: result.data.posts };
});

// --- IPC: Publish New Blog Post (conflict-before-write) ---
ipcMain.handle('publish-post', async (event, post, options) => {
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

  const data = readResult.data;
  const canonical = postResult.post;
  const existing = data.posts.find((entry) => isPlainObject(entry) && entry.slug === canonical.slug);
  const isReplacement = Boolean(existing);

  // Conflict check happens before any write; nothing is modified here.
  if (isReplacement && !optionsResult.overwrite) {
    return {
      status: 'conflict',
      slug: canonical.slug,
      existing: {
        title: typeof existing.title === 'string' ? existing.title : canonical.slug,
        date: typeof existing.date === 'string' ? existing.date : null,
      },
      wrote: false,
    };
  }

  // Canonical object: id always mirrors slug; the renderer never supplies the
  // authoritative date. Replacements preserve the original publication date;
  // new posts use the current America/New_York calendar date.
  const publishedPost = {
    id: canonical.slug,
    slug: canonical.slug,
    title: canonical.title,
    date: isReplacement ? existing.date : newYorkDate(),
    tags: canonical.tags,
    excerpt: canonical.excerpt,
    body: canonical.body,
  };

  data.posts = data.posts.filter((entry) => !(isPlainObject(entry) && entry.slug === canonical.slug));
  data.posts.unshift(publishedPost);

  const writeResult = writeJsonAtomic(postsPath, data);
  if (!writeResult.ok) {
    return { status: 'error', step: 'write', message: `Could not save posts.json: ${writeResult.message}` };
  }

  return { status: 'published', slug: publishedPost.slug, date: publishedPost.date, created: !isReplacement };
});

// --- IPC: Delete Blog Post ---
ipcMain.handle('delete-post', async (event, slug) => {
  const trimmedSlug = typeof slug === 'string' ? slug.trim() : '';
  if (!isValidSlug(trimmedSlug)) {
    return { status: 'invalid', message: 'Invalid post slug.' };
  }

  const readResult = readJsonFile(postsPath, validatePostsData);
  if (readResult.status !== 'ok') {
    return { status: 'error', step: readResult.step, message: readResult.message };
  }

  const data = readResult.data;
  const remaining = data.posts.filter((entry) => !(isPlainObject(entry) && entry.slug === trimmedSlug));
  if (remaining.length === data.posts.length) {
    return {
      status: 'not-found',
      slug: trimmedSlug,
      message: `No post with slug "${trimmedSlug}" was found. Nothing was deleted.`,
    };
  }

  data.posts = remaining;
  const writeResult = writeJsonAtomic(postsPath, data);
  if (!writeResult.ok) {
    return { status: 'error', step: 'write', message: `Could not save posts.json: ${writeResult.message}` };
  }

  return { status: 'deleted', slug: trimmedSlug, remainingCount: remaining.length };
});

