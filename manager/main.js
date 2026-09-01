const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');

const dataPath = path.join(__dirname, '../src/data.json');
const cwdPath = path.join(__dirname, '..');
const COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;
const MAX_DIFF_PREVIEW_LENGTH = 4 * 1024;
const MANAGED_FILES = ['src/data.json', 'src/posts.json', 'public/sitemap.xml'];
const MANAGED_FILE_SET = new Set(MANAGED_FILES);

let mainWindow = null;

const runExternal = (file, args, useGit = false) => new Promise((resolve) => {
  const options = {
    cwd: cwdPath,
    env: useGit ? { ...process.env, GIT_TERMINAL_PROMPT: '0' } : process.env,
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
    timedOut: Boolean(error && (error.code === 'ETIMEDOUT' || error.killed)),
  });

  try {
    execFile(file, args, options, resolveFailure);
  } catch (error) {
    resolveFailure(error);
  }
});

const runGit = (args) => runExternal('git', args, true);
const runNode = (args) => runExternal(process.execPath, args);

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
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    return { vault: [], error: err.message };
  }
});

// --- IPC: Remove Target Item ID ---
ipcMain.handle('remove-vault-item', async (event, targetId) => {
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const dataObj = JSON.parse(rawData);
    dataObj.vault = dataObj.vault.filter(item => item.id !== targetId);
    fs.writeFileSync(dataPath, JSON.stringify(dataObj, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Run add-to-vault Scraper ---
ipcMain.handle('add-vault-item', async (event, itemId) => {
  return new Promise((resolve) => {
    exec(`node scripts/add-to-vault.js ${itemId}`, { cwd: cwdPath }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: "Failed to fetch listing", stdout, stderr });
      } else {
        try {
          const rawData = fs.readFileSync(dataPath, 'utf8');
          const dataObj = JSON.parse(rawData);
          const itemExists = dataObj.vault && dataObj.vault.some(item => item.id === itemId);
          if (itemExists) {
            resolve({ success: true, stdout });
          } else {
            resolve({ success: false, error: "Failed to fetch listing", stdout, stderr });
          }
        } catch (readErr) {
          resolve({ success: false, error: "Failed to verify listing in vault", stdout, stderr });
        }
      }
    });
  });
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
  try {
    const postsPath = path.join(__dirname, '../src/posts.json');
    const raw = fs.readFileSync(postsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { posts: [], error: err.message };
  }
});

// --- IPC: Publish New Blog Post ---
ipcMain.handle('publish-post', async (event, post) => {
  try {
    const postsPath = path.join(__dirname, '../src/posts.json');
    const raw = fs.readFileSync(postsPath, 'utf8');
    const data = JSON.parse(raw);
    // Remove any existing post with same slug (edit use case)
    data.posts = data.posts.filter(p => p.slug !== post.slug);
    data.posts.unshift(post); // newest first
    fs.writeFileSync(postsPath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Delete Blog Post ---
ipcMain.handle('delete-post', async (event, slug) => {
  try {
    const postsPath = path.join(__dirname, '../src/posts.json');
    const raw = fs.readFileSync(postsPath, 'utf8');
    const data = JSON.parse(raw);
    data.posts = data.posts.filter(p => p.slug !== slug);
    fs.writeFileSync(postsPath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

