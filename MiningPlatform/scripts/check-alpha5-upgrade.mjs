/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.2.0-alpha.5';
const requiredFiles = [
  'pnpm-lock.yaml',
  'release-manifest.json',
  'packages/build-info/src/index.ts',
  'apps/api/src/modules/version/version.controller.ts',
  'docs/adr/README.md',
  'docs/adr/0001-core-mining-foundation.md',
  'docs/adr/0002-upstream-gateway-first.md',
  'docs/adr/0003-double-entry-ledger.md',
  'docs/adr/0004-no-user-deposit-in-mvp.md',
  'docs/adr/0005-universal-hardware-model.md',
  'docs/adr/0006-event-delivery-and-outbox.md',
  'docs/adr/0007-production-miner-identity.md',
  'docs/events/catalog.md',
  'docs/events/versioning-policy.md',
  'packages/database/prisma/migrations/20260731030000_architecture_miner_identity/migration.sql',
];
const forbiddenFiles = [
  'docs/adr/0001-upstream-gateway-first.md',
  'docs/adr/0002-double-entry-ledger.md',
  'docs/adr/0003-no-user-deposit-in-mvp.md',
];

async function exists(relativePath) {
  try {
    await stat(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

const failures = [];
for (const relativePath of requiredFiles) {
  if (!(await exists(relativePath))) failures.push(`Required file is missing: ${relativePath}`);
}
for (const relativePath of forbiddenFiles) {
  if (await exists(relativePath)) failures.push(`Obsolete duplicate must be deleted: ${relativePath}`);
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion) {
  failures.push(`Root package version must be ${expectedVersion}, received ${packageJson.version}`);
}


const releaseManifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (releaseManifest.version !== expectedVersion) failures.push('release-manifest version mismatch');
if (releaseManifest.schemaVersion !== 5) failures.push('release-manifest schemaVersion must be 5');
if (releaseManifest.migration !== '20260731030000_architecture_miner_identity') {
  failures.push('release-manifest migration mismatch');
}
if (!Array.isArray(releaseManifest.compatibleFrom) || !releaseManifest.compatibleFrom.includes('0.2.0-alpha.4')) {
  failures.push('release-manifest compatibleFrom must include 0.2.0-alpha.4');
}

const deleteManifest = await readFile(join(root, 'DELETE_FILES.txt'), 'utf8');
for (const fragment of ['DELETE', 'Reason:', 'Required:', 'Canonical ADR']) {
  if (!deleteManifest.includes(fragment)) failures.push(`DELETE_FILES.txt is missing structured field: ${fragment}`);
}

const schema = await readFile(join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
for (const fragment of ['model WorkerCredential', 'enum WorkerCredentialStatus', 'credentials           WorkerCredential[]']) {
  if (!schema.includes(fragment)) failures.push(`Prisma schema is missing expected fragment: ${fragment}`);
}

const migration = await readFile(
  join(root, 'packages/database/prisma/migrations/20260731030000_architecture_miner_identity/migration.sql'),
  'utf8',
);
for (const fragment of ['CREATE TYPE "WorkerCredentialStatus"', 'CREATE TABLE "WorkerCredential"', 'WorkerCredential_workerId_fkey']) {
  if (!migration.includes(fragment)) failures.push(`Alpha.5 migration is missing expected fragment: ${fragment}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Alpha.5 static upgrade checks passed.\n');
}
