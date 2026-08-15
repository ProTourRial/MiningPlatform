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
  throw new Error('Usage: node scripts/verify-v030-alpha5-migration.mjs <fresh|upgrade>');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const expectedAck =
  mode === 'fresh' ? 'v030-alpha5-fresh-empty-database' : 'v030-alpha4-upgrade-copy';
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
const targetMigration = '20260816020000_financial_truth_foundation';
const targetDirectory = join(migrationsRoot, targetMigration);
const parkedDirectory = join(dirname(migrationsRoot), `.${targetMigration}.disabled`);
if (!existsSync(targetDirectory)) throw new Error(`Missing migration: ${targetMigration}`);
if (existsSync(parkedDirectory)) {
  throw new Error(`Remove stale parked migration directory: ${parkedDirectory}`);
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
  renameSync(targetDirectory, parkedDirectory);
  try {
    run('pnpm', ['db:migrate:deploy']);
    run('pnpm', ['db:seed']);
    psql(`
      INSERT INTO "User" (
        "id", "email", "passwordHash", "displayName", "status", "emailVerifiedAt", "updatedAt"
      ) VALUES (
        'upgrade-v10-user', 'upgrade-v10@local.invalid', 'DISPOSABLE_MIGRATION_FIXTURE',
        'Upgrade v10 Fixture', 'ACTIVE', NOW(), NOW()
      );

      INSERT INTO "MiningAccount" (
        "id", "userId", "assetId", "feePolicyId", "username", "rewardMethod",
        "platformFeePercent", "updatedAt"
      ) SELECT
        'upgrade-v10-account', 'upgrade-v10-user', asset."id", policy."id",
        'upgrade-v10', 'FOLLOW_UPSTREAM', 0.5000, NOW()
      FROM "Asset" asset
      JOIN "MiningFeePolicy" policy ON policy."id" = 'fee-policy-platform-default-v1'
      WHERE asset."symbol" = 'BTC';

      INSERT INTO "UpstreamPool" (
        "id", "assetId", "poolKey", "name", "host", "port", "rewardMethod", "status", "updatedAt"
      ) SELECT
        'upgrade-v10-pool', "id", 'upgrade-v10-pool', 'Upgrade v10 Pool', '127.0.0.1', 3333,
        'FOLLOW_UPSTREAM', 'OPERATIONAL', NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';

      INSERT INTO "RewardPeriod" (
        "id", "assetId", "upstreamPoolId", "method", "status", "periodStart", "periodEnd",
        "grossReward", "upstreamFee", "networkFee", "platformFee", "distributableReward",
        "reconciliationStatus", "updatedAt"
      ) SELECT
        'upgrade-v10-period', "id", 'upgrade-v10-pool', 'FOLLOW_UPSTREAM', 'CLOSED',
        '2026-08-15T00:00:00Z', '2026-08-15T01:00:00Z',
        1.00000000, 0.01000000, 0.02000000, 0.00500000, 0.97000000,
        'RECONCILED', NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';

      INSERT INTO "RewardAllocation" (
        "id", "rewardPeriodId", "miningAccountId", "feePolicyId", "feePolicyVersion",
        "feeBasisPoints", "feePolicySnapshot", "contribution", "grossAmount",
        "platformFeeAmount", "netAmount"
      ) SELECT
        'upgrade-v10-allocation', 'upgrade-v10-period', 'upgrade-v10-account', account."feePolicyId", 1,
        50, '{"legacyFixture":true}'::jsonb, 1, 1.00000000, 0.00500000, 0.99500000
      FROM "MiningAccount" account WHERE account."id" = 'upgrade-v10-account';

      INSERT INTO "UpstreamReconciliation" (
        "id", "assetId", "upstreamPoolId", "rewardPeriodId", "upstreamGrossReward",
        "upstreamFee", "receivedAmount", "internalExpectedAmount", "varianceAmount",
        "status", "sourceReference", "updatedAt"
      ) SELECT
        'upgrade-v10-reconciliation', "id", 'upgrade-v10-pool', 'upgrade-v10-period',
        1.00000000, 0.01000000, 0.99000000, 0.99000000, 0,
        'MATCHED', NULL, NOW()
      FROM "Asset" WHERE "symbol" = 'BTC';
    `);
  } finally {
    renameSync(parkedDirectory, targetDirectory);
  }
}

run('pnpm', ['db:migrate:deploy']);
run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);

psql(`
  DO $$
  BEGIN
    IF to_regclass('public."ContributionFact"') IS NULL
       OR to_regclass('public."RewardPeriodContribution"') IS NULL THEN
      RAISE EXCEPTION 'financial truth tables are missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'JournalLine' AND column_name = 'debitAtomic'
    ) THEN
      RAISE EXCEPTION 'atomic journal columns are missing';
    END IF;
  END $$;
`);

if (mode === 'upgrade') {
  psql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "RewardPeriod"
        WHERE "id" = 'upgrade-v10-period'
          AND "grossAtomic" = 100000000
          AND "upstreamFeeAtomic" = 1000000
          AND "networkFeeAtomic" = 2000000
          AND "distributableAtomic" = 97000000
          AND "platformFeeAtomic" = 500000
          AND "userNetAtomic" = 96500000
          AND "reconciliationStatus" = 'MATCHED'
      ) THEN
        RAISE EXCEPTION 'legacy reward-period atomic backfill is incorrect';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "RewardAllocation"
        WHERE "id" = 'upgrade-v10-allocation'
          AND "grossAtomic" = 100000000
          AND "platformFeeAtomic" = 500000
          AND "netAtomic" = 99500000
      ) THEN
        RAISE EXCEPTION 'legacy reward-allocation backfill is incorrect';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "UpstreamReconciliation"
        WHERE "id" = 'upgrade-v10-reconciliation'
          AND "sourceReference" = 'legacy:upgrade-v10-reconciliation'
          AND "sourceChecksum" = 'legacy-unverified:upgrade-v10-reconciliation'
          AND "status" = 'MATCHED'
      ) THEN
        RAISE EXCEPTION 'legacy reconciliation backfill is incorrect';
      END IF;

      BEGIN
        UPDATE "RewardAllocation" SET "netAtomic" = 1 WHERE "id" = 'upgrade-v10-allocation';
        RAISE EXCEPTION 'immutable allocation update unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'immutable allocation update unexpectedly succeeded' THEN RAISE; END IF;
      END;
    END $$;
  `);
}

process.stdout.write(`\nv0.3.0-alpha.5 ${mode} migration verification completed successfully.\n`);
