import path from 'path';
import { fileURLToPath } from 'url';
import { readPostsFile } from '../shared/content.cjs';
import { render } from '../dist-ssr/entry-server.js';
import { prerenderSite } from './prerender-site.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const postsPath = path.join(projectRoot, 'src', 'posts.json');
const posts = readPostsFile(postsPath);
prerenderSite({ distPath, posts, render });

console.log(`✅ Pre-rendered metadata for ${posts.length + 2} routes plus 404.html, with full article HTML for ${posts.length} posts.`);
