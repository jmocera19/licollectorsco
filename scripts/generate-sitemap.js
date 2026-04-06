import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const domain = 'https://licollectorsco.com';
const dataPath = path.resolve(__dirname, '../src/data.json');
const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');

try {
  // 1. Fetch internal JSON states dynamically
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(rawData);
  const items = data.vault || [];

  // 2. Prime the default sitemap hierarchy mapped to the canonical domain
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${domain}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <priority>1.0</priority>
  </url>
`;

  // 3. Map individual items so GSC algorithms natively track variants within the Vault DOM
  items.forEach(item => {
    xml += `  <url>
    <loc>${domain}/#${item.id}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <priority>0.8</priority>
  </url>\n`;
  });

  xml += `</urlset>`;

  // 4. Force synchronous print onto the public deployment layer before Cloudflare grabs it
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  console.log(`✅ Successfully generated sitemap.xml with ${items.length + 1} URLs at ${sitemapPath}`);

} catch (error) {
  console.error('❌ Failed to generate sitemap:', error);
}
