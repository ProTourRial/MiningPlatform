/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const payloadRoot = resolve(process.argv[2] ?? process.cwd());
const outputPath = resolve(process.argv[3] ?? resolve(payloadRoot, 'release-manifest.json'));
const artifactType = process.argv[4] ?? 'full-release';
const suppliedPatchChecksum = process.argv[5];

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
    if (entry.isDirectory()) output.push(...(await walk(absolute)));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function isExcludedFile(path) {
  const name = path.split('/').at(-1);

  return (
    path === 'release-manifest.json' ||
    path.endsWith('.sha256') ||
    path.endsWith('.tsbuildinfo') ||
    path.endsWith('.log') ||
    path.startsWith('packages/database/src/generated/') ||
    name === '.env' ||
    (name.startsWith('.env.') && name !== '.env.example' && name !== '.env.ci.example')
  );
}

function canonicalizeForChecksum(content) {
  return Buffer.from(content.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
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
const payloadChecksum = hash.digest('hex');
const patchChecksum =
  suppliedPatchChecksum ??
  (artifactType === 'incremental-patch' ? payloadChecksum : 'NOT_PACKAGED');

const manifest = {
  project: 'MiningPlatform',
  version: '0.3.0-alpha.7',
  releaseName: 'Payout Control Foundation',
  artifactType,
  schemaVersion: 13,
  migration: '20260822010000_payout_control_foundation',
  compatibleFrom: [
    '0.3.0-alpha.6',
    '0.3.0-alpha.5',
    '0.3.0-alpha.4',
    '0.3.0-alpha.3',
    '0.3.0-alpha.2',
    '0.3.0-alpha.1',
  ],
  patchChecksum,
  payloadChecksum,
  checksumScope: 'sha256-payload-v2 with canonical LF and generated-file exclusions',
  payloadFileCount: files.length,
  buildDate: process.env.BUILD_DATE ?? '2026-08-22T00:00:00+07:00',
  gitCommit: process.env.GIT_COMMIT ?? 'UNCOMMITTED',
  author: 'Abia Nugrahanto',
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
