import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

export const expectedArticleBody = (body) => renderToStaticMarkup(
  React.createElement(ReactMarkdown, null, body),
);

export const escapedTitle = (title) => {
  const rendered = renderToStaticMarkup(React.createElement('span', null, title));
  return rendered.slice('<span>'.length, -'</span>'.length);
};

// Verifies the article's actual rendered content, not editorial structure such
// as heading levels or output size.
export const verifyArticleHtml = (html, post) => {
  const problems = [];

  if (html.includes('<div id="root"></div>') || !html.includes('<div id="root"><div')) {
    problems.push('missing app markup');
  }
  if (!html.includes('class="prose')) {
    problems.push('missing article body wrapper');
  }
  if (!html.includes(escapedTitle(post.title))) {
    problems.push('missing article title');
  }
  if (!html.includes(expectedArticleBody(post.body))) {
    problems.push('missing article body content');
  }

  return problems;
};
