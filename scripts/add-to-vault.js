import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const itemIds = process.argv.slice(2);
if (itemIds.length === 0) {
  console.error("❌ Please provide at least one eBay Item ID.");
  console.log("Usage: node scripts/add-to-vault.js <ID_1> <ID_2> <ID_3>");
  process.exit(1);
}

async function run() {
  const dataPath = path.resolve(__dirname, '../src/data.json');
  const dataContent = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Optional: You could wipe the vault empty before the loop if you want an absolute real-time match of your active stock instead of retaining old ones.
  // dataContent.vault = [];

  for (const itemId of itemIds) {
    const url = `https://www.ebay.com/itm/${itemId}`;
    try {
      console.log(`\nFetching eBay listing: ${url}`);
      const req = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml'
        }
      });
      
      if (!req.ok) {
        throw new Error(`eBay returned status ${req.status}`);
      }
      
      const html = await req.text();
      
      const titleMatch = html.match(/<meta property="og:title" content="(.*?)"/i);
      const title = titleMatch ? titleMatch[1].replace(' | eBay', '').trim() : 'Unknown Item';
      
      const imgMatch = html.match(/<meta property="og:image" content="(.*?)"/i);
      const image = imgMatch ? imgMatch[1] : '';
      
      let price = 'Check Listing';
      const priceMatch = html.match(/class="x-price-primary[^>]*>\s*\$?(.*?)\s*<\//i);
      if (priceMatch) {
        price = `$${priceMatch[1]}`;
      } else {
        const backupMatch = html.match(/"price":"([\d.]+)"/i);
        if (backupMatch) price = `$${backupMatch[1]}`;
      }

      const newItem = { id: itemId, title, price, image, url };
      console.log("Extracted:", JSON.stringify(newItem, null, 2));

      const existIndex = dataContent.vault.findIndex(v => v.id === itemId);
      if (existIndex >= 0) {
        dataContent.vault[existIndex] = newItem;
      } else {
        dataContent.vault.push(newItem);
      }
      
      // Delay to avoid extremely aggressive IP bans from eBay if fetching in high loops
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`Error scraping eBay ID ${itemId}:`, err.message);
    }
  }

  // Rewrite entire blob structure globally after all IDs are validated
  fs.writeFileSync(dataPath, JSON.stringify(dataContent, null, 2));

  const stats = fs.statSync(dataPath);
  if (stats.size > 500 * 1024) {
    console.warn(`\n⚠️  WARNING: src/data.json is approaching heavy capacities (${(stats.size / 1024).toFixed(2)} KB).`);
    console.warn('Consider migrating to a hosted database architecture to guarantee strict frontend hydration speeds.');
  }

  console.log('\n--- BATCH SYNC SUCCESS! ---');
  console.log('✅ src/data.json is rewritten with fresh logic constraints.');
}

run();
