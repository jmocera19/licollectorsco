import fs from 'node:fs';
import path from 'node:path';
import {
  SEO_BLOCK_PATTERN,
  renderSeoBlock,
  homeSeo,
  blogSeo,
  articleSeo,
  notFoundSeo,
} from '../shared/seo.js';

// Production and fixture builds use the same renderer and on-disk assembly.
export const prerenderSite = ({ distPath, posts, render }) => {
  const templatePath = path.join(distPath, 'index.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  if (!SEO_BLOCK_PATTERN.test(template)) {
    throw new Error('Could not find the SEO block in dist/index.html.');
  }

  const emptyRoot = '<div id="root"></div>';
  const writeRoute = (routePath, seo, url) => {
    let html = template.replace(SEO_BLOCK_PATTERN, () => renderSeoBlock(seo));
    if (url) {
      if (!html.includes(emptyRoot)) throw new Error('Could not find the empty root element in dist/index.html.');
      const markup = render(url);
      if (!markup.includes('class="prose')) throw new Error(`Server rendering produced no article content for ${url}.`);
      html = html.replace(emptyRoot, () => `<div id="root">${markup}</div>`);
    }
    const directory = path.join(distPath, routePath);
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, 'index.html');
    fs.writeFileSync(destination, html, 'utf8');
    if (url) {
      const written = fs.readFileSync(destination, 'utf8');
      if (written.includes(emptyRoot) || !written.includes('<div id="root"><')) {
        throw new Error(`Prerendered article for ${url} is missing app markup.`);
      }
    }
  };

  writeRoute('blog', blogSeo(posts));
  for (const post of posts) writeRoute(path.join('blog', post.slug), articleSeo(post), `/blog/${post.slug}`);
  fs.writeFileSync(templatePath, template.replace(SEO_BLOCK_PATTERN, () => renderSeoBlock(homeSeo())), 'utf8');
  fs.writeFileSync(path.join(distPath, '404.html'), template.replace(SEO_BLOCK_PATTERN, () => renderSeoBlock(notFoundSeo())), 'utf8');
};
