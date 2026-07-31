/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.2.0-alpha.6';
const migrationName = '20260731110000_upstream_resilience';
const requiredFiles = [
  'pnpm-lock.yaml',
  'release-manifest.json',
  'docs/adr/0008-multi-upstream-resilience.md',
  'docs/architecture/upstream-resilience-alpha-6.md',
  'docs/releases/v0.2.0-alpha.6.md',
  'docs/releases/v0.2.0-alpha.6-upgrade.md',
  'docs/events/catalog.md',
  'packages/upstream-stratum/src/pool-adapter.ts',
  'packages/upstream-stratum/src/pool-manager.ts',
  'packages/upstream-stratum/src/gateway-job-router.ts',
  'packages/upstream-stratum/src/share-queue.ts',
  'packages/upstream-stratum/src/vardiff.ts',
  `packages/database/prisma/migrations/${migrationName}/migration.sql`,
];

async function exists(relativePath) {
  try { await stat(join(root, relativePath)); return true; } catch { return false; }
}

const failures = [];
for (const relativePath of requiredFiles) if (!(await exists(relativePath))) failures.push(`Required file is missing: ${relativePath}`);

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion) failures.push(`Root package version must be ${expectedVersion}`);

const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (manifest.version !== expectedVersion) failures.push('release-manifest version mismatch');
if (manifest.schemaVersion !== 6) failures.push('release-manifest schemaVersion must be 6');
if (manifest.migration !== migrationName) failures.push('release-manifest migration mismatch');
if (!manifest.compatibleFrom?.includes('0.2.0-alpha.5')) failures.push('compatibleFrom must include 0.2.0-alpha.5');

const schema = await readFile(join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
for (const fragment of ['activeUpstreamPoolKey', 'poolKey', 'circuitOpenedUntil', 'reconnectCount']) {
  if (!schema.includes(fragment)) failures.push(`Prisma schema is missing: ${fragment}`);
}

const migration = await readFile(join(root, `packages/database/prisma/migrations/${migrationName}/migration.sql`), 'utf8');
for (const fragment of ['CIRCUIT_OPEN', 'activeUpstreamPoolKey', 'substr("id", 1, 8)', 'UpstreamPool_assetId_poolKey_key']) {
  if (!migration.includes(fragment)) failures.push(`Alpha.6 migration is missing: ${fragment}`);
}

const events = await readFile(join(root, 'packages/shared/src/events.ts'), 'utf8');
for (const fragment of ['upstreamPoolSelected', 'upstreamFailoverCompleted', 'upstreamHealthChanged', 'workerDifficultyChanged']) {
  if (!events.includes(fragment)) failures.push(`Event contract is missing: ${fragment}`);
}

if (failures.length) {
  process.stderr.write(`${failures.map((f) => `- ${f}`).join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write('Alpha.6 static upgrade checks passed.\n');
