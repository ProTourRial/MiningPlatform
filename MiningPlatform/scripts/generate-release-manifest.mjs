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

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const files = (await walk(payloadRoot))
  .map((absolute) => ({ absolute, path: relative(payloadRoot, absolute).split(sep).join('/') }))
  .filter((entry) => entry.path !== 'release-manifest.json' && !entry.path.endsWith('.sha256'))
  .sort((left, right) => left.path.localeCompare(right.path));
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file.path, 'utf8');
  hash.update('\0');
  hash.update(await readFile(file.absolute));
  hash.update('\0');
}
const payloadChecksum = hash.digest('hex');
const patchChecksum = suppliedPatchChecksum ?? (artifactType === 'incremental-patch' ? payloadChecksum : 'NOT_PACKAGED');

const manifest = {
  project: 'MiningPlatform',
  version: '0.2.0-alpha.6',
  releaseName: 'Upstream Resilience',
  artifactType,
  schemaVersion: 6,
  migration: '20260731110000_upstream_resilience',
  compatibleFrom: ['0.2.0-alpha.5'],
  patchChecksum,
  payloadChecksum,
  checksumScope: 'sha256-payload-v1 excluding release-manifest.json and *.sha256',
  payloadFileCount: files.length,
  buildDate: process.env.BUILD_DATE ?? '2026-07-31T17:54:00+07:00',
  gitCommit: process.env.GIT_COMMIT ?? 'UNCOMMITTED',
  author: 'Abia Nugrahanto',
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
