import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';

const notFoundDocument = '<!doctype html><meta name="robots" content="noindex"><h1>Not Found</h1>';

// Cloudflare's asset server serves pretty paths. Explicit .html paths are
// redirected, so internal fetches must not use them.
const htmlRedirectFor = (pathname) => {
  if (pathname === '/404.html') return '/404';
  if (pathname.endsWith('/index.html')) return pathname.slice(0, -'index.html'.length);
  if (pathname.endsWith('.html')) return pathname.slice(0, -'.html'.length);
  return null;
};

const run = async ({
  url,
  accept = 'text/html',
  method = 'GET',
  assets = { '/404': { body: notFoundDocument } },
} = {}) => {
  const requested = [];
  let nextCalled = false;

  const context = {
    request: new Request(url, {
      method,
      headers: accept ? { accept } : {},
    }),
    env: {
      ASSETS: {
        fetch: async (input) => {
          const pathname = new URL(input).pathname;
          requested.push(pathname);

          const redirect = htmlRedirectFor(pathname);
          if (redirect) {
            return new Response('', { status: 308, headers: { location: redirect } });
          }

          const asset = assets[pathname];
          if (!asset) return new Response('missing', { status: 404 });
          return new Response(asset.body, {
            status: asset.status ?? 200,
            headers: { 'content-type': asset.type ?? 'text/html; charset=utf-8' },
          });
        },
      },
    },
    next: async () => {
      nextCalled = true;
      return new Response('spa', { status: 200, headers: { 'content-type': 'text/html' } });
    },
  };

  return { response: await onRequest(context), requested, nextCalled };
};

test('www redirects to the apex host and preserves query strings', async () => {
  const { response, requested, nextCalled } = await run({ url: 'https://www.licollectorsco.com/blog?page=2' });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://licollectorsco.com/blog?page=2');
  assert.deepEqual(requested, []);
  assert.equal(nextCalled, false);
});

test('trailing slashes redirect without dropping the query string', async () => {
  const { response } = await run({ url: 'https://licollectorsco.com/blog/known/?page=2' });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://licollectorsco.com/blog/known?page=2');
});

test('the home page falls through to the SPA shell', async () => {
  const { response, nextCalled } = await run({ url: 'https://licollectorsco.com/' });

  assert.equal(response.status, 200);
  assert.equal(nextCalled, true);
});

test('prerendered blog pages are served directly through pretty paths', async () => {
  const assets = {
    '/404': { body: notFoundDocument },
    '/blog/': { body: '<h1>Blog</h1>' },
    '/blog/known-post/': { body: '<h1>Known</h1>' },
  };

  const index = await run({ url: 'https://licollectorsco.com/blog', assets });
  const post = await run({ url: 'https://licollectorsco.com/blog/known-post', assets });

  assert.equal(index.response.status, 200);
  assert.equal(await index.response.text(), '<h1>Blog</h1>');
  assert.equal(post.response.status, 200);
  assert.equal(await post.response.text(), '<h1>Known</h1>');
  assert.deepEqual(index.requested, ['/blog/']);
  assert.deepEqual(post.requested, ['/blog/known-post/']);
});

test('a missing blog post returns the 404 document with status 404', async () => {
  const { response, requested } = await run({ url: 'https://licollectorsco.com/blog/missing-post' });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('location'), null);
  assert.match(await response.text(), /noindex/);
  assert.deepEqual(requested, ['/blog/missing-post/', '/404']);
});

test('an unknown page returns 404 instead of the SPA shell', async () => {
  const { response, requested, nextCalled } = await run({ url: 'https://licollectorsco.com/unknown' });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('location'), null);
  assert.equal(nextCalled, false);
  assert.deepEqual(requested, ['/404']);
});

test('non-navigation requests still reach assets', async () => {
  const { response, nextCalled } = await run({
    url: 'https://licollectorsco.com/assets/app.js',
    accept: '*/*',
  });

  assert.equal(response.status, 200);
  assert.equal(nextCalled, true);
});

test('image navigation and non-GET requests are not treated as pages', async () => {
  const image = await run({
    url: 'https://licollectorsco.com/og_preview.jpg',
    accept: 'image/avif,image/webp',
  });
  const post = await run({
    url: 'https://licollectorsco.com/form',
    method: 'POST',
    accept: 'text/html',
  });

  assert.equal(image.nextCalled, true);
  assert.equal(post.nextCalled, true);
});

test('missing 404 documents fall back to an inline noindex page', async () => {
  const { response } = await run({
    url: 'https://licollectorsco.com/unknown',
    assets: {},
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /noindex/);
});

test('middleware never requests explicit .html asset paths', async () => {
  const blog = await run({ url: 'https://licollectorsco.com/blog/known-post' });
  const missing = await run({ url: 'https://licollectorsco.com/blog/missing-post' });

  assert.ok(blog.requested.every((pathname) => !pathname.endsWith('.html')));
  assert.ok(missing.requested.every((pathname) => !pathname.endsWith('.html')));
});
