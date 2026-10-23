import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSyncWorkflow, parseStatus } = require('../manager/sync.js');
const { createMutationLock } = require('../manager/mutation-lock.js');

const exec = promisify(execFile);

const gitResult = async (args, cwd) => {
  try {
    const { stdout, stderr } = await exec('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr, code: 0, timedOut: false };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      error,
      code: typeof error.code === 'number' ? error.code : 1,
      timedOut: false,
    };
  }
};

const createRepo = async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');

  await exec('git', ['init', '--bare', '-q', remote]);
  await exec('git', ['init', '-q', repo]);
  await exec('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: repo });
  await exec('git', ['config', 'user.name', 'Test'], { cwd: repo });
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  await exec('git', ['config', 'core.autocrlf', 'false'], { cwd: repo });

  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'public'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'data.json'), '{\n  "vault": []\n}\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'src', 'posts.json'), '{\n  "posts": []\n}\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'public', 'sitemap.xml'), '<urlset />\n', 'utf8');

  await exec('git', ['add', '.'], { cwd: repo });
  await exec('git', ['commit', '-q', '-m', 'initial'], { cwd: repo });
  await exec('git', ['remote', 'add', 'origin', remote], { cwd: repo });
  await exec('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: repo });

  return { repo, remote, git: (args) => gitResult(args, repo) };
};

const workflowFor = (git, confirm) => createSyncWorkflow({
  git,
  runNode: async () => ({ ok: true, stdout: '', stderr: '', code: 0, timedOut: false }),
  confirm,
  getToday: () => '2026-10-23',
});

const modifyManagedFile = (repo) => {
  fs.appendFileSync(path.join(repo, 'src', 'data.json'), '\n', 'utf8');
};

const head = async (repo) => (await gitResult(['rev-parse', 'HEAD'], repo)).stdout.trim();

test('sync commits and pushes only when the approved diff is current', async (t) => {
  const { repo, remote, git } = await createRepo(t);
  modifyManagedFile(repo);

  let confirmation;
  const workflow = workflowFor(git, async (request) => {
    confirmation = request;
    return { confirmed: true };
  });

  const result = await workflow.syncLive();

  assert.equal(result.status, 'deployed');
  assert.match(confirmation.detail, /Content update: 2026-10-23/);
  assert.match(confirmation.detail, /Managed-file diff fingerprint:/);
  assert.equal((await gitResult(['status', '--porcelain'], repo)).stdout.trim(), '');
  assert.equal(
    (await gitResult(['log', '-1', '--pretty=%s', 'HEAD'], repo)).stdout.trim(),
    'Content update: 2026-10-23',
  );
  assert.equal(
    (await gitResult(['log', '-1', '--pretty=%s', 'main'], remote)).stdout.trim(),
    'Content update: 2026-10-23',
  );
});

test('cancelling confirmation leaves the worktree untouched', async (t) => {
  const { repo, git } = await createRepo(t);
  modifyManagedFile(repo);
  const before = await head(repo);

  const result = await workflowFor(git, async () => ({ confirmed: false })).syncLive();

  assert.equal(result.status, 'cancelled');
  assert.equal(await head(repo), before);
  assert.match((await gitResult(['status', '--porcelain'], repo)).stdout, /src\/data\.json/);
});

test('content changed during confirmation blocks the commit', async (t) => {
  const { repo, git } = await createRepo(t);
  modifyManagedFile(repo);
  const before = await head(repo);

  const result = await workflowFor(git, async () => {
    modifyManagedFile(repo);
    return { confirmed: true };
  }).syncLive();

  assert.equal(result.status, 'changed-during-confirmation');
  assert.equal(await head(repo), before);
});

test('a non-main branch is rejected before any write', async (t) => {
  const { repo, git } = await createRepo(t);
  await gitResult(['checkout', '-q', '-b', 'feature'], repo);

  const result = await workflowFor(git, async () => ({ confirmed: true })).syncLive();

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'not-main');
});

test('unrelated worktree files block sync', async (t) => {
  const { repo, git } = await createRepo(t);
  fs.writeFileSync(path.join(repo, 'notes.txt'), 'notes', 'utf8');

  const result = await workflowFor(git, async () => ({ confirmed: true })).syncLive();

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'unrelated-changes');
  assert.deepEqual(result.files, ['notes.txt']);
});

test('pre-existing staged changes block sync', async (t) => {
  const { repo, git } = await createRepo(t);
  modifyManagedFile(repo);
  await gitResult(['add', 'src/data.json'], repo);

  const result = await workflowFor(git, async () => ({ confirmed: true })).syncLive();

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'staged-changes');
});

test('commit failure unstages only manager paths and preserves user edits', async (t) => {
  const { repo, git } = await createRepo(t);
  modifyManagedFile(repo);

  const failingGit = (args) => (args[0] === 'commit'
    ? Promise.resolve({ ok: false, stdout: '', stderr: 'commit failed', code: 1, timedOut: false })
    : git(args));

  const result = await workflowFor(failingGit, async () => ({ confirmed: true })).syncLive();

  assert.equal(result.status, 'commit-failed');
  assert.equal(result.cleanup.status, 'completed');
  assert.equal((await gitResult(['diff', '--cached', '--name-only'], repo)).stdout.trim(), '');
  assert.match((await gitResult(['diff', '--name-only'], repo)).stdout, /src\/data\.json/);
});

test('push failure reports the local commit and leaves it in place', async (t) => {
  const { repo, git } = await createRepo(t);
  modifyManagedFile(repo);

  const failingGit = (args) => (args[0] === 'push'
    ? Promise.resolve({ ok: false, stdout: '', stderr: 'push rejected', code: 1, timedOut: false })
    : git(args));

  const result = await workflowFor(failingGit, async () => ({ confirmed: true })).syncLive();

  assert.equal(result.status, 'committed-push-failed');
  assert.equal(
    (await gitResult(['log', '-1', '--pretty=%s', 'HEAD'], repo)).stdout.trim(),
    'Content update: 2026-10-23',
  );
});

test('parseStatus understands modified and rename records', () => {
  const modified = parseStatus(' M src/data.json\0');
  assert.equal(modified.ok, true);
  assert.equal(modified.entries[0].worktreeStatus, 'M');

  const renamed = parseStatus('R  src/new.json\0src/old.json\0');
  assert.equal(renamed.ok, true);
  assert.equal(renamed.entries.length, 2);
  assert.equal(renamed.entries[1].path, 'src/old.json');
  assert.equal(renamed.entries[0].renameOrCopy, true);
});

test('the mutation lock admits one operation at a time', () => {
  const lock = createMutationLock();
  const first = lock.acquire('sync');

  assert.equal(first.ok, true);
  const second = lock.acquire('publish');
  assert.equal(second.ok, false);
  assert.equal(second.owner, 'sync');

  first.release();
  const third = lock.acquire('publish');
  assert.equal(third.ok, true);
  assert.equal(lock.current(), 'publish');

  first.release();
  assert.equal(lock.current(), 'publish');
  third.release();
  assert.equal(lock.current(), null);
});
