/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const payloadRoot = resolve(process.argv[2] ?? process.cwd());
const manifest = JSON.parse(await readFile(resolve(payloadRoot, 'release-manifest.json'), 'utf8'));

const excludedDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  '.artifacts',
  '.pnpm-store',
  '.cache',
  'coverage',
  'dist',
  'dist-release',
  'node_modules',
]);

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function isExcludedFile(path) {
  const name = path.split('/').at(-1);

  return (
    path === 'release-manifest.json'
    || path.endsWith('.sha256')
    || path.endsWith('.tsbuildinfo')
    || path.endsWith('.log')
    || path.startsWith('packages/database/src/generated/')
    || name === '.env'
    || (
      name.startsWith('.env.')
      && name !== '.env.example'
      && name !== '.env.ci.example'
    )
  );
}

function canonicalizeForChecksum(content) {
  return Buffer.from(
    content.toString('latin1').replaceAll('\r\n', '\n'),
    'latin1',
  );
}

const files = (await walk(payloadRoot))
  .map((absolute) => ({
    absolute,
    path: relative(payloadRoot, absolute).split(sep).join('/'),
  }))
  .filter((entry) => !isExcludedFile(entry.path))
  .sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
  });
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file.path, 'utf8');
  hash.update('\0');
  const content = await readFile(file.absolute);
  hash.update(canonicalizeForChecksum(content));
  hash.update('\0');
}
const actual = hash.digest('hex');
if (actual !== manifest.payloadChecksum) {
  throw new Error(`Release payload checksum mismatch: expected ${manifest.payloadChecksum}, received ${actual}`);
}
if (manifest.payloadFileCount !== files.length) {
  throw new Error(`Release payload file count mismatch: expected ${manifest.payloadFileCount}, received ${files.length}`);
}
process.stdout.write(`Release manifest verified: ${manifest.version} (${files.length} files).\n`);
