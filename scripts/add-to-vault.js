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

// Manual environment variables parser to avoid third-party dependencies
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.trim();
      }
    });
  }
}

async function getAccessToken(clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to retrieve eBay access token (Status ${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function run() {
  loadEnv();

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env file.");
    process.exit(1);
  }

  const dataPath = path.resolve(__dirname, '../src/data.json');
  let dataContent;
  try {
    dataContent = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to read or parse data.json: ${err.message}`);
    process.exit(1);
  }

  let token;
  try {
    token = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    console.error(`❌ OAuth Token Error: ${err.message}`);
    process.exit(1);
  }

  let hasError = false;

  for (const itemId of itemIds) {
    try {
      const restfulId = encodeURIComponent(`v1|${itemId}|0`);
      const url = `https://api.ebay.com/buy/browse/v1/item/${restfulId}`;
      console.log(`\nFetching eBay listing: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`eBay API returned status ${response.status}: ${errText}`);
      }

      const itemData = await response.json();

      // Extract fields safely
      const title = itemData.title || 'Unknown Item';
      const price = itemData.price && itemData.price.value ? `$${itemData.price.value}` : 'Check Listing';
      const image = itemData.image && itemData.image.imageUrl ? itemData.image.imageUrl : '';
      const itemUrl = itemData.itemWebUrl || `https://www.ebay.com/itm/${itemId}`;

      const newItem = { id: itemId, title, price, image, url: itemUrl };
      console.log("Extracted:", JSON.stringify(newItem, null, 2));

      const existIndex = dataContent.vault.findIndex(v => v.id === itemId);
      if (existIndex >= 0) {
        dataContent.vault[existIndex] = newItem;
      } else {
        dataContent.vault.push(newItem);
      }

      // Small delay to be clean
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`❌ Error retrieving eBay ID ${itemId}:`, err.message);
      hasError = true;
    }
  }

  // Only rewrite to data.json if we successfully added at least one item
  if (hasError) {
    console.error("\n❌ Batch sync encountered errors.");
    fs.writeFileSync(dataPath, JSON.stringify(dataContent, null, 2));
    process.exit(1);
  }

  // Rewrite entire blob structure globally after all IDs are validated
  fs.writeFileSync(dataPath, JSON.stringify(dataContent, null, 2));

  const stats = fs.statSync(dataPath);
  if (stats.size > 500 * 1024) {
    console.warn(`\n⚠️  WARNING: src/data.json is approaching heavy capacities (${(stats.size / 1024).toFixed(2)} KB).`);
  }

  console.log('\n--- BATCH SYNC SUCCESS! ---');
  console.log('✅ src/data.json is rewritten with fresh logic constraints.');
  process.exit(0);
}

run();
