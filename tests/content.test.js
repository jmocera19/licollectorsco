import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyPostDelete,
  applyPostPublish,
  readJsonFile,
  readPostsFile,
  removeVaultItem,
  upsertVaultItem,
  validatePostsData,
  validateVaultData,
  writeJsonAtomic,
} from '../shared/content.cjs';

const validPost = (overrides = {}) => ({
  id: 'valid-post',
  slug: 'valid-post',
  title: 'Valid Post',
  date: '2026-01-15',
  tags: ['PSA'],
  excerpt: 'A valid excerpt.',
  body: '# Heading',
  ...overrides,
});

const postsData = (posts = [validPost()]) => ({
  posts,
  extra: { preserved: true },
});

const tempFile = (t, contents) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-content-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'content.json');
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
};

test('complete posts data passes validation', () => {
  assert.equal(validatePostsData(postsData()), null);
});

test('incomplete, malformed, or duplicate posts are rejected', () => {
  assert.match(validatePostsData(postsData([validPost({ excerpt: '' })])), /excerpt/);
  assert.match(validatePostsData(postsData([validPost({ date: '2026-02-31' })])), /date/);
  assert.match(validatePostsData(postsData([validPost({ tags: 'PSA' })])), /tags/);
  assert.match(
    validatePostsData(postsData([validPost(), validPost({ id: 'second' })])),
    /duplicate slug/,
  );
});

test('vault entries require the fields the site renders', () => {
  assert.equal(validateVaultData({ vault: [{ id: '1', title: 'Card', price: '$1', image: '', url: '' }] }), null);
  assert.match(
    validateVaultData({ vault: [{ id: '1', title: 'Card', price: '$1', image: '' }] }),
    /url/,
  );
});

test('publishing reports a conflict before mutating anything', () => {
  const data = postsData();
  const outcome = applyPostPublish(data, {
    slug: 'valid-post',
    title: 'Replacement',
    tags: [],
    excerpt: 'New excerpt.',
    body: 'New body.',
  }, { overwrite: false, date: '2026-06-01' });

  assert.equal(outcome.status, 'conflict');
  assert.equal(data.posts[0].title, 'Valid Post');
});

test('replacing a post preserves its publication date and unrelated data', () => {
  const outcome = applyPostPublish(postsData(), {
    slug: 'valid-post',
    title: 'Replacement',
    tags: ['TAG'],
    excerpt: 'New excerpt.',
    body: 'New body.',
  }, { overwrite: true, date: '2026-06-01' });

  assert.equal(outcome.status, 'published');
  assert.equal(outcome.created, false);
  assert.equal(outcome.post.date, '2026-01-15');
  assert.equal(outcome.data.posts.length, 1);
  assert.equal(outcome.data.posts[0].title, 'Replacement');
  assert.equal(outcome.data.extra.preserved, true);
});

test('new posts use the supplied date and appear first', () => {
  const outcome = applyPostPublish(postsData(), {
    slug: 'new-post',
    title: 'New Post',
    tags: [],
    excerpt: 'Excerpt.',
    body: 'Body.',
  }, { overwrite: false, date: '2026-06-01' });

  assert.equal(outcome.created, true);
  assert.equal(outcome.post.date, '2026-06-01');
  assert.equal(outcome.data.posts[0].slug, 'new-post');
});

test('deleting a post leaves the rest of the document intact', () => {
  const outcome = applyPostDelete(postsData([validPost(), validPost({ id: 'second', slug: 'second' })]), 'valid-post');

  assert.equal(outcome.removed, true);
  assert.deepEqual(outcome.data.posts.map((post) => post.slug), ['second']);
  assert.equal(outcome.data.extra.preserved, true);

  const missing = applyPostDelete(outcome.data, 'valid-post');
  assert.equal(missing.removed, false);
});

test('vault operations preserve livestream and grading sections', () => {
  const site = {
    livestream: { isLive: false },
    grading: { title: 'Grading' },
    vault: [{ id: '111111111', title: 'Old', price: '$1', image: '', url: '' }],
  };

  const added = upsertVaultItem(site, { id: '222222222', title: 'New', price: '$2', image: '', url: '' });
  assert.equal(added.added, true);
  assert.equal(added.data.livestream.isLive, false);
  assert.equal(added.data.grading.title, 'Grading');
  assert.equal(added.data.vault.length, 2);

  const removed = removeVaultItem(added.data, '111111111');
  assert.equal(removed.removed, true);
  assert.deepEqual(removed.data.vault.map((item) => item.id), ['222222222']);
});

test('atomic writes reject a stale snapshot instead of overwriting it', async (t) => {
  const filePath = tempFile(t, JSON.stringify({ value: 1 }));
  const snapshot = readJsonFile(filePath, () => null);

  assert.equal(snapshot.status, 'ok');
  fs.writeFileSync(filePath, JSON.stringify({ value: 2 }), 'utf8');

  const stale = await writeJsonAtomic(filePath, { value: 3 }, { expectedFingerprint: snapshot.fingerprint });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'stale');
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { value: 2 });

  const current = readJsonFile(filePath, () => null);
  const written = await writeJsonAtomic(filePath, { value: 4 }, { expectedFingerprint: current.fingerprint });
  assert.equal(written.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { value: 4 });
});

test('build readers fail loudly on invalid post data', (t) => {
  const valid = tempFile(t, JSON.stringify(postsData()));
  assert.equal(readPostsFile(valid).length, 1);

  const invalid = tempFile(t, JSON.stringify(postsData([validPost({ body: '' })])));
  assert.throws(() => readPostsFile(invalid), /body/);
});

test('failed atomic writes leave no temporary files behind', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lico-content-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = await writeJsonAtomic(path.join(directory, 'missing', 'content.json'), { value: 1 });

  assert.equal(result.ok, false);
  assert.deepEqual(fs.readdirSync(directory), []);
});
