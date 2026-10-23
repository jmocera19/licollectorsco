import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPostsFile } from '../shared/content.cjs';
import { expectedArticleBody, escapedTitle, verifyArticleHtml } from '../scripts/article-output.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distPath = path.join(projectRoot, 'dist');
const posts = readPostsFile(path.join(projectRoot, 'src', 'posts.json'));

test('every article ships server-rendered content', () => {
  for (const post of posts) {
    const html = fs.readFileSync(
      path.join(distPath, 'blog', post.slug, 'index.html'),
      'utf8',
    );

    assert.deepEqual(verifyArticleHtml(html, post), [], `${post.slug} rendered correctly`);
    assert.ok(html.includes(expectedArticleBody(post.body)), `${post.slug} includes its markdown body`);
    assert.ok(html.includes(escapedTitle(post.title)), `${post.slug} includes its title`);
  }
});

test('prerendered articles keep route-specific SEO tags', () => {
  for (const post of posts) {
    const html = fs.readFileSync(
      path.join(distPath, 'blog', post.slug, 'index.html'),
      'utf8',
    );

    assert.match(html, new RegExp(`<link data-seo="canonical" rel="canonical" href="https://licollectorsco.com/blog/${post.slug}"`));
    assert.match(html, /"@type":"BlogPosting"/);
    assert.match(html, /<meta data-seo="robots" name="robots" content="index, follow"/);
  }
});

test('template replacements preserve literal generated text', () => {
  const home = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
  const jsonLd = home.match(/<script data-seo="structured-data"[^>]*>([\s\S]*?)<\/script>/);

  assert.ok(jsonLd, 'home page must contain JSON-LD');
  assert.equal(JSON.parse(jsonLd[1]).priceRange, '$$');
});

test('the 404 document omits absent metadata instead of writing placeholders', () => {
  const html = fs.readFileSync(path.join(distPath, '404.html'), 'utf8');

  assert.match(html, /content="noindex, follow"/);
  assert.doesNotMatch(html, /content="undefined"/);
  assert.doesNotMatch(html, /application\/ld\+json/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /og:url/);
});
