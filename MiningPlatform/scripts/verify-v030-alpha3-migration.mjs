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
  throw new Error('Usage: node scripts/verify-v030-alpha3-migration.mjs <fresh|upgrade>');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const expectedAck =
  mode === 'fresh' ? 'v030-alpha3-fresh-empty-database' : 'v030-alpha2-upgrade-copy';
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
const targetMigration = '20260813010000_versioned_fee_policy';
const targetDirectory = join(migrationsRoot, targetMigration);
const parkedDirectory = join(dirname(migrationsRoot), `.${targetMigration}.disabled`);
if (!existsSync(targetDirectory)) throw new Error(`Missing migration: ${targetMigration}`);
if (existsSync(parkedDirectory))
  throw new Error(`Remove stale parked migration directory: ${parkedDirectory}`);

function run(command, args, options = {}) {
  process.stdout.write(
    `\n> ${command} ${options.redactArgs ? '[arguments redacted]' : args.join(' ')}\n`,
  );
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: options.shell ?? process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 1}`);
}

function psql(command) {
  if (psqlContainer) {
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
    return;
  }

  run('psql', [psqlUrl.toString(), '--set', 'ON_ERROR_STOP=1', '--command', command], {
    redactArgs: true,
  });
}

psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

if (mode === 'upgrade') {
  renameSync(targetDirectory, parkedDirectory);
  try {
    run('pnpm', ['db:migrate:deploy']);
    run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);
    psql(`
      INSERT INTO "User" ("id", "email", "passwordHash", "displayName", "status", "updatedAt") VALUES
        ('upgrade-user-default', 'default-upgrade@example.test', 'not-a-real-hash', 'Default Upgrade', 'ACTIVE', NOW()),
        ('upgrade-user-custom', 'custom-upgrade@example.test', 'not-a-real-hash', 'Custom Upgrade', 'ACTIVE', NOW());
      INSERT INTO "Asset" ("id", "symbol", "name", "algorithm", "decimals", "enabled", "minimumPayout", "updatedAt")
        VALUES ('upgrade-btc', 'UPGRADE-BTC', 'Upgrade Bitcoin', 'SHA256', 8, TRUE, 0.001, NOW());
      INSERT INTO "MiningAccount" ("id", "userId", "assetId", "username", "platformFeePercent", "updatedAt") VALUES
        ('upgrade-account-default', 'upgrade-user-default', 'upgrade-btc', 'upgrade.default', 2.0000, NOW()),
        ('upgrade-account-custom', 'upgrade-user-custom', 'upgrade-btc', 'upgrade.custom', 1.2500, NOW());
      INSERT INTO "RewardPeriod" (
        "id", "assetId", "method", "status", "periodStart", "periodEnd",
        "grossReward", "platformFee", "distributableReward", "updatedAt"
      ) VALUES (
        'upgrade-period', 'upgrade-btc', 'FOLLOW_UPSTREAM', 'CLOSED',
        '2026-08-12T00:00:00Z', '2026-08-12T01:00:00Z', 1.00000000, 0.02000000, 0.98000000, NOW()
      );
      INSERT INTO "RewardAllocation" (
        "id", "rewardPeriodId", "miningAccountId", "contribution",
        "grossAmount", "platformFeeAmount", "netAmount"
      ) VALUES (
        'upgrade-allocation', 'upgrade-period', 'upgrade-account-default', 1,
        1.00000000, 0.02000000, 0.98000000
      );
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
    IF NOT EXISTS (
      SELECT 1 FROM "MiningFeePolicy"
      WHERE "policyKey" = 'platform-default' AND "version" = 1
        AND "status" = 'ACTIVE' AND "scope" = 'PLATFORM_DEFAULT'
        AND "feeBasisPoints" = 50
    ) THEN
      RAISE EXCEPTION 'active 0.5 percent default fee policy is missing';
    END IF;
  END $$;
`);

if (mode === 'upgrade') {
  psql(`
    DO $$
    DECLARE allocation_snapshot JSONB;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "MiningAccount" account
        JOIN "MiningFeePolicy" policy ON policy."id" = account."feePolicyId"
        WHERE account."id" = 'upgrade-account-default'
          AND account."platformFeePercent" = 0.5000
          AND policy."policyKey" = 'platform-default'
          AND policy."version" = 1
          AND policy."feeBasisPoints" = 50
      ) THEN
        RAISE EXCEPTION 'legacy 2 percent account was not migrated to default v1';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM "MiningAccount" account
        JOIN "MiningFeePolicy" policy ON policy."id" = account."feePolicyId"
        WHERE account."id" = 'upgrade-account-custom'
          AND account."platformFeePercent" = 1.2500
          AND policy."scope" = 'MINING_ACCOUNT'
          AND policy."feeBasisPoints" = 125
      ) THEN
        RAISE EXCEPTION 'custom account fee was not retained';
      END IF;

      SELECT "feePolicySnapshot" INTO allocation_snapshot
      FROM "RewardAllocation"
      WHERE "id" = 'upgrade-allocation'
        AND "grossAmount" = 1.00000000
        AND "platformFeeAmount" = 0.02000000
        AND "netAmount" = 0.98000000
        AND "feeBasisPoints" = 200
        AND "feePolicyVersion" = 0;
      IF allocation_snapshot IS NULL OR allocation_snapshot->>'legacyImported' <> 'true' THEN
        RAISE EXCEPTION 'historical allocation was not preserved with a legacy snapshot';
      END IF;
    END $$;
  `);
}

process.stdout.write(`\nv0.3.0-alpha.3 ${mode} migration verification completed successfully.\n`);
