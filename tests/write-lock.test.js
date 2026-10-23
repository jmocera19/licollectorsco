import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  acquireFileLock,
  lockPathFor,
  readJsonFile,
  writeJsonAtomic,
} = require('../shared/content.cjs');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raceChild = path.join(projectRoot, 'tests', 'helpers', 'write-race-child.mjs');
const holdChild = path.join(projectRoot, 'tests', 'helpers', 'hold-lock-child.mjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runChild = (script, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script, ...args], {
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

const waitForFile = async (filePath, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${filePath}`);
    await sleep(10);
  }
};

const makeDataFile = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'data.json');
  fs.writeFileSync(filePath, JSON.stringify({ value: 0 }), 'utf8');
  return { directory, filePath };
};

test('competing processes cannot lose an update', async (t) => {
  const { filePath } = makeDataFile(t);
  const readyOne = `${filePath}.ready-one`;
  const readyTwo = `${filePath}.ready-two`;
  const go = `${filePath}.go`;

  const first = runChild(raceChild, [filePath, 'one', readyOne, go]);
  const second = runChild(raceChild, [filePath, 'two', readyTwo, go]);

  await Promise.all([waitForFile(readyOne), waitForFile(readyTwo)]);
  fs.writeFileSync(go, 'go', 'utf8');

  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map((result) => result.code), [0, 0]);

  const outcomes = results.map((result) => JSON.parse(result.stdout));
  assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.code === 'stale').length, 1);

  const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.ok(['one', 'two'].includes(stored.writer));
  assert.equal(fs.existsSync(lockPathFor(filePath)), false);
});

test('a held lock rejects another writer instead of waiting forever', async (t) => {
  const { filePath } = makeDataFile(t);
  const ready = `${filePath}.ready`;
  const release = `${filePath}.release`;

  const holder = runChild(holdChild, [filePath, ready, release]);
  await waitForFile(ready);

  const blocked = await writeJsonAtomic(filePath, { value: 2 }, { lockTimeoutMs: 50 });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'locked');
  assert.match(blocked.message, /PID/);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { value: 0 });

  fs.writeFileSync(release, 'release', 'utf8');
  assert.equal((await holder).code, 0);
  assert.equal(fs.existsSync(lockPathFor(filePath)), false);

  const snapshot = readJsonFile(filePath, () => null);
  const retried = await writeJsonAtomic(filePath, { value: 2 }, {
    expectedFingerprint: snapshot.fingerprint,
  });
  assert.equal(retried.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { value: 2 });
});

test('an orphaned lock is reported, not deleted automatically', async (t) => {
  const { directory, filePath } = makeDataFile(t);
  const lockPath = lockPathFor(filePath);
  fs.mkdirSync(lockPath);
  fs.writeFileSync(
    path.join(lockPath, 'owner.json'),
    JSON.stringify({ token: 'orphan', pid: 999999, createdAt: '2026-01-01T00:00:00.000Z' }),
    'utf8',
  );

  const result = await writeJsonAtomic(filePath, { value: 9 }, { lockTimeoutMs: 10 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'locked');
  assert.equal(result.owner.pid, 999999);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { value: 0 });
  assert.equal(fs.existsSync(lockPath), true);

  fs.rmSync(lockPath, { recursive: true, force: true });
  assert.deepEqual(fs.readdirSync(directory), ['data.json']);
});

test('a failed replacement releases its lock and temp file', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'destination');
  fs.mkdirSync(target);

  const result = await writeJsonAtomic(target, { value: 1 });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(lockPathFor(target)), false);
  assert.deepEqual(fs.readdirSync(directory), ['destination']);
});

test('transient lock cleanup failures are retried', async (t) => {
  const { filePath } = makeDataFile(t);
  const original = fs.rmSync;
  let attempts = 0;

  fs.rmSync = function (target, options) {
    if (target === lockPathFor(filePath) && attempts++ === 0) {
      const error = new Error('Injected busy lock');
      error.code = 'EBUSY';
      throw error;
    }
    return original.call(fs, target, options);
  };

  try {
    const result = await writeJsonAtomic(filePath, { value: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.cleanup, undefined);
  } finally {
    fs.rmSync = original;
  }

  assert.equal(fs.existsSync(lockPathFor(filePath)), false);
});

test('acquisition preserves the owner-write error and reports exhausted cleanup separately', async (t) => {
  const { directory, filePath } = makeDataFile(t);
  const before = fs.readFileSync(filePath, 'utf8');
  const lockPath = lockPathFor(filePath);
  const originalWrite = fs.writeFileSync;
  const originalRemove = fs.rmSync;
  let cleanupAttempts = 0;
  t.mock.method(fs, 'writeFileSync', (target, ...args) => {
    if (target === path.join(lockPath, 'owner.json')) {
      throw Object.assign(new Error('Owner metadata write failed'), { code: 'ENOSPC' });
    }
    return originalWrite.call(fs, target, ...args);
  });
  t.mock.method(fs, 'rmSync', (target, ...args) => {
    if (target === lockPath) {
      cleanupAttempts += 1;
      throw Object.assign(new Error('Acquisition cleanup busy'), { code: 'EBUSY' });
    }
    return originalRemove.call(fs, target, ...args);
  });

  const result = await acquireFileLock(filePath);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'lock-failed');
  assert.equal(result.message, 'Owner metadata write failed');
  assert.equal(result.errorCode, 'ENOSPC');
  assert.equal(result.cleanup.code, 'cleanup-failed');
  assert.equal(result.cleanup.message, 'Acquisition cleanup busy');
  assert.equal(result.cleanup.errorCode, 'EBUSY');
  assert.equal(result.cleanup.path, lockPath);
  assert.equal(cleanupAttempts, 3);
  assert.equal(fs.existsSync(lockPath), true);
  assert.equal(fs.existsSync(path.join(lockPath, 'owner.json')), false);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['data.json', 'data.json.lock']);
});

test('atomic writes retain acquisition cleanup details without changing the destination', async (t) => {
  const { directory, filePath } = makeDataFile(t);
  const before = fs.readFileSync(filePath, 'utf8');
  const lockPath = lockPathFor(filePath);
  const originalWrite = fs.writeFileSync;
  const originalRemove = fs.rmSync;
  t.mock.method(fs, 'writeFileSync', (target, ...args) => {
    if (target === path.join(lockPath, 'owner.json')) {
      // A full disk may leave a partial owner file, not just an empty lock.
      originalWrite.call(fs, target, '{"token":');
      throw Object.assign(new Error('Partial owner metadata write failed'), { code: 'ENOSPC' });
    }
    return originalWrite.call(fs, target, ...args);
  });
  t.mock.method(fs, 'rmSync', (target, ...args) => {
    if (target === lockPath) {
      throw Object.assign(new Error('Acquisition cleanup busy'), { code: 'EBUSY' });
    }
    return originalRemove.call(fs, target, ...args);
  });

  const result = await writeJsonAtomic(filePath, { value: 9 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'lock-failed');
  assert.equal(result.message, 'Partial owner metadata write failed');
  assert.equal(result.errorCode, 'ENOSPC');
  assert.equal(result.cleanup.code, 'cleanup-failed');
  assert.equal(result.cleanup.path, lockPath);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['data.json', 'data.json.lock']);
});

for (const partialOwner of [false, true]) {
  for (const busyAttempts of [0, 1]) {
    test(`owner-write failure cleans up ${partialOwner ? 'partial' : 'missing'} metadata after ${busyAttempts} busy attempts`, async (t) => {
      const { directory, filePath } = makeDataFile(t);
      const before = fs.readFileSync(filePath, 'utf8');
      const lockPath = lockPathFor(filePath);
      const originalWrite = fs.writeFileSync;
      const originalRemove = fs.rmSync;
      let cleanupAttempts = 0;
      t.mock.method(fs, 'writeFileSync', (target, ...args) => {
        if (target === path.join(lockPath, 'owner.json')) {
          if (partialOwner) originalWrite.call(fs, target, '{"token":');
          throw Object.assign(new Error('Owner metadata write failed'), { code: 'ENOSPC' });
        }
        return originalWrite.call(fs, target, ...args);
      });
      t.mock.method(fs, 'rmSync', (target, ...args) => {
        if (target === lockPath && cleanupAttempts++ < busyAttempts) {
          throw Object.assign(new Error('Acquisition cleanup busy'), { code: 'EBUSY' });
        }
        return originalRemove.call(fs, target, ...args);
      });

      const result = await writeJsonAtomic(filePath, { value: 9 });

      assert.equal(result.ok, false, 'cleanup recovery must not turn acquisition failure into a saved write');
      assert.equal(result.message, 'Owner metadata write failed');
      assert.equal(result.errorCode, 'ENOSPC');
      assert.equal(result.cleanup, undefined);
      assert.equal(cleanupAttempts, busyAttempts + 1);
      assert.equal(fs.existsSync(lockPath), false);
      assert.equal(fs.readFileSync(filePath, 'utf8'), before);
      assert.deepEqual(fs.readdirSync(directory), ['data.json']);
    });
  }
}

for (const hasOwner of [false, true]) {
  test(`failed acquisition never removes a pre-existing ${hasOwner ? 'owned' : 'ownerless'} lock`, async (t) => {
    const { filePath } = makeDataFile(t);
    const before = fs.readFileSync(filePath, 'utf8');
    const lockPath = lockPathFor(filePath);
    const ownerPath = path.join(lockPath, 'owner.json');
    fs.mkdirSync(lockPath);
    const owner = JSON.stringify({ token: 'foreign', pid: 999999, createdAt: '2026-01-01T00:00:00.000Z' });
    if (hasOwner) fs.writeFileSync(ownerPath, owner);
    const originalWrite = fs.writeFileSync;
    const originalRemove = fs.rmSync;
    let ownerWrites = 0;
    let cleanupAttempts = 0;
    t.mock.method(fs, 'writeFileSync', (target, ...args) => {
      if (target === ownerPath) ownerWrites += 1;
      return originalWrite.call(fs, target, ...args);
    });
    t.mock.method(fs, 'rmSync', (target, ...args) => {
      if (target === lockPath) cleanupAttempts += 1;
      return originalRemove.call(fs, target, ...args);
    });

    const result = await writeJsonAtomic(filePath, { value: 9 }, { lockTimeoutMs: 0 });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'locked');
    assert.equal(result.cleanup, undefined);
    assert.equal(ownerWrites, 0);
    assert.equal(cleanupAttempts, 0);
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before);
    if (hasOwner) assert.equal(fs.readFileSync(ownerPath, 'utf8'), owner);
    else assert.equal(fs.existsSync(ownerPath), false);
  });
}

test('persistent lock cleanup failure is reported as saved with cleanup required', async (t) => {
  const { filePath } = makeDataFile(t);
  const original = fs.rmSync;

  fs.rmSync = function (target, options) {
    if (target === lockPathFor(filePath)) {
      const error = new Error('Injected busy lock');
      error.code = 'EBUSY';
      throw error;
    }
    return original.call(fs, target, options);
  };

  try {
    const result = await writeJsonAtomic(filePath, { value: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.cleanup.code, 'cleanup-failed');
    assert.match(result.cleanup.message, /Injected busy lock/);
  } finally {
    fs.rmSync = original;
  }

  assert.equal(fs.existsSync(lockPathFor(filePath)), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { value: 1 });
});

test('temporary-file cleanup failure is attached to the write result', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'destination');
  fs.mkdirSync(target);

  const original = fs.unlinkSync;
  fs.unlinkSync = function (targetPath) {
    if (String(targetPath).endsWith('.tmp')) {
      const error = new Error('Injected busy temp file');
      error.code = 'EBUSY';
      throw error;
    }
    return original.call(fs, targetPath);
  };

  try {
    const result = await writeJsonAtomic(target, { value: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.tempCleanup.code, 'cleanup-failed');
  } finally {
    fs.unlinkSync = original;
  }

  const temporaryFiles = fs.readdirSync(directory).filter((entry) => entry.endsWith('.tmp'));
  assert.equal(temporaryFiles.length, 1);
});

test('a failed write reports both its error and cleanup failure', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'destination');
  fs.mkdirSync(target);

  const original = fs.rmSync;
  fs.rmSync = function (targetPath, options) {
    if (targetPath === lockPathFor(target)) {
      const error = new Error('Injected busy lock');
      error.code = 'EBUSY';
      throw error;
    }
    return original.call(fs, targetPath, options);
  };

  try {
    const result = await writeJsonAtomic(target, { value: 1 });
    assert.equal(result.ok, false);
    assert.ok(result.message);
    assert.equal(result.cleanup.code, 'cleanup-failed');
  } finally {
    fs.rmSync = original;
  }
});

test('a lock owned by another operation is not removed', async (t) => {
  const { directory, filePath } = makeDataFile(t);
  const lock = await acquireFileLock(filePath);
  assert.equal(lock.ok, true);

  const ownerPath = path.join(lockPathFor(filePath), 'owner.json');
  fs.writeFileSync(ownerPath, JSON.stringify({
    token: 'another-operation',
    pid: 999999,
    createdAt: '2026-01-01T00:00:00.000Z',
  }), 'utf8');

  const released = await lock.release();

  assert.equal(released.ok, false);
  assert.equal(released.code, 'lock-not-owned');
  assert.equal(fs.existsSync(lockPathFor(filePath)), true);

  fs.rmSync(lockPathFor(filePath), { recursive: true, force: true });
  assert.deepEqual(fs.readdirSync(directory), ['data.json']);
});
