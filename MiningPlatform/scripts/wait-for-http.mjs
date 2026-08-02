/** MiningPlatform — Author: Abia Nugrahanto */
import { setTimeout as sleep } from 'node:timers/promises';

const url = process.argv[2];
const timeoutMilliseconds = Number(process.argv[3] ?? 120_000);
if (!url || !Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1_000) {
  throw new Error('Usage: node scripts/wait-for-http.mjs <url> [timeout-ms]');
}
const deadline = Date.now() + timeoutMilliseconds;
let lastError;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (response.ok) {
      process.stdout.write(`Ready: ${url}\n`);
      process.exit(0);
    }
    lastError = new Error(`HTTP ${response.status}`);
  } catch (error) {
    lastError = error;
  }
  await sleep(2_000);
}
throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
