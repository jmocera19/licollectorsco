import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedArticleBody, escapedTitle, verifyArticleHtml } from '../scripts/article-output.mjs';

const page = (post) => [
  '<!doctype html><html><body>',
  '<div id="root"><section data-article="page"><h1 data-article="title">',
  escapedTitle(post.title),
  '</h1><div data-article="body" class="prose prose-invert">',
  expectedArticleBody(post.body),
  '</div></section></div>',
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

test('literal element text is not interchangeable with actual markup', () => {
  const post = { title: 'Literal tags', body: 'Text <em>literal tag</em> after.' };
  const changed = page(post).replace(
    expectedArticleBody(post.body),
    '<p>Text <em>literal tag</em> after.</p>',
  );

  assert.ok(verifyArticleHtml(changed, post).includes('article body content does not match'));
});

test('article markers must identify visible content inside the app and article', () => {
  const post = { title: 'Visible heading', body: 'Visible body.' };
  const html = page(post);
  const heading = `<h1 data-article="title">${post.title}</h1>`;
  const body = `<div data-article="body" class="prose prose-invert">${expectedArticleBody(post.body)}</div>`;
  const cases = {
    'hidden heading substitute': html.replace(heading, `<span hidden data-article="title">${post.title}</span>`),
    'wrong heading level': html.replace(heading, `<h2 data-article="title">${post.title}</h2>`),
    'hidden heading': html.replace('<h1 data-article', '<h1 hidden data-article'),
    'hidden body': html.replace('<div data-article="body"', '<div hidden data-article="body"'),
    'hidden ancestor': html.replace('<div id="root">', '<div id="root" hidden>'),
    'ARIA-hidden ancestor': html.replace('<section data-article', '<section aria-hidden="true" data-article'),
    'display-none ancestor': html.replace('<section data-article', '<section style="display: none !important" data-article'),
    'invisible body': html.replace('class="prose prose-invert"', 'class="prose invisible"'),
    'zero-opacity heading': html.replace('<h1 data-article', '<h1 style="opacity: 0" data-article'),
    'heading outside article': html.replace(heading, '').replace('</section>', `</section>${heading}`),
    'body outside article': html.replace(body, '').replace('</section>', `</section>${body}`),
    'article outside root': html.replace('<div id="root">', '<div id="root"></div><div>'),
    'duplicate app roots': html.replace('<div id="root">', '<div id="root"></div><div id="root">'),
    'duplicate article markers': html.replace('</section>', '</section><section data-article="page"></section>'),
    'heading nested in prose': html.replace(heading, '').replace(expectedArticleBody(post.body), `${heading}${expectedArticleBody(post.body)}`),
  };

  for (const [name, changed] of Object.entries(cases)) {
    assert.notDeepEqual(verifyArticleHtml(changed, post), [], name);
  }
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
