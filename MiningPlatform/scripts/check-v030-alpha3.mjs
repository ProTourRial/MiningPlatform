/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.3.0-alpha.3';
const migrationName = '20260813010000_versioned_fee_policy';
const requiredFiles = [
  'PROJECT_VISION.md',
  'docs/product/PRODUCT_CONSTITUTION.md',
  'docs/product/PRODUCTION_GAP_REGISTER.md',
  'pnpm-lock.yaml',
  'release-manifest.json',
  `packages/database/prisma/migrations/${migrationName}/migration.sql`,
  'apps/api/src/modules/fees/fee-policy.ts',
  'apps/api/src/fee-policy.test.ts',
  'apps/api/src/auth.integration.test.ts',
  'packages/reward-engine/src/index.test.ts',
  'scripts/verify-v030-alpha3-migration.mjs',
  'docs/releases/v0.3.0-alpha.3.md',
  'docs/releases/v0.3.0-alpha.3-upgrade.md',
  'docs/releases/v0.3.0-alpha.3-validation.md',
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

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion)
  failures.push(`Root package version must be ${expectedVersion}`);

const projectManifest = JSON.parse(await readFile(join(root, 'project-manifest.json'), 'utf8'));
if (projectManifest.primary_product_reference !== 'PROJECT_VISION.md') {
  failures.push('PROJECT_VISION.md must remain the primary product reference');
}
if (projectManifest.baseline?.platform_fee_percent !== 0.5) {
  failures.push('Project baseline platform fee must be 0.5 percent');
}
if (projectManifest.schema_version !== 9) failures.push('Project schema version must be 9');
if (projectManifest.database_summary?.latest_migration !== migrationName) {
  failures.push('Project latest migration mismatch');
}

const releaseManifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (releaseManifest.version !== expectedVersion) failures.push('Release-manifest version mismatch');
if (releaseManifest.schemaVersion !== 9) failures.push('Release-manifest schemaVersion must be 9');
if (releaseManifest.migration !== migrationName)
  failures.push('Release-manifest migration mismatch');

const vision = await readFile(join(root, 'PROJECT_VISION.md'), 'utf8');
for (const fragment of ['Lapisan dokumentasi tertinggi', 'default fee awal adalah **0,5%']) {
  if (!vision.includes(fragment)) failures.push(`Project Vision is missing: ${fragment}`);
}

const schema = await readFile(join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
for (const fragment of [
  'enum FeePolicyScope',
  'enum FeePolicyStatus',
  'model MiningFeePolicy',
  'feePolicySnapshot',
  'feeBasisPoints',
]) {
  if (!schema.includes(fragment)) failures.push(`Prisma schema is missing: ${fragment}`);
}

const migration = await readFile(
  join(root, `packages/database/prisma/migrations/${migrationName}/migration.sql`),
  'utf8',
);
for (const fragment of [
  "'platform-default', 1, 'ACTIVE'",
  "'PLATFORM_DEFAULT', 50",
  'monetary amounts were not recalculated',
  'RewardAllocation_amounts_check',
]) {
  if (!migration.includes(fragment)) failures.push(`Fee migration is missing: ${fragment}`);
}

const authService = await readFile(join(root, 'apps/api/src/modules/auth/auth.service.ts'), 'utf8');
for (const fragment of ['requireActiveDefaultFeePolicy(tx)', 'feePolicyId: feePolicy.id']) {
  if (!authService.includes(fragment))
    failures.push(`Registration fee-policy binding is missing: ${fragment}`);
}

const rewardEngine = await readFile(join(root, 'packages/reward-engine/src/index.ts'), 'utf8');
for (const fragment of [
  'resolveEffectiveFeePolicy',
  'snapshotFeePolicy',
  'Ambiguous active fee policies',
]) {
  if (!rewardEngine.includes(fragment))
    failures.push(`Reward fee-policy resolution is missing: ${fragment}`);
}

for (const envFile of ['.env.example', '.env.ci.example']) {
  const contents = await readFile(join(root, envFile), 'utf8');
  if (!contents.includes('PLATFORM_FEE_PERCENT=0.5')) {
    failures.push(`${envFile} must disclose PLATFORM_FEE_PERCENT=0.5`);
  }
}

const landing = await readFile(join(root, 'apps/web/src/components/landing/sections.tsx'), 'utf8');
for (const fragment of ["'Platform fee awal'", "'0,5%'"]) {
  if (!landing.includes(fragment)) failures.push(`Public fee disclosure is missing: ${fragment}`);
}

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('v0.3.0-alpha.3 static release checks passed.\n');
}
