/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? process.cwd());
const manifestPath = resolve(root, 'managed-source-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const failures = [];
const aggregate = createHash('sha256');

function canonicalizeForChecksum(content) {
  return Buffer.from(content.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
}

for (const entry of manifest.files ?? []) {
  if (
    typeof entry.path !== 'string' ||
    entry.path.includes('..') ||
    entry.path.startsWith('/') ||
    entry.path.startsWith('\\')
  ) {
    failures.push(`Unsafe managed path: ${entry.path}`);
    continue;
  }
  const absolute = resolve(root, entry.path);
  if (!absolute.startsWith(`${root}${sep}`)) {
    failures.push(`Managed path escapes project root: ${entry.path}`);
    continue;
  }
  try {
    const metadata = await stat(absolute);
    if (!metadata.isFile()) throw new Error('not a file');
    const contents = canonicalizeForChecksum(await readFile(absolute));
    const sha256 = createHash('sha256').update(contents).digest('hex');
    if (sha256 !== entry.sha256) failures.push(`Checksum mismatch: ${entry.path}`);
    if (contents.length !== entry.size) failures.push(`Size mismatch: ${entry.path}`);
    aggregate.update(entry.path, 'utf8');
    aggregate.update('\0');
    aggregate.update(sha256, 'utf8');
    aggregate.update('\0');
  } catch (error) {
    failures.push(`Missing or unreadable managed file: ${entry.path} (${error.message})`);
  }
}

const actualAggregate = aggregate.digest('hex');
if (manifest.managedFileCount !== manifest.files?.length)
  failures.push('Managed file count metadata mismatch.');
if (actualAggregate !== manifest.managedFilesChecksum)
  failures.push('Managed source aggregate checksum mismatch.');

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Managed source verified: ${manifest.version} (${manifest.managedFileCount} files). Extra local files were ignored.\n`,
  );
}
