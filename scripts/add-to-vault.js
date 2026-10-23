import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { importEbayItems } from '../shared/ebay-import.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_RESULT_PREFIX = '__VAULT_RESULT__ ';
const dataPath = path.resolve(__dirname, '../src/data.json');

let added = [];
let failed = [];

// Machine-readable summary emitted exactly once on every normal terminal path.
// A forced timeout or abnormal crash may skip it; callers must fall back to
// process metadata and capped output when the line is absent.
const emitSummary = () => {
  console.log(`${VAULT_RESULT_PREFIX}${JSON.stringify({ added, failed })}`);
};

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

async function run() {
  const itemIds = process.argv.slice(2);

  if (itemIds.length === 0) {
    console.error("❌ Please provide at least one eBay Item ID.");
    console.log("Usage: node scripts/add-to-vault.js <ID_1> <ID_2> <ID_3>");
    return 1;
  }

  loadEnv();

  const result = await importEbayItems({
    itemIds,
    clientId: process.env.EBAY_CLIENT_ID,
    clientSecret: process.env.EBAY_CLIENT_SECRET,
    dataPath,
    logger: console,
  });
  added = result.added;
  failed = result.failed;

  if (fs.existsSync(dataPath)) {
    const stats = fs.statSync(dataPath);
    if (stats.size > 500 * 1024) {
      console.warn(`\n⚠️  WARNING: src/data.json is approaching heavy capacities (${(stats.size / 1024).toFixed(2)} KB).`);
    }
  }

  if (failed.length > 0) {
    console.error("\n❌ Batch sync encountered errors.");
  } else {
    console.log('\n--- BATCH SYNC SUCCESS! ---');
    console.log('✅ src/data.json is rewritten with fresh logic constraints.');
  }

  return failed.length > 0 ? 1 : 0;
}

try {
  process.exitCode = await run();
} catch (error) {
  console.error(`❌ Unexpected failure: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
}

emitSummary();
