import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SEO_BLOCK_PATTERN,
  renderSeoBlock,
  homeSeo,
  blogSeo,
  articleSeo,
  notFoundSeo,
} from '../shared/seo.js';
import { readPostsFile } from '../shared/content.cjs';
import { render } from '../dist-ssr/entry-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const templatePath = path.join(distPath, 'index.html');
const postsPath = path.join(projectRoot, 'src', 'posts.json');

const template = fs.readFileSync(templatePath, 'utf8');
const posts = readPostsFile(postsPath);

if (!SEO_BLOCK_PATTERN.test(template)) {
  throw new Error('Could not find the SEO block in dist/index.html.');
}

const EMPTY_ROOT = '<div id="root"></div>';

const writeRoute = (routePath, seo, { url } = {}) => {
  let html = template.replace(SEO_BLOCK_PATTERN, renderSeoBlock(seo));

  if (url) {
    if (!html.includes(EMPTY_ROOT)) {
      throw new Error('Could not find the empty root element in dist/index.html.');
    }

    const markup = render(url);
    if (markup.length < 1000 || !markup.includes('prose')) {
      throw new Error(`Server rendering produced no article content for ${url}.`);
    }
    html = html.replace(EMPTY_ROOT, `<div id="root">${markup}</div>`);
  }

  const targetDirectory = path.join(distPath, routePath);
  fs.mkdirSync(targetDirectory, { recursive: true });
  const targetPath = path.join(targetDirectory, 'index.html');
  fs.writeFileSync(targetPath, html, 'utf8');

  if (url) {
    const written = fs.readFileSync(targetPath, 'utf8');
    if (written.includes(EMPTY_ROOT) || !written.includes('<div id="root"><')) {
      throw new Error(`Prerendered article for ${url} is missing app markup.`);
    }
  }
};

writeRoute('blog', blogSeo(posts));

for (const post of posts) {
  writeRoute(path.join('blog', post.slug), articleSeo(post), { url: `/blog/${post.slug}` });
}

// Keep the root document on the same shared metadata as the client bundle.
fs.writeFileSync(
  templatePath,
  template.replace(SEO_BLOCK_PATTERN, renderSeoBlock(homeSeo())),
  'utf8',
);

// Cloudflare Pages serves this document for unmatched routes.
fs.writeFileSync(
  path.join(distPath, '404.html'),
  template.replace(SEO_BLOCK_PATTERN, renderSeoBlock(notFoundSeo())),
  'utf8',
);

console.log(`✅ Pre-rendered metadata for ${posts.length + 2} routes plus 404.html, with full article HTML for ${posts.length} posts.`);
