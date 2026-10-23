import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedArticleBody, escapedTitle, verifyArticleHtml } from '../scripts/article-output.mjs';

const page = (post) => [
  '<!doctype html><html><body>',
  '<section data-article="page"><h1 data-article="title">',
  escapedTitle(post.title),
  '</h1><div data-article="body" class="prose prose-invert">',
  expectedArticleBody(post.body),
  '</div></section>',
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

test('hard breaks and literal HTML compare correctly against SSR', () => {
  const hardBreak = { title: 'Hard Break', body: 'Hard  \nbreak.' };
  const literalHtml = { title: 'Literal HTML', body: 'Text <b>literal tag</b> after.' };

  assert.deepEqual(verifyArticleHtml(page(hardBreak), hardBreak), []);
  assert.deepEqual(verifyArticleHtml(page(literalHtml), literalHtml), []);
});

test('a wrong visible heading is rejected even when metadata matches', () => {
  const target = { title: 'Target Title', body: 'Shared opening.' };
  const wrongRoute = { title: 'Different Heading', body: 'Shared opening.' };

  assert.ok(
    verifyArticleHtml(page(wrongRoute), target).includes('article title does not match'),
  );
});

test('a different article sharing a paragraph is rejected', () => {
  const target = { title: 'Target Title', body: 'Shared opening.' };
  const wrongRoute = {
    title: 'Target Title',
    body: 'Shared opening.\n\n## Different article\n\nUnrelated content.',
  };

  assert.ok(
    verifyArticleHtml(page(wrongRoute), target).includes('article body content does not match'),
  );
});

test('truncated and extended bodies are rejected', () => {
  const post = { title: 'Expected', body: 'First paragraph.\n\nSecond paragraph.' };
  const truncated = { title: post.title, body: 'First paragraph.' };
  const extended = { title: post.title, body: `${post.body}\n\nExtra paragraph.` };

  assert.ok(verifyArticleHtml(page(truncated), post).includes('article body content does not match'));
  assert.ok(verifyArticleHtml(page(extended), post).includes('article body content does not match'));
});

test('missing markers and missing prose styling are rejected', () => {
  const post = { title: 'Expected', body: 'Body.' };
  const noMarkers = '<div id="root"></div>';

  assert.deepEqual(verifyArticleHtml(noMarkers, post), [
    'article page marker is missing or duplicated',
    'article title marker is missing or duplicated',
    'article body marker is missing or duplicated',
  ]);
  assert.ok(
    verifyArticleHtml(page(post).replace('class="prose prose-invert"', ''), post)
      .includes('article body wrapper is missing'),
  );
});
