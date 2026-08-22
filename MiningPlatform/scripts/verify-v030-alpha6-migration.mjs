/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'fresh' && mode !== 'upgrade') {
  throw new Error('Usage: node scripts/verify-v030-alpha6-migration.mjs <fresh|upgrade>');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const expectedAck =
  mode === 'fresh' ? 'v030-alpha6-fresh-empty-database' : 'v030-alpha5-upgrade-copy';
if (process.env.MIGRATION_TEST_ACK !== expectedAck) {
  throw new Error(
    `Set MIGRATION_TEST_ACK=${expectedAck} after confirming the database is disposable`,
  );
}

const psqlUrl = new URL(process.env.DATABASE_URL);
psqlUrl.searchParams.delete('schema');
const psqlContainer = process.env.MIGRATION_PSQL_CONTAINER;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = join(root, 'packages/database/prisma/migrations');
const targetMigrations = [
  '20260821010000_reconciliation_exception_lifecycle',
  '20260821020000_referral_fee_foundation',
];
const migrationPaths = targetMigrations.map((migration) => ({
  migration,
  target: join(migrationsRoot, migration),
  parked: join(dirname(migrationsRoot), `.${migration}.disabled`),
}));
for (const path of migrationPaths) {
  if (!existsSync(path.target)) throw new Error(`Missing migration: ${path.migration}`);
  if (existsSync(path.parked)) {
    throw new Error(`Remove stale parked migration directory: ${path.parked}`);
  }
}

function run(command, args, options = {}) {
  process.stdout.write(
    `\n> ${command} ${options.redactArgs ? '[arguments redacted]' : args.join(' ')}\n`,
  );
  const executePackageManagerWithNode = command === 'pnpm' && process.env.npm_execpath;
  const executable = executePackageManagerWithNode ? process.execPath : command;
  const executableArgs = executePackageManagerWithNode ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: options.shell ?? false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 1}`);
}

function psql(command) {
  if (!psqlContainer) {
    run('psql', [psqlUrl.toString(), '--set', 'ON_ERROR_STOP=1', '--command', command], {
      redactArgs: true,
    });
    return;
  }
  run(
    'docker',
    [
      'exec',
      '--env',
      `PGPASSWORD=${decodeURIComponent(psqlUrl.password)}`,
      psqlContainer,
      'psql',
      '--username',
      decodeURIComponent(psqlUrl.username),
      '--dbname',
      psqlUrl.pathname.slice(1),
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      command,
    ],
    { redactArgs: true, shell: false },
  );
}

psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

if (mode === 'upgrade') {
  for (const path of migrationPaths) renameSync(path.target, path.parked);
  try {
    run('pnpm', ['db:migrate:deploy']);
    psql(`
      INSERT INTO "Asset" (
        "id", "symbol", "name", "algorithm", "decimals", "enabled",
        "minimumPayout", "requiredConfirmations", "updatedAt"
      ) VALUES (
        'alpha6-upgrade-btc', 'BTC', 'Bitcoin', 'SHA256', 8, true,
        0.001, 3, NOW()
      );

      INSERT INTO "User" (
        "id", "email", "passwordHash", "displayName", "role", "status",
        "accountType", "emailVerifiedAt", "updatedAt"
      ) VALUES (
        'alpha6-upgrade-user', 'alpha6-upgrade@local.invalid', 'UPGRADE_FIXTURE',
        'Alpha6 Upgrade User', 'USER', 'ACTIVE', 'INDIVIDUAL', NOW(), NOW()
      );

      INSERT INTO "MiningAccount" (
        "id", "userId", "assetId", "feePolicyId", "username", "rewardMethod",
        "platformFeePercent", "enabled", "updatedAt"
      ) VALUES (
        'alpha6-upgrade-account', 'alpha6-upgrade-user', 'alpha6-upgrade-btc',
        'fee-policy-platform-default-v1', 'alpha6_upgrade', 'FOLLOW_UPSTREAM',
        0.5, true, NOW()
      );

      INSERT INTO "UpstreamPool" (
        "id", "assetId", "poolKey", "name", "host", "port", "rewardMethod", "status", "updatedAt"
      ) SELECT
        'alpha6-upgrade-pool', "id", 'alpha6-upgrade-pool', 'Alpha6 Upgrade Pool',
        '127.0.0.1', 3333, 'FOLLOW_UPSTREAM', 'OPERATIONAL', NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';

      INSERT INTO "RewardPeriod" (
        "id", "assetId", "upstreamPoolId", "method", "status", "periodStart", "periodEnd",
        "grossReward", "upstreamFee", "networkFee", "platformFee", "distributableReward",
        "reconciliationStatus", "grossAtomic", "upstreamFeeAtomic", "networkFeeAtomic",
        "platformFeeAtomic", "distributableAtomic", "userNetAtomic", "failureCode", "updatedAt"
      ) SELECT
        'alpha6-upgrade-exception-period', "id", 'alpha6-upgrade-pool', 'FOLLOW_UPSTREAM', 'OPEN',
        '2026-08-20T00:00:00Z', '2026-08-20T01:00:00Z',
        0.00100000, 0.00001000, 0.00000500, 0, 0.00098500,
        'EXCEPTION', 100000, 1000, 500, 0, 98500, 98500,
        'UPSTREAM_SETTLEMENT_VARIANCE', NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';

      INSERT INTO "UpstreamReconciliation" (
        "id", "assetId", "upstreamPoolId", "rewardPeriodId", "upstreamGrossReward",
        "upstreamFee", "receivedAmount", "internalExpectedAmount", "varianceAmount", "status",
        "sourceReference", "sourceChecksum", "importIdempotencyKey", "upstreamGrossAtomic",
        "upstreamFeeAtomic", "networkFeeAtomic", "receivedAtomic", "internalExpectedAtomic",
        "varianceAtomic", "toleranceAtomic", "exceptionCode", "exceptionMessage", "updatedAt"
      ) SELECT
        'alpha6-upgrade-exception', "id", 'alpha6-upgrade-pool', 'alpha6-upgrade-exception-period',
        0.00100000, 0.00001000, 0.00098000, 0.00098500, -0.00000500, 'EXCEPTION',
        'alpha6-upgrade-original-source', repeat('a', 64), 'alpha6-upgrade-original-import',
        100000, 1000, 500, 98000, 98500, -500, 0,
        'RECEIVED_AMOUNT_MISMATCH', 'Representative alpha5 exception', NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';

      INSERT INTO "RewardPeriod" (
        "id", "assetId", "upstreamPoolId", "method", "status", "periodStart", "periodEnd",
        "grossReward", "upstreamFee", "networkFee", "platformFee", "distributableReward",
        "reconciliationStatus", "grossAtomic", "upstreamFeeAtomic", "networkFeeAtomic",
        "platformFeeAtomic", "distributableAtomic", "userNetAtomic", "updatedAt"
      ) SELECT
        'alpha6-upgrade-legacy-resolved-period', "id", 'alpha6-upgrade-pool', 'FOLLOW_UPSTREAM', 'OPEN',
        '2026-08-20T01:00:00Z', '2026-08-20T02:00:00Z',
        0.00100000, 0.00001000, 0.00000500, 0, 0.00098500,
        'RESOLVED', 100000, 1000, 500, 0, 98500, 98500, NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';

      INSERT INTO "UpstreamReconciliation" (
        "id", "assetId", "upstreamPoolId", "rewardPeriodId", "upstreamGrossReward",
        "upstreamFee", "receivedAmount", "internalExpectedAmount", "varianceAmount", "status",
        "sourceReference", "sourceChecksum", "importIdempotencyKey", "upstreamGrossAtomic",
        "upstreamFeeAtomic", "networkFeeAtomic", "receivedAtomic", "internalExpectedAtomic",
        "varianceAtomic", "toleranceAtomic", "updatedAt"
      ) SELECT
        'alpha6-upgrade-legacy-resolved', "id", 'alpha6-upgrade-pool', 'alpha6-upgrade-legacy-resolved-period',
        0.00100000, 0.00001000, 0.00098500, 0.00098500, 0, 'RESOLVED',
        'alpha6-upgrade-legacy-resolved-source', repeat('b', 64), 'alpha6-upgrade-legacy-resolved-import',
        100000, 1000, 500, 98500, 98500, 0, 0, NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';
    `);
  } finally {
    for (const path of [...migrationPaths].reverse()) renameSync(path.parked, path.target);
  }
}

run('pnpm', ['db:migrate:deploy']);
run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);

psql(`
  DO $$
  BEGIN
    IF to_regclass('public."ReconciliationResolution"') IS NULL THEN
      RAISE EXCEPTION 'reconciliation resolution table is missing';
    END IF;
    IF to_regclass('public."ReferralProgram"') IS NULL
      OR to_regclass('public."ReferralCode"') IS NULL
      OR to_regclass('public."ReferralAttribution"') IS NULL
    THEN
      RAISE EXCEPTION 'referral fee foundation tables are missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "ReferralCode" code
      JOIN "ReferralProgram" program ON program."id" = code."programId"
      WHERE code."code" = 'MP05'
        AND code."beneficiaryType" = 'SITE_DONATION'
        AND code."ownerUserId" IS NULL
        AND code."active"
        AND program."minerFeePartsPerMillion" = 3750
        AND program."commissionPartsPerMillion" = 1250
    ) THEN
      RAISE EXCEPTION 'default MP05 donation referral economics are incorrect';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "MiningFeePolicy"
      WHERE "policyKey" = 'platform-default' AND "version" = 1
        AND "feeBasisPoints" = 50 AND "feePartsPerMillion" = 5000
    ) THEN
      RAISE EXCEPTION 'default fee PPM backfill is incorrect';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'UpstreamReconciliation'
        AND column_name = 'importedByUserId'
    ) THEN
      RAISE EXCEPTION 'reconciliation importer attribution is missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'UpstreamReconciliation_rewardPeriodId_active_key'
        AND indexdef LIKE '%WHERE (status = ANY%'
    ) THEN
      RAISE EXCEPTION 'active reconciliation partial unique index is missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      WHERE relation.relname = 'UpstreamReconciliation'
        AND trigger.tgname = 'UpstreamReconciliation_immutable_trigger'
        AND NOT trigger.tgisinternal
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      WHERE relation.relname = 'ReconciliationResolution'
        AND trigger.tgname = 'ReconciliationResolution_approved_evidence_constraint'
        AND trigger.tgdeferrable
        AND trigger.tginitdeferred
        AND NOT trigger.tgisinternal
    ) THEN
      RAISE EXCEPTION 'reconciliation lifecycle database triggers are missing';
    END IF;
  END $$;
`);

if (mode === 'upgrade') {
  psql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "UpstreamReconciliation"
        WHERE "id" = 'alpha6-upgrade-exception'
          AND "status" = 'EXCEPTION'
          AND "receivedAtomic" = 98000
          AND "varianceAtomic" = -500
          AND "sourceChecksum" = repeat('a', 64)
      ) THEN
        RAISE EXCEPTION 'alpha5 exception evidence was not preserved';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "MiningAccount"
        WHERE "id" = 'alpha6-upgrade-account' AND NOT "autoWithdrawalEnabled"
      ) THEN
        RAISE EXCEPTION 'auto withdrawal did not default safely to OFF';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "ReferralCode"
        WHERE "ownerUserId" = 'alpha6-upgrade-user'
          AND "beneficiaryType" = 'USER'
          AND "active"
      ) THEN
        RAISE EXCEPTION 'existing user personal referral code was not backfilled';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "UpstreamReconciliation"
        WHERE "id" = 'alpha6-upgrade-legacy-resolved'
          AND "status" = 'MATCHED'
          AND "varianceAtomic" = 0
          AND "resolvedAt" IS NULL
      ) THEN
        RAISE EXCEPTION 'legacy exact resolution normalization is incorrect';
      END IF;

      BEGIN
        UPDATE "UpstreamReconciliation"
        SET "sourceChecksum" = repeat('c', 64)
        WHERE "id" = 'alpha6-upgrade-exception';
        RAISE EXCEPTION 'immutable reconciliation update unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'immutable reconciliation update unexpectedly succeeded' THEN RAISE; END IF;
      END;

      BEGIN
        INSERT INTO "UpstreamReconciliation" (
          "id", "assetId", "upstreamPoolId", "rewardPeriodId", "upstreamGrossReward",
          "upstreamFee", "receivedAmount", "internalExpectedAmount", "varianceAmount", "status",
          "sourceReference", "sourceChecksum", "importIdempotencyKey", "upstreamGrossAtomic",
          "upstreamFeeAtomic", "networkFeeAtomic", "receivedAtomic", "internalExpectedAtomic",
          "varianceAtomic", "toleranceAtomic", "exceptionCode", "exceptionMessage", "updatedAt"
        ) SELECT
          'alpha6-upgrade-forged-active', "assetId", "upstreamPoolId", "rewardPeriodId",
          "upstreamGrossReward", "upstreamFee", "receivedAmount", "internalExpectedAmount",
          "varianceAmount", 'EXCEPTION', 'alpha6-upgrade-forged-source', repeat('d', 64),
          'alpha6-upgrade-forged-import', "upstreamGrossAtomic", "upstreamFeeAtomic",
          "networkFeeAtomic", "receivedAtomic", "internalExpectedAtomic", "varianceAtomic",
          "toleranceAtomic", "exceptionCode", "exceptionMessage", NOW()
        FROM "UpstreamReconciliation" WHERE "id" = 'alpha6-upgrade-exception';
        RAISE EXCEPTION 'second active reconciliation unexpectedly succeeded';
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END $$;
  `);
}

process.stdout.write(`\nv0.3.0-alpha.6 ${mode} migration verification completed successfully.\n`);
