import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedArticleBody, escapedTitle, verifyArticleHtml } from '../scripts/article-output.mjs';

const page = (post) => [
  '<!doctype html><html><body>',
  '<div id="root"><div><h1>',
  escapedTitle(post.title),
  '</h1><div class="prose prose-invert">',
  expectedArticleBody(post.body),
  '</div></div></div>',
  '</body></html>',
].join('');

test('paragraph-only articles pass content verification', () => {
  const post = { title: 'Short Update', body: 'A single paragraph without subheadings.' };

  assert.deepEqual(verifyArticleHtml(page(post), post), []);
});

test('H1-only and very short articles pass content verification', () => {
  const headingOnly = { title: 'Heading Only', body: '# Only a heading' };
  const short = { title: 'Brief', body: 'Short.' };

  assert.deepEqual(verifyArticleHtml(page(headingOnly), headingOnly), []);
  assert.deepEqual(verifyArticleHtml(page(short), short), []);
});

test('missing or wrong rendered content still fails verification', () => {
  const post = { title: 'Expected Title', body: 'Expected body text.' };
  const wrongBody = { title: post.title, body: 'Different body text.' };

  assert.ok(verifyArticleHtml(page(wrongBody), post).includes('missing article body content'));
  assert.ok(verifyArticleHtml('<div id="root"></div>', post).includes('missing app markup'));
  assert.ok(verifyArticleHtml(
    `<div id="root"><div><div class="prose">${expectedArticleBody(post.body)}</div></div></div>`,
    post,
  ).includes('missing article title'));
});
