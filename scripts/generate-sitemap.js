import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const domain = 'https://licollectorsco.com';
const postsPath = path.resolve(__dirname, '../src/posts.json');
const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');

try {
  // 1. Read blog posts. Only canonical, independently indexable pages belong in a sitemap.
  const rawPosts = fs.readFileSync(postsPath, 'utf8');
  const postsData = JSON.parse(rawPosts);
  const posts = postsData.posts || [];

  const latestPostDate = posts.reduce(
    (latest, post) => post.date > latest ? post.date : latest,
    '2025-01-01',
  );

  // 2. Prime the default sitemap hierarchy.
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${domain}/</loc>
    <lastmod>${latestPostDate}</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${domain}/blog</loc>
    <lastmod>${latestPostDate}</lastmod>
    <priority>0.8</priority>
  </url>
`;

  // 3. Individual blog posts
  posts.forEach(post => {
    xml += `  <url>
    <loc>${domain}/blog/${post.slug}</loc>
    <lastmod>${post.date}</lastmod>
    <priority>0.7</priority>
  </url>\n`;
  });

  xml += `</urlset>\n`;

  // 4. Write to public/
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  console.log(`✅ Sitemap generated: ${posts.length + 2} canonical URLs → ${sitemapPath}`);

} catch (error) {
  console.error('❌ Failed to generate sitemap:', error);
}
