/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? process.cwd());
const output = resolve(root, 'managed-source-manifest.json');
const excludedFiles = new Set([
  'managed-source-manifest.json',
  'release-manifest.json',
  'installed-release-manifest.json',
]);
const excludedDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'coverage',
  'logs',
  '.cache',
]);

function canonicalizeForChecksum(content) {
  return Buffer.from(content.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const entries = [];
for (const absolute of await walk(root)) {
  const path = relative(root, absolute).split(sep).join('/');
  if (
    excludedFiles.has(path) ||
    path.endsWith('.sha256') ||
    path.endsWith('.tsbuildinfo') ||
    path.startsWith('packages/database/src/generated/')
  )
    continue;
  const contents = canonicalizeForChecksum(await readFile(absolute));
  entries.push({
    path,
    sha256: createHash('sha256').update(contents).digest('hex'),
    size: contents.length,
  });
}
entries.sort((left, right) => left.path.localeCompare(right.path));

const aggregate = createHash('sha256');
for (const entry of entries) {
  aggregate.update(entry.path, 'utf8');
  aggregate.update('\0');
  aggregate.update(entry.sha256, 'utf8');
  aggregate.update('\0');
}

const manifest = {
  project: 'MiningPlatform',
  version: '0.3.0-alpha.6',
  releaseName: 'Reconciliation and Referral Foundation',
  packagingRevision: 'r1',
  verificationMode: 'managed-files-only',
  extraFilesPolicy: 'ignored',
  managedFileCount: entries.length,
  managedFilesChecksum: aggregate.digest('hex'),
  author: 'Abia Nugrahanto',
  files: entries,
};
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Managed source manifest generated for ${entries.length} files.\n`);
