import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { parse, parseFragment } from 'parse5';
import { isDeepStrictEqual } from 'node:util';
import { articleSeo, renderSeoBlock } from '../shared/seo.js';

const attribute = (node, name) => (
  (node.attrs || []).find((entry) => entry.name === name)?.value
);

const findAll = (node, predicate, found = []) => {
  if (predicate(node)) found.push(node);
  for (const child of node.childNodes || []) findAll(child, predicate, found);
  return found;
};

// Typed nodes keep literal markup text distinct from elements and attribute
// values. Only hydration comments disappear; adjacent text is then joined
// without trimming or collapsing meaningful whitespace.
const bodyTree = (node) => {
  const children = [];
  for (const child of node.content?.childNodes || node.childNodes || []) {
    if (child.nodeName === '#comment') continue;
    if (child.nodeName === '#text') {
      const previous = children.at(-1);
      if (previous?.kind === 'text') previous.value += child.value;
      else children.push({ kind: 'text', value: child.value });
      continue;
    }

    const attributes = (child.attrs || [])
      .map(({ name, value, namespace = '', prefix = '' }) => ({ name, value, namespace, prefix }))
      .sort((left, right) => {
        const a = JSON.stringify([left.namespace, left.prefix, left.name]);
        const b = JSON.stringify([right.namespace, right.prefix, right.name]);
        return a < b ? -1 : a > b ? 1 : 0;
      });
    children.push({
      kind: 'element',
      name: child.tagName,
      namespace: child.namespaceURI,
      attributes,
      children: bodyTree(child),
    });
  }
  return children;
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

const inside = (node, ancestor) => {
  for (let parent = node?.parentNode; parent; parent = parent.parentNode) {
    if (parent === ancestor) return true;
  }
  return false;
};

const hidden = (node) => {
  for (let current = node; current; current = current.parentNode) {
    if (attribute(current, 'hidden') !== undefined
      || attribute(current, 'aria-hidden')?.trim().toLowerCase() === 'true'
      || /(?:^|\s)(?:hidden|invisible|sr-only)(?:\s|$)/.test(attribute(current, 'class') || '')) return true;

    const style = (attribute(current, 'style') || '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const declaration of style.split(';')) {
      const [property, ...parts] = declaration.toLowerCase().split(':');
      const value = parts.join(':').trim().replace(/\s*!important\s*$/, '');
      if ((property.trim() === 'display' && value === 'none')
        || (property.trim() === 'visibility' && ['hidden', 'collapse'].includes(value))
        || (property.trim() === 'content-visibility' && value === 'hidden')
        || (property.trim() === 'opacity' && value !== '' && Number(value) === 0)) return true;
    }
  }
  return false;
};

const headingText = (node) => {
  if (hidden(node) || ['script', 'style', 'template'].includes(node.tagName)) return '';
  if (node.nodeName === '#text') return node.value;
  if (node.nodeName === '#comment') return '';
  return (node.childNodes || []).map(headingText).join('');
};

const expectedBodyTree = (body) => {
  // React hoists resource hints outside this wrapper, just as it does outside
  // the production article. Do not discard arbitrary link/meta elements from
  // inside the actual prose subtree.
  const html = renderToString(React.createElement(
    'div',
    { 'data-expected-article-body': '' },
    React.createElement(ReactMarkdown, null, body),
  ));
  const fragment = parseFragment(html);
  const [wrapper] = findAll(fragment, (node) => attribute(node, 'data-expected-article-body') !== undefined);
  return bodyTree(wrapper);
};

// Verifies the route's actual visible article heading and complete prose
// subtree. Whole-document substring matches are deliberately not used.
export const verifyArticleHtml = (html, post) => {
  const document = parse(html);
  const problems = [];

  const roots = findAll(document, (node) => attribute(node, 'id') === 'root');
  const pages = articlePart(document, 'page');
  const titles = articlePart(document, 'title');
  const bodies = articlePart(document, 'body');

  if (pages.length !== 1) problems.push('article page marker is missing or duplicated');
  if (titles.length !== 1) problems.push('article title marker is missing or duplicated');
  if (bodies.length !== 1) problems.push('article body marker is missing or duplicated');

  const [root] = roots;
  const [page] = pages;
  const [title] = titles;
  const [body] = bodies;
  if (roots.length !== 1 || (page && !inside(page, root))) {
    problems.push('article must be inside one app root');
  }
  if (page && (!['article', 'section'].includes(page.tagName) || hidden(page))) {
    problems.push('article page must be a visible article or section');
  }
  if (title && (title.tagName !== 'h1' || !inside(title, page)
    || inside(title, body) || hidden(title))) {
    problems.push('article title must be a visible H1 inside the article and outside the prose');
  }
  if (body && (!inside(body, page) || inside(body, title) || hidden(body))) {
    problems.push('article body must be visible inside the article');
  }

  if (titles.length === 1 && headingText(titles[0]) !== post.title) {
    problems.push('article title does not match');
  }

  if (bodies.length === 1) {
    if (!/(^|\s)prose(\s|$)/.test(attribute(bodies[0], 'class') || '')) {
      problems.push('article body wrapper is missing');
    }
    if (!isDeepStrictEqual(bodyTree(bodies[0]), expectedBodyTree(post.body))) {
      problems.push('article body content does not match');
    }
  }

  return problems;
};

// The complete output check used by both production builds and fixture builds.
export const verifyArticleDocument = (html, post) => {
  const problems = verifyArticleHtml(html, post);
  const document = parse(html);
  const [head] = findAll(document, (node) => node.tagName === 'head');
  const expected = parseFragment(renderSeoBlock(articleSeo(post)));
  const fields = findAll(expected, (node) => attribute(node, 'data-seo') !== undefined);
  for (const field of fields) {
    const name = attribute(field, 'data-seo');
    const actual = findAll(document, (node) => attribute(node, 'data-seo') === name);
    if (actual.length !== 1 || !inside(actual[0], head)
      || !isDeepStrictEqual(bodyTree({ childNodes: actual }), bodyTree({ childNodes: [field] }))) {
      problems.push(`article ${name} metadata does not match`);
    }
  }
  return problems;
};
