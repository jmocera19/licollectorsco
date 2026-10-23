import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { parse, parseFragment } from 'parse5';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

const RESOURCE_HINTS = new Set(['link', 'meta']);

const attribute = (node, name) => (
  (node.attrs || []).find((entry) => entry.name === name)?.value
);

const findAll = (node, predicate, found = []) => {
  if (predicate(node)) found.push(node);
  for (const child of node.childNodes || []) findAll(child, predicate, found);
  return found;
};

const textContent = (node) => {
  if (node.nodeName === '#text') return node.value;
  if (node.nodeName === '#comment') return '';
  return (node.childNodes || []).map(textContent).join('');
};

// Comments are React hydration separators; resource hints are injected by the
// renderer. Neither carries article meaning, so both are ignored. Everything
// else—tags, attributes, text, and whitespace—is compared exactly.
const canonicalize = (node) => {
  if (node.nodeName === '#comment') return '';
  if (node.nodeName === '#text') return node.value;
  if (RESOURCE_HINTS.has(node.tagName)) return '';

  const attrs = (node.attrs || [])
    .map(({ name, value }) => ` ${name}="${value}"`)
    .join('');
  const children = (node.childNodes || []).map(canonicalize).join('');

  if (VOID_ELEMENTS.has(node.tagName)) return `<${node.tagName}${attrs}>`;
  return `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
};

export const expectedArticleBody = (body) => renderToString(
  React.createElement(ReactMarkdown, null, body),
);

export const escapedTitle = (title) => {
  const rendered = renderToString(React.createElement('span', null, title));
  return rendered.slice('<span>'.length, -'</span>'.length);
};

const articlePart = (document, name) => findAll(
  document,
  (node) => attribute(node, 'data-article') === name,
);

const bodyMarkup = (html) => (parseFragment(html).childNodes || []).map(canonicalize).join('');

const bodyTree = (node) => (node.childNodes || []).map(canonicalize).join('');

// Verifies the route's actual visible article heading and complete prose
// subtree. Whole-document substring matches are deliberately not used.
export const verifyArticleHtml = (html, post) => {
  const document = parse(html);
  const problems = [];

  const pages = articlePart(document, 'page');
  const titles = articlePart(document, 'title');
  const bodies = articlePart(document, 'body');

  if (pages.length !== 1) problems.push('article page marker is missing or duplicated');
  if (titles.length !== 1) problems.push('article title marker is missing or duplicated');
  if (bodies.length !== 1) problems.push('article body marker is missing or duplicated');

  if (titles.length === 1 && textContent(titles[0]) !== post.title) {
    problems.push('article title does not match');
  }

  if (bodies.length === 1) {
    if (!/(^|\s)prose(\s|$)/.test(attribute(bodies[0], 'class') || '')) {
      problems.push('article body wrapper is missing');
    }
    if (bodyTree(bodies[0]) !== bodyMarkup(expectedArticleBody(post.body))) {
      problems.push('article body content does not match');
    }
  }

  return problems;
};
