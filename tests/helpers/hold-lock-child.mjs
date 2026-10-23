import fs from 'node:fs';
import { acquireFileLock } from '../../shared/content.cjs';

const [filePath, readyPath, releasePath] = process.argv.slice(2);

const lock = await acquireFileLock(filePath);
if (!lock.ok) {
  console.error(`lock failed: ${lock.message}`);
  process.exit(1);
}

fs.writeFileSync(readyPath, 'ready', 'utf8');

try {
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(releasePath)) {
    if (Date.now() > deadline) {
      console.error('timed out waiting for release signal');
      process.exit(2);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
} finally {
  await lock.release();
}
