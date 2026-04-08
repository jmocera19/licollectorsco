import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const domain = 'https://licollectorsco.com';
const dataPath = path.resolve(__dirname, '../src/data.json');
const postsPath = path.resolve(__dirname, '../src/posts.json');
const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');

try {
  // 1. Read vault items
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(rawData);
  const items = data.vault || [];

  // 2. Read blog posts
  const rawPosts = fs.readFileSync(postsPath, 'utf8');
  const postsData = JSON.parse(rawPosts);
  const posts = postsData.posts || [];

  // 3. Prime the default sitemap hierarchy
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${domain}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${domain}/blog</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <priority>0.8</priority>
  </url>
`;

  // 4. Individual vault items
  items.forEach(item => {
    xml += `  <url>
    <loc>${domain}/#${item.id}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <priority>0.8</priority>
  </url>\n`;
  });

  // 5. Individual blog posts
  posts.forEach(post => {
    xml += `  <url>
    <loc>${domain}/blog/${post.slug}</loc>
    <lastmod>${post.date}T00:00:00.000Z</lastmod>
    <priority>0.7</priority>
  </url>\n`;
  });

  xml += `</urlset>`;

  // 6. Write to public/
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  console.log(`✅ Sitemap generated: ${items.length + posts.length + 2} URLs → ${sitemapPath}`);

} catch (error) {
  console.error('❌ Failed to generate sitemap:', error);
}
