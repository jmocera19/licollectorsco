import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPostsFile } from '../shared/content.cjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distPath = path.join(projectRoot, 'dist');
const posts = readPostsFile(path.join(projectRoot, 'src', 'posts.json'));

test('every article ships server-rendered content', () => {
  for (const post of posts) {
    const html = fs.readFileSync(
      path.join(distPath, 'blog', post.slug, 'index.html'),
      'utf8',
    );

    assert.match(html, /<div id="root"><div/, `${post.slug} has app markup`);
    assert.doesNotMatch(html, /<div id="root"><\/div>/, `${post.slug} is not an empty shell`);
    assert.match(html, /class="prose/, `${post.slug} includes the article body`);
    assert.match(html, /<h[2-3][^>]*>/, `${post.slug} includes rendered markdown headings`);
    assert.ok(html.length > 10_000, `${post.slug} contains full article HTML`);
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
