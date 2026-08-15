/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expectedVersion = '0.3.0-alpha.5';
const expectedMigration = '20260816020000_financial_truth_foundation';

async function text(path) {
  return readFile(resolve(root, path), 'utf8');
}

function requireText(contents, expected, label) {
  if (!contents.includes(expected)) throw new Error(`${label} is missing: ${expected}`);
}

const requiredFiles = [
  'PROJECT_VISION.md',
  'docs/product/PRODUCT_CONSTITUTION.md',
  'docs/product/PRODUCTION_GAP_REGISTER.md',
  'docs/adr/0011-atomic-financial-truth.md',
  'docs/operations/financial-truth-runbook.md',
  'docs/releases/v0.3.0-alpha.5.md',
  'docs/releases/v0.3.0-alpha.5-validation.md',
  `packages/database/prisma/migrations/${expectedMigration}/migration.sql`,
  'apps/accounting-worker/package.json',
  'apps/accounting-worker/src/accounting-service.ts',
  'infrastructure/docker/accounting-worker.Dockerfile',
  'scripts/financial-truth-integration.ts',
  'scripts/settlement-import-cli.ts',
  'scripts/journal-reversal-cli.ts',
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
  'model ContributionFact',
  'model RewardPeriodContribution',
  'enum ReconciliationStatus',
  'debitAtomic',
  'creditAtomic',
  'feePolicySnapshot',
])
  requireText(schema, expected, 'Prisma schema');

const migration = await text(
  `packages/database/prisma/migrations/${expectedMigration}/migration.sql`,
);
for (const expected of [
  'ContributionFact_immutable_trigger',
  'RewardAllocation_immutable_trigger',
  'JournalLine_immutable_trigger',
  'JournalEntry_immutable_trigger',
  'SUM(line."debitAtomic") <> SUM(line."creditAtomic")',
])
  requireText(migration, expected, 'Financial truth migration');

const rewardEngine = await text('packages/reward-engine/src/index.ts');
requireText(rewardEngine, 'allocateSettledReward', 'Reward engine');
requireText(rewardEngine, 'feeBasisPoints', 'Reward engine');

const accounting = await text('apps/accounting-worker/src/accounting-service.ts');
for (const expected of [
  "isolationLevel: 'Serializable'",
  'snapshotFeePolicy',
  'assertBalanced',
  'reverseJournal',
  'RECONCILIATION_EXCEPTION',
])
  requireText(accounting, expected, 'Accounting worker');

const sharedEvents = await text('packages/shared/src/events.ts');
requireText(
  sharedEvents,
  "contributionAccepted: 'reward.contribution.accepted.v1'",
  'Shared events',
);
requireText(sharedEvents, "settlementImported: 'reward.settlement.imported.v1'", 'Shared events');

const compose = await text('docker-compose.yml');
for (const expected of [
  'accounting-worker:',
  'SCHEMA_VERSION: ${SCHEMA_VERSION:-10}',
  `SCHEMA_MIGRATION: \${SCHEMA_MIGRATION:-${expectedMigration}}`,
])
  requireText(compose, expected, 'Docker Compose');

const apiKeys = await text('apps/api/src/modules/api-keys/api-keys.service.ts');
requireText(apiKeys, "'rewards:read'", 'API key scopes');
requireText(apiKeys, "'ledger:read'", 'API key scopes');
const ledgerService = await text('apps/api/src/modules/ledger/ledger.service.ts');
requireText(ledgerService, "status: { in: ['POSTED', 'REVERSED'] }", 'Ledger balance projection');

const envExample = await text('.env.example');
requireText(envExample, 'PLATFORM_FEE_PERCENT=0.5', '.env.example');
requireText(envExample, 'MINING_BUILD_VERSION=0.3.0-alpha.5', '.env.example');
requireText(envExample, 'SCHEMA_VERSION=10', '.env.example');

const changelog = await text('CHANGELOG.md');
requireText(changelog, '## [0.3.0-alpha.5] - 2026-08-16', 'CHANGELOG');
requireText(changelog, 'OpenAI Codex assisted', 'CHANGELOG Codex disclosure');
requireText(changelog, 'remain with Abia Nugrahanto', 'CHANGELOG ownership disclosure');

const projectManifest = JSON.parse(await text('project-manifest.json'));
if (projectManifest.version !== expectedVersion || projectManifest.schema_version !== 10) {
  throw new Error('project-manifest.json release metadata is stale');
}
if (projectManifest.baseline.platform_fee_percent !== 0.5) {
  throw new Error('project-manifest.json platform fee is not 0.5 percent');
}

const payoutController = await text('apps/api/src/modules/payouts/payouts.controller.ts');
requireText(payoutController, "status: 'disabled'", 'Payout controller');

process.stdout.write('v0.3.0-alpha.5 static financial-truth checks passed.\n');
