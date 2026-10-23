// Content contract shared by the Manager (CommonJS) and the ESM build/import
// scripts. Keep this module free of Electron and browser APIs so every reader
// and writer validates the same shapes and performs the same safe operations.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ITEM_ID_RE = /^\d{9,15}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SLUG_LENGTH = 80;
const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 300;
const MAX_BODY_LENGTH = 200_000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidItemId = (value) => typeof value === 'string' && ITEM_ID_RE.test(value);

const isValidSlug = (value) => typeof value === 'string'
  && value.length >= 1
  && value.length <= MAX_SLUG_LENGTH
  && SLUG_RE.test(value);

const isValidDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

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

const validatePostsData = (data) => {
  if (!isPlainObject(data)) return 'posts.json does not contain a JSON object.';
  if (!Array.isArray(data.posts)) return 'posts.json does not contain a posts array.';

  const slugs = new Set();
  for (const [index, post] of data.posts.entries()) {
    const label = `posts.json entry ${index + 1}`;
    if (!isPlainObject(post)) return `${label} is not an object.`;
    if (typeof post.id !== 'string' || !post.id) return `${label} is missing a string id.`;
    if (!isValidSlug(post.slug)) return `${label} has an invalid slug.`;
    if (typeof post.title !== 'string' || !post.title) return `${label} is missing a string title.`;
    if (!isValidDate(post.date)) return `${label} has an invalid date; use YYYY-MM-DD.`;
    if (!Array.isArray(post.tags) || post.tags.some((tag) => typeof tag !== 'string')) {
      return `${label} must have a tags array of strings.`;
    }
    if (typeof post.excerpt !== 'string' || !post.excerpt) return `${label} is missing a string excerpt.`;
    if (typeof post.body !== 'string' || !post.body) return `${label} is missing a string body.`;
    if (slugs.has(post.slug)) return `posts.json contains duplicate slug "${post.slug}".`;
    slugs.add(post.slug);
  }

  return null;
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

const fingerprint = (raw) => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 25;

const lockPathFor = (filePath) => `${filePath}.lock`;

const readLockOwner = (lockPath) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch (error) {
    return null;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cross-process lock: mkdir is atomic, so only one writer can own the lock.
// A lock is never removed automatically: a crashed owner may still be alive,
// and reclaiming it requires confirming that no writer is active.
const acquireFileLock = async (filePath, {
  timeoutMs = LOCK_TIMEOUT_MS,
  retryMs = LOCK_RETRY_MS,
} = {}) => {
  const lockPath = lockPathFor(filePath);
  const token = crypto.randomBytes(16).toString('hex');
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      try {
        fs.writeFileSync(
          path.join(lockPath, 'owner.json'),
          JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }),
          'utf8',
        );
      } catch (error) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        return { ok: false, code: 'lock-failed', message: error.message };
      }

      return {
        ok: true,
        path: lockPath,
        async release() {
          const owner = readLockOwner(lockPath);
          if (!owner || owner.token !== token) {
            return {
              ok: false,
              code: 'lock-not-owned',
              message: 'The lock is no longer owned by this operation; it was left in place.',
              path: lockPath,
            };
          }

          let lastError;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              fs.rmSync(lockPath, { recursive: true, force: true });
              return { ok: true };
            } catch (error) {
              lastError = error;
              if (attempt < 2) await sleep(10);
            }
          }

          return {
            ok: false,
            code: 'cleanup-failed',
            message: lastError.message,
            path: lockPath,
          };
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        return { ok: false, code: 'lock-failed', message: error.message };
      }

      if (Date.now() >= deadline) {
        const owner = readLockOwner(lockPath);
        const ownerDetail = owner
          ? ` Held by PID ${owner.pid} since ${owner.createdAt}.`
          : '';
        return {
          ok: false,
          code: 'locked',
          owner,
          message: `Another writer is using ${path.basename(filePath)}.${ownerDetail} If no writer is active, confirm and remove ${lockPath}.`,
        };
      }

      await sleep(retryMs);
    }
  }
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

  return { status: 'ok', data: parsed, fingerprint: fingerprint(raw) };
};

const readPostsFile = (filePath) => {
  const result = readJsonFile(filePath, validatePostsData);
  if (result.status !== 'ok') {
    throw new Error(`${path.basename(filePath)} is invalid (${result.step}): ${result.message}`);
  }
  return result.data.posts;
};

// Atomic JSON write: unique temp file in the destination directory, then a
// same-volume rename (Windows: MoveFileEx REPLACE_EXISTING). Coordination uses
// a per-file lock so fingerprint comparison and replacement are one critical
// section across Manager and CLI processes. On failure only this operation's
// own temp file is removed and the destination is untouched. Cleanup failures
// are attached to the result so callers can report "saved, cleanup required".
const cleanupTempFile = async (temporaryPath) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!fs.existsSync(temporaryPath)) return { ok: true };
      fs.unlinkSync(temporaryPath);
      return { ok: true };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(10);
    }
  }
  return {
    ok: false,
    code: 'cleanup-failed',
    message: lastError.message,
    path: temporaryPath,
  };
};

const writeWithoutLock = async (filePath, value, { expectedFingerprint } = {}) => {
  if (expectedFingerprint !== undefined) {
    let current;
    try {
      current = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      return {
        ok: false,
        code: error.code === 'ENOENT' ? 'missing' : 'read-failed',
        message: error.message,
      };
    }
    if (fingerprint(current) !== expectedFingerprint) {
      return {
        ok: false,
        code: 'stale',
        message: 'The file changed after it was read. Reload the content and retry.',
      };
    }
  }

  const temporaryPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
    return { ok: true };
  } catch (error) {
    const tempCleanup = await cleanupTempFile(temporaryPath);
    return {
      ok: false,
      message: error.message,
      code: error.code,
      ...(tempCleanup.ok ? {} : { tempCleanup }),
    };
  }
};

const writeJsonAtomic = async (filePath, value, { expectedFingerprint, lockTimeoutMs } = {}) => {
  const lock = await acquireFileLock(filePath, { timeoutMs: lockTimeoutMs });
  if (!lock.ok) {
    return { ok: false, code: lock.code, message: lock.message, owner: lock.owner };
  }

  let result;
  try {
    result = await writeWithoutLock(filePath, value, { expectedFingerprint });
  } catch (error) {
    result = { ok: false, message: error.message, code: error.code };
  } finally {
    const cleanup = await lock.release();
    if (!cleanup.ok) {
      result = { ...result, cleanup };
    }
  }

  return result;
};

const upsertVaultItem = (data, item) => {
  const vault = Array.isArray(data.vault) ? [...data.vault] : [];
  const index = vault.findIndex((entry) => isPlainObject(entry) && entry.id === item.id);
  if (index >= 0) {
    vault[index] = item;
  } else {
    vault.push(item);
  }
  return { data: { ...data, vault }, added: index < 0 };
};

const removeVaultItem = (data, id) => {
  const vault = Array.isArray(data.vault) ? data.vault : [];
  const remaining = vault.filter((entry) => !(isPlainObject(entry) && entry.id === id));
  return {
    data: { ...data, vault: remaining },
    removed: remaining.length !== vault.length,
  };
};

const applyPostPublish = (data, canonical, { overwrite = false, date }) => {
  const existing = data.posts.find((entry) => isPlainObject(entry) && entry.slug === canonical.slug);

  if (existing && !overwrite) {
    return {
      status: 'conflict',
      existing: {
        title: typeof existing.title === 'string' ? existing.title : canonical.slug,
        date: typeof existing.date === 'string' ? existing.date : null,
      },
    };
  }

  const publishedDate = existing ? existing.date : date;
  const post = {
    id: canonical.slug,
    slug: canonical.slug,
    title: canonical.title,
    date: publishedDate,
    tags: canonical.tags,
    excerpt: canonical.excerpt,
    body: canonical.body,
  };

  return {
    status: 'published',
    created: !existing,
    post,
    data: {
      ...data,
      posts: [post, ...data.posts.filter((entry) => !(isPlainObject(entry) && entry.slug === canonical.slug))],
    },
  };
};

const applyPostDelete = (data, slug) => {
  const remaining = data.posts.filter((entry) => !(isPlainObject(entry) && entry.slug === slug));
  return {
    data: { ...data, posts: remaining },
    removed: remaining.length !== data.posts.length,
  };
};

module.exports = {
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_EXCERPT_LENGTH,
  MAX_BODY_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  isPlainObject,
  isValidItemId,
  isValidSlug,
  isValidDate,
  normalizeTags,
  validatePostPayload,
  validatePostsData,
  validateVaultData,
  fingerprint,
  acquireFileLock,
  lockPathFor,
  readJsonFile,
  readPostsFile,
  writeJsonAtomic,
  upsertVaultItem,
  removeVaultItem,
  applyPostPublish,
  applyPostDelete,
};
