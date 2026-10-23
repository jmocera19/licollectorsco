import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SEO_BLOCK_PATTERN,
  renderSeoBlock,
  homeSeo,
  blogSeo,
  articleSeo,
} from '../shared/seo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const templatePath = path.join(distPath, 'index.html');
const postsPath = path.join(projectRoot, 'src', 'posts.json');

const template = fs.readFileSync(templatePath, 'utf8');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8')).posts || [];

if (!SEO_BLOCK_PATTERN.test(template)) {
  throw new Error('Could not find the SEO block in dist/index.html.');
}

const writeRoute = (routePath, seo) => {
  const targetDirectory = path.join(distPath, routePath);
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(targetDirectory, 'index.html'),
    template.replace(SEO_BLOCK_PATTERN, renderSeoBlock(seo)),
    'utf8',
  );
};

writeRoute('blog', blogSeo(posts));

for (const post of posts) {
  writeRoute(path.join('blog', post.slug), articleSeo(post));
}

// Keep the root document on the same shared metadata as the client bundle.
fs.writeFileSync(
  templatePath,
  template.replace(SEO_BLOCK_PATTERN, renderSeoBlock(homeSeo())),
  'utf8',
);

console.log(`✅ Pre-rendered metadata for ${posts.length + 2} routes.`);
