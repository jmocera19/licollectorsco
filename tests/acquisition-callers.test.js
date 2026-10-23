import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preloader = path.join(projectRoot, 'tests', 'helpers', 'acquisition-faults.cjs');
const managerChild = path.join(projectRoot, 'tests', 'helpers', 'manager-ipc-child.cjs');

const makeFixture = (t) => {
  const temporaryRoot = process.platform === 'win32' ? path.join(os.tmpdir(), 'opencode') : os.tmpdir();
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'lico-acquisition-callers-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of [
    'shared/content.cjs', 'shared/ebay-import.cjs', 'scripts/add-to-vault.js',
    'manager/main.js', 'manager/sync.js', 'manager/mutation-lock.js', 'manager/package.json',
  ]) {
    const destination = path.join(directory, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, file), destination);
  }
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(directory, '.env'), 'EBAY_CLIENT_ID=fixture\nEBAY_CLIENT_SECRET=fixture\n');
  fs.mkdirSync(path.join(directory, 'src'));
  const dataPath = path.join(directory, 'src', 'data.json');
  const postsPath = path.join(directory, 'src', 'posts.json');
  fs.writeFileSync(dataPath, JSON.stringify({
    vault: [{ id: '999999999', title: 'Existing item', price: '$1', image: '', url: '' }],
    grading: { title: 'Grading', description: 'Keep me' },
    livestream: { isLive: false, platform: 'eBay', url: '' },
  }));
  fs.writeFileSync(postsPath, JSON.stringify({ posts: [{
    id: 'existing-post', slug: 'existing-post', title: 'Existing post', date: '2026-10-23',
    tags: [], excerpt: 'Existing excerpt.', body: 'Existing body.',
  }] }));
  return { directory, dataPath, postsPath };
};

const runFixture = (directory, args, extraEnv = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {
    cwd: directory,
    windowsHide: true,
    timeout: 40000,
    env: {
      ...process.env,
      LICO_TEST_ROOT: directory,
      LICO_TEST_OWNER_FAILURE: '1',
      LICO_TEST_CLEANUP_FAILURES: '3',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require="${preloader.replaceAll('\\', '/')}"`,
      ...extraEnv,
    },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

const summary = (stdout, prefix) => {
  const lines = stdout.split(/\r?\n/).filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `expected exactly one ${prefix} summary`);
  return JSON.parse(lines[0].slice(prefix.length));
};

test('CLI preserves both errors and reports every unsaved ID as failed', async (t) => {
  const { directory, dataPath } = makeFixture(t);
  const before = fs.readFileSync(dataPath, 'utf8');
  const result = await runFixture(directory, ['scripts/add-to-vault.js', '111111111', '222222222'], {
    LICO_TEST_ITEM_FAILURE: '222222222',
    LICO_TEST_PARTIAL_OWNER: '1',
  });
  assert.equal(result.code, 1, result.stderr);
  const outcome = summary(result.stdout, '__VAULT_RESULT__ ');
  assert.deepEqual(outcome.added, []);
  assert.deepEqual(outcome.failed, [
    { id: '222222222', reason: 'item-not-found' },
    { id: '111111111', reason: 'write-failed' },
  ]);
  assert.equal(outcome.warnings.length, 1);
  assert.match(outcome.warnings[0], /Content was not saved.*EBUSY/);
  assert.ok(outcome.warnings[0].includes(`${dataPath}.lock`));
  assert.match(outcome.warnings[0], /after confirming no writer is active/);
  assert.match(result.stderr, /ENOSPC: fixture owner metadata write failed/);
  assert.match(result.stderr, /EBUSY: fixture lock cleanup busy/);
  assert.doesNotMatch(result.stdout, /BATCH SYNC SUCCESS/);
  assert.doesNotMatch(result.stderr, /Batch saved with cleanup warnings/);
  assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.dirname(dataPath)).sort(), ['data.json', 'data.json.lock', 'posts.json']);
});

test('Manager import failure exposes recovery instructions in its displayed message', async (t) => {
  const { directory, dataPath } = makeFixture(t);
  const before = fs.readFileSync(dataPath, 'utf8');
  const result = await runFixture(directory, [managerChild, 'add-vault-item', '["111111111"]']);
  assert.equal(result.code, 0, result.stderr);
  const outcome = summary(result.stdout, '__MANAGER_RESULT__ ');
  assert.equal(outcome.success, false);
  assert.equal(outcome.reason, 'write-failed');
  assert.match(outcome.detail.stderrTail, /ENOSPC: fixture owner metadata write failed/);
  assert.equal(outcome.warnings.length, 1);
  assert.match(outcome.message, /Content was not saved.*EBUSY/);
  assert.ok(outcome.message.includes(`${dataPath}.lock`));
  assert.match(outcome.message, /after confirming no writer is active/);
  assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
});

for (const busyAttempts of [0, 1]) {
  test(`CLI still fails an unsaved import when acquisition cleanup recovers after ${busyAttempts} busy attempts`, async (t) => {
    const { directory, dataPath } = makeFixture(t);
    const before = fs.readFileSync(dataPath, 'utf8');
    const result = await runFixture(directory, ['scripts/add-to-vault.js', '111111111'], {
      LICO_TEST_CLEANUP_FAILURES: String(busyAttempts),
    });
    assert.equal(result.code, 1, result.stderr);
    const outcome = summary(result.stdout, '__VAULT_RESULT__ ');
    assert.deepEqual(outcome.added, []);
    assert.deepEqual(outcome.failed, [{ id: '111111111', reason: 'write-failed' }]);
    assert.deepEqual(outcome.warnings, []);
    assert.match(result.stderr, /ENOSPC: fixture owner metadata write failed/);
    assert.doesNotMatch(result.stdout, /BATCH SYNC SUCCESS/);
    assert.equal(fs.readFileSync(dataPath, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(path.dirname(dataPath)).sort(), ['data.json', 'posts.json']);
  });
}

for (const [channel, args, destination, failureKey, failureValue] of [
  ['publish-post', [{ slug: 'new-post', title: 'New post', excerpt: 'New excerpt.', tags: [], body: 'New body.' }], 'postsPath', 'status', 'error'],
  ['delete-post', ['existing-post'], 'postsPath', 'status', 'error'],
  ['remove-vault-item', ['999999999'], 'dataPath', 'success', false],
]) {
  test(`Manager ${channel} retains the primary failure and actionable cleanup message`, async (t) => {
    const fixture = makeFixture(t);
    const filePath = fixture[destination];
    const beforeData = fs.readFileSync(fixture.dataPath, 'utf8');
    const beforePosts = fs.readFileSync(fixture.postsPath, 'utf8');
    const result = await runFixture(fixture.directory, [managerChild, channel, JSON.stringify(args)], {
      LICO_TEST_PARTIAL_OWNER: '1',
    });
    assert.equal(result.code, 0, result.stderr);
    const outcome = summary(result.stdout, '__MANAGER_RESULT__ ');
    assert.equal(outcome[failureKey], failureValue);
    assert.match(outcome.message, /ENOSPC: fixture owner metadata write failed/);
    assert.match(outcome.message, /Content was not saved.*EBUSY/);
    assert.ok(outcome.message.includes(`${filePath}.lock`));
    assert.match(outcome.message, /after confirming no writer is active/);
    assert.equal(outcome.warnings.length, 1);
    assert.equal(fs.readFileSync(fixture.dataPath, 'utf8'), beforeData);
    assert.equal(fs.readFileSync(fixture.postsPath, 'utf8'), beforePosts);
    assert.deepEqual(fs.readdirSync(path.dirname(filePath)).sort(), ['data.json', 'posts.json', `${path.basename(filePath)}.lock`].sort());
  });
}

test('CLI reports a persisted import as saved with a cleanup warning, not failed', async (t) => {
  const { directory, dataPath } = makeFixture(t);
  const result = await runFixture(directory, ['scripts/add-to-vault.js', '111111111'], {
    LICO_TEST_OWNER_FAILURE: '0',
  });
  assert.equal(result.code, 0, result.stderr);
  const outcome = summary(result.stdout, '__VAULT_RESULT__ ');
  assert.deepEqual(outcome.added, ['111111111']);
  assert.deepEqual(outcome.failed, []);
  assert.equal(outcome.warnings.length, 1);
  assert.match(outcome.warnings[0], /Content was saved.*EBUSY/);
  assert.match(result.stderr, /Batch saved with cleanup warnings/);
  assert.doesNotMatch(result.stdout, /BATCH SYNC SUCCESS/);
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.deepEqual(stored.vault.map(({ id }) => id), ['999999999', '111111111']);
  assert.equal(stored.grading.description, 'Keep me');
  assert.equal(stored.livestream.isLive, false);
  assert.equal(fs.existsSync(`${dataPath}.lock`), true);
});

test('Manager keeps a persisted import successful while surfacing its cleanup warning', async (t) => {
  const { directory, dataPath } = makeFixture(t);
  const result = await runFixture(directory, [managerChild, 'add-vault-item', '["111111111"]'], {
    LICO_TEST_OWNER_FAILURE: '0',
  });
  assert.equal(result.code, 0, result.stderr);
  const outcome = summary(result.stdout, '__MANAGER_RESULT__ ');
  assert.equal(outcome.success, true);
  assert.equal(outcome.item.id, '111111111');
  assert.equal(outcome.warnings.length, 1);
  assert.match(outcome.warnings[0], /Content was saved.*EBUSY/);
  assert.ok(outcome.warnings[0].includes(`${dataPath}.lock`));
  assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, 'utf8')).vault.map(({ id }) => id), ['999999999', '111111111']);
});
