import fs from 'node:fs';
import { readJsonFile, writeJsonAtomic } from '../../shared/content.cjs';

const [filePath, value, readyPath, goPath] = process.argv.slice(2);

const snapshot = readJsonFile(filePath, () => null);
if (snapshot.status !== 'ok') {
  console.error(`snapshot failed: ${snapshot.message}`);
  process.exit(1);
}

fs.writeFileSync(readyPath, 'ready', 'utf8');

const deadline = Date.now() + 10_000;
while (!fs.existsSync(goPath)) {
  if (Date.now() > deadline) {
    console.error('timed out waiting for go signal');
    process.exit(2);
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}

const result = await writeJsonAtomic(filePath, { writer: value }, {
  expectedFingerprint: snapshot.fingerprint,
});
process.stdout.write(JSON.stringify(result));
