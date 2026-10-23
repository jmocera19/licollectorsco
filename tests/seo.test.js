import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  articleSeo,
  blogSeo,
  homeSeo,
  notFoundSeo,
  renderSeoBlock,
  SEO_BLOCK_PATTERN,
  SITE_URL,
} from '../shared/seo.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const posts = [
  {
    slug: 'older-post',
    title: 'Older Post',
    date: '2025-01-02',
    excerpt: 'An older excerpt.',
  },
  {
    slug: 'newer-post',
    title: 'Newer Post',
    date: '2026-03-04',
    excerpt: 'A newer excerpt.',
  },
];

test('home metadata matches the static document shipped by Vite', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const match = source.match(SEO_BLOCK_PATTERN);
  const normalize = (value) => value.replaceAll('\r\n', '\n').trim();

  assert.ok(match, 'index.html must contain the SEO block');
  assert.equal(normalize(match[0]), normalize(renderSeoBlock(homeSeo())));
});

test('home metadata uses one canonical URL and store JSON-LD', () => {
  const seo = homeSeo();

  assert.equal(seo.canonicalUrl, `${SITE_URL}/`);
  assert.equal(seo.type, 'website');
  assert.equal(seo.structuredData['@type'], 'Store');
  assert.equal(seo.structuredData.url, seo.canonicalUrl);
});

test('blog metadata and structured data share the same description', () => {
  const seo = blogSeo(posts);

  assert.equal(seo.canonicalUrl, `${SITE_URL}/blog`);
  assert.equal(seo.structuredData.description, seo.description);
});

test('blog structured data lists posts newest first', () => {
  const seo = blogSeo(posts);
  const ordered = seo.structuredData.blogPost;

  assert.deepEqual(
    ordered.map((entry) => entry.url),
    [`${SITE_URL}/blog/newer-post`, `${SITE_URL}/blog/older-post`],
  );
});

test('article metadata carries canonical URL, publication date, and JSON-LD', () => {
  const seo = articleSeo(posts[1]);

  assert.equal(seo.title, 'Newer Post | LI Collectors Co.');
  assert.equal(seo.canonicalUrl, `${SITE_URL}/blog/newer-post`);
  assert.equal(seo.type, 'article');
  assert.equal(seo.publishedTime, '2026-03-04');
  assert.equal(seo.structuredData.mainEntityOfPage, seo.canonicalUrl);
  assert.equal(seo.structuredData.image, `${SITE_URL}/og_preview.jpg`);
});

test('static rendering escapes markup and only adds publication date for articles', () => {
  const articleBlock = renderSeoBlock(articleSeo({
    slug: 'quotes',
    title: 'PSA 10 & <b>Value</b>',
    date: '2026-01-01',
    excerpt: 'Use "quotes" safely.',
  }));
  const homeBlock = renderSeoBlock(homeSeo());

  assert.match(articleBlock, /PSA 10 &amp; &lt;b&gt;Value&lt;\/b&gt;/);
  assert.match(articleBlock, /article:published_time/);
  assert.doesNotMatch(homeBlock, /article:published_time/);
});

test('missing-post metadata is noindex and does not emit canonical or JSON-LD', () => {
  const seo = notFoundSeo('gone');

  assert.equal(seo.noIndex, true);
  assert.equal(seo.canonicalUrl, undefined);
  assert.equal(seo.structuredData, undefined);
  assert.match(renderSeoBlock(seo), /content="noindex, follow"/);
  assert.doesNotMatch(renderSeoBlock(seo), /rel="canonical"/);
});
