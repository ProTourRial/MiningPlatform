/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expectedVersion = '0.3.0-alpha.6';
const expectedMigration = '20260821020000_referral_fee_foundation';

async function text(path) {
  return readFile(resolve(root, path), 'utf8');
}

function requireText(contents, expected, label) {
  if (!contents.includes(expected)) throw new Error(`${label} is missing: ${expected}`);
}

const requiredFiles = [
  'PROJECT_VISION.md',
  'docs/adr/0011-atomic-financial-truth.md',
  'docs/adr/0012-referral-fee-accounting.md',
  'docs/operations/financial-truth-runbook.md',
  'docs/releases/v0.3.0-alpha.6.md',
  'docs/releases/v0.3.0-alpha.6-validation.md',
  'packages/database/prisma/migrations/20260821010000_reconciliation_exception_lifecycle/migration.sql',
  `packages/database/prisma/migrations/${expectedMigration}/migration.sql`,
  'apps/accounting-worker/src/reconciliation-resolution-service.ts',
  'apps/accounting-worker/src/accounting-service.ts',
  'apps/stratum-server/src/production-worker-authenticator.ts',
  'apps/api/src/modules/payouts/payouts.service.ts',
  'apps/web/src/components/dashboard/auto-withdrawal-panel.tsx',
  'scripts/financial-truth-integration.ts',
  'scripts/reconciliation-resolution-integration.ts',
  'scripts/verify-v030-alpha6-migration.mjs',
];
await Promise.all(requiredFiles.map((path) => readFile(resolve(root, path))));

const packageFiles = [
  'package.json',
  ...(await readdir(resolve(root, 'apps'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `apps/${entry.name}/package.json`),
  ...(await readdir(resolve(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/package.json`),
];
for (const path of packageFiles) {
  const parsed = JSON.parse(await text(path));
  if (parsed.version !== expectedVersion) {
    throw new Error(
      `${path} reports ${parsed.version ?? 'no version'}, expected ${expectedVersion}`,
    );
  }
}

const schema = await text('packages/database/prisma/schema.prisma');
for (const expected of [
  'model ReconciliationResolution',
  'model ReferralProgram',
  'model ReferralCode',
  'model ReferralAttribution',
  'feePartsPerMillion',
  'referralCommissionAtomic',
  'platformRetainedAtomic',
  'autoWithdrawalEnabled',
])
  requireText(schema, expected, 'Prisma schema');

const referralMigration = await text(
  `packages/database/prisma/migrations/${expectedMigration}/migration.sql`,
);
for (const expected of [
  "'MP05'",
  "'SITE_DONATION'",
  "'referral-program-standard-v1'",
  "'ACTIVE', 3750",
  '1250, TIMESTAMP',
  'ReferralAttribution_immutable_update',
  'RewardAllocation_referral_fee_split_check',
  'ADD COLUMN "autoWithdrawalEnabled" BOOLEAN NOT NULL DEFAULT false',
])
  requireText(referralMigration, expected, 'Referral fee migration');

const rewardEngine = await text('packages/reward-engine/src/index.ts');
for (const expected of [
  'feePartsPerMillion',
  'referralCommissionPartsPerMillion',
  '/ 1_000_000n',
  'platformRetainedAtomic',
])
  requireText(rewardEngine, expected, 'Reward engine');

const accounting = await text('apps/accounting-worker/src/accounting-service.ts');
for (const expected of [
  'SITE-DONATION-REFERRAL-LIABILITY',
  'referralCommissionAtomic',
  'platformRetainedAtomic',
  'assertBalanced',
])
  requireText(accounting, expected, 'Accounting worker');

const authenticator = await text('apps/stratum-server/src/production-worker-authenticator.ts');
for (const expected of [
  "value.indexOf('#')",
  'INVALID_REFERRAL_CODE',
  'SELF_REFERRAL',
  'REFERRAL_CONFLICT',
  'referralAttribution.createMany',
  'skipDuplicates: true',
])
  requireText(authenticator, expected, 'Worker authenticator');

const payoutService = await text('apps/api/src/modules/payouts/payouts.service.ts');
for (const expected of [
  'autoWithdrawalEnabled',
  'AUTO_PAYOUT_EXECUTOR_NOT_IMPLEMENTED',
  'GLOBAL_PAYOUT_GATE_DISABLED',
  'NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS',
])
  requireText(payoutService, expected, 'Payout preference service');

const compose = await text('docker-compose.yml');
requireText(compose, 'SCHEMA_VERSION: ${SCHEMA_VERSION:-12}', 'Docker Compose');
requireText(
  compose,
  `SCHEMA_MIGRATION: \${SCHEMA_MIGRATION:-${expectedMigration}}`,
  'Docker Compose',
);

const changelog = await text('CHANGELOG.md');
requireText(changelog, '## [0.3.0-alpha.6] - 2026-08-21', 'CHANGELOG');
requireText(changelog, 'OpenAI Codex assisted', 'CHANGELOG Codex disclosure');
requireText(changelog, 'remain with Abia Nugrahanto', 'CHANGELOG ownership disclosure');

const projectManifest = JSON.parse(await text('project-manifest.json'));
if (
  projectManifest.version !== expectedVersion ||
  projectManifest.schema_version !== 12 ||
  projectManifest.database_summary.latest_migration !== expectedMigration
)
  throw new Error('project-manifest.json release metadata is stale');
if (projectManifest.baseline.platform_fee_percent !== 0.5) {
  throw new Error('project-manifest.json standard platform fee is not 0.5 percent');
}

process.stdout.write('v0.3.0-alpha.6 static reconciliation/referral checks passed.\n');
