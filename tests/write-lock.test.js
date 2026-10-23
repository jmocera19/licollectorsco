import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lockPathFor, readJsonFile, writeJsonAtomic } = require('../shared/content.cjs');

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
