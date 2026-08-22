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
if (!['fresh', 'upgrade'].includes(mode)) {
  throw new Error('Usage: node scripts/verify-v030-alpha7-migration.mjs <fresh|upgrade>');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const expectedAck =
  mode === 'fresh' ? 'v030-alpha7-fresh-empty-database' : 'v030-alpha6-upgrade-copy';
if (process.env.MIGRATION_TEST_ACK !== expectedAck) {
  throw new Error(
    `Set MIGRATION_TEST_ACK=${expectedAck} after confirming the database is disposable`,
  );
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = '20260822010000_payout_control_foundation';
const migrationTarget = join(root, 'packages/database/prisma/migrations', migrationName);
const migrationParked = join(root, 'packages/database/prisma', `.${migrationName}.disabled`);
if (!existsSync(migrationTarget)) throw new Error(`Missing migration: ${migrationName}`);
if (existsSync(migrationParked))
  throw new Error(`Remove stale parked migration: ${migrationParked}`);

const psqlUrl = new URL(process.env.DATABASE_URL);
psqlUrl.searchParams.delete('schema');
const psqlContainer = process.env.MIGRATION_PSQL_CONTAINER;

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
    { redactArgs: true },
  );
}

psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

if (mode === 'upgrade') {
  renameSync(migrationTarget, migrationParked);
  try {
    run('pnpm', ['db:migrate:deploy']);
    psql(`
      INSERT INTO "Asset" (
        "id", "symbol", "name", "algorithm", "decimals", "enabled",
        "minimumPayout", "requiredConfirmations", "updatedAt"
      ) VALUES (
        'alpha7-upgrade-btc', 'BTC', 'Bitcoin', 'SHA256', 8, true,
        0.001, 3, NOW()
      );

      INSERT INTO "User" (
        "id", "email", "passwordHash", "displayName", "role", "status",
        "accountType", "emailVerifiedAt", "updatedAt"
      ) VALUES (
        'alpha7-upgrade-user', 'alpha7-upgrade@local.invalid', 'UPGRADE_FIXTURE',
        'Alpha7 Upgrade User', 'USER', 'ACTIVE', 'INDIVIDUAL', NOW(), NOW()
      );

      INSERT INTO "UserSecurity" (
        "id", "userId", "totpEnabled", "recoveryCodesHash", "failedLoginCount",
        "passwordChangedAt", "createdAt", "updatedAt"
      ) VALUES (
        'alpha7-upgrade-security', 'alpha7-upgrade-user', true, ARRAY[]::TEXT[], 0,
        NOW(), NOW(), NOW()
      );

      INSERT INTO "AuthSession" (
        "id", "userId", "tokenFamilyId", "refreshTokenHash", "expiresAt"
      ) VALUES (
        'alpha7-upgrade-session', 'alpha7-upgrade-user', 'alpha7-upgrade-family',
        repeat('e', 64), NOW() + INTERVAL '1 day'
      );

      INSERT INTO "PayoutAddress" (
        "id", "userId", "assetId", "address", "label", "verified", "active",
        "activatedAt", "updatedAt"
      ) VALUES (
        'alpha7-upgrade-address', 'alpha7-upgrade-user', 'alpha7-upgrade-btc',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'Legacy active address', true, true,
        NOW() - INTERVAL '1 day', NOW()
      );

      INSERT INTO "Payout" (
        "id", "idempotencyKey", "userId", "assetId", "payoutAddressId", "amount",
        "networkFee", "status", "scheduledAt", "updatedAt"
      ) VALUES (
        'alpha7-upgrade-payout', 'alpha7-upgrade-payout-key', 'alpha7-upgrade-user',
        'alpha7-upgrade-btc', 'alpha7-upgrade-address', 0.001, 0, 'QUEUED', NOW(), NOW()
      );
    `);
  } finally {
    renameSync(migrationParked, migrationTarget);
  }
}

run('pnpm', ['db:migrate:deploy']);
run('pnpm', ['db:seed']);
run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);

psql(`
  DO $$
  DECLARE
    btc_id TEXT;
    network_id TEXT;
    route_id TEXT;
    address_id TEXT;
    pilot_route_id TEXT := 'alpha7-verifier-pilot-route';
    pilot_address_id TEXT := 'alpha7-verifier-pilot-address';
  BEGIN
    IF to_regclass('public."StepUpAuthorization"') IS NULL
      OR to_regclass('public."AssetNetwork"') IS NULL
      OR to_regclass('public."PayoutRoute"') IS NULL
    THEN
      RAISE EXCEPTION 'payout-control foundation tables are missing';
    END IF;

    SELECT "id" INTO btc_id FROM "Asset" WHERE "symbol" = 'BTC';
    SELECT "id" INTO network_id
      FROM "AssetNetwork"
      WHERE "assetId" = btc_id AND "networkKey" = 'bitcoin-mainnet';
    SELECT "id" INTO route_id
      FROM "PayoutRoute"
      WHERE "assetNetworkId" = network_id AND "routeKey" = 'default' AND "version" = 1;

    IF network_id IS NULL OR route_id IS NULL THEN
      RAISE EXCEPTION 'Bitcoin mainnet payout catalog was not seeded';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "PayoutRoute"
      WHERE "id" = route_id
        AND "status" = 'ADDRESS_REGISTRATION'
        AND "minimumPayoutAtomic" = 100000
        AND "addressCooldownSeconds" = 86400
        AND "manualApprovalRequired"
    ) THEN
      RAISE EXCEPTION 'Bitcoin payout route safety policy is incorrect';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'UserSecurity'
        AND column_name = 'lastTotpCounter'
    ) THEN
      RAISE EXCEPTION 'TOTP replay counter column is missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      WHERE relation.relname = 'StepUpAuthorization'
        AND trigger.tgname = 'StepUpAuthorization_immutable_trigger'
        AND NOT trigger.tgisinternal
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      WHERE relation.relname = 'PayoutAddress'
        AND trigger.tgname = 'PayoutAddress_lifecycle_trigger'
        AND NOT trigger.tgisinternal
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      WHERE relation.relname = 'Payout'
        AND trigger.tgname = 'Payout_route_alignment_trigger'
        AND NOT trigger.tgisinternal
    ) THEN
      RAISE EXCEPTION 'payout-control database triggers are missing';
    END IF;

    INSERT INTO "User" (
      "id", "email", "passwordHash", "displayName", "role", "status",
      "accountType", "emailVerifiedAt", "updatedAt"
    ) VALUES (
      'alpha7-verifier-user', 'alpha7-verifier@local.invalid', 'VERIFIER_FIXTURE',
      'Alpha7 Verifier User', 'USER', 'ACTIVE', 'INDIVIDUAL', NOW(), NOW()
    ) ON CONFLICT ("id") DO NOTHING;
    INSERT INTO "UserSecurity" (
      "id", "userId", "totpEnabled", "recoveryCodesHash", "failedLoginCount",
      "passwordChangedAt", "createdAt", "updatedAt"
    ) VALUES (
      'alpha7-verifier-security', 'alpha7-verifier-user', true, ARRAY[]::TEXT[], 0,
      NOW(), NOW(), NOW()
    ) ON CONFLICT ("userId") DO NOTHING;
    INSERT INTO "AuthSession" (
      "id", "userId", "tokenFamilyId", "refreshTokenHash", "expiresAt"
    ) VALUES (
      'alpha7-verifier-session', 'alpha7-verifier-user', 'alpha7-verifier-family',
      repeat('f', 64), NOW() + INTERVAL '1 day'
    ) ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "StepUpAuthorization" (
      "id", "userId", "sessionId", "scope", "tokenHash", "expiresAt"
    ) VALUES (
      'alpha7-verifier-step-up', 'alpha7-verifier-user', 'alpha7-verifier-session',
      'PAYOUT_ADDRESS_WRITE', repeat('a', 64), NOW() + INTERVAL '5 minutes'
    );
    UPDATE "StepUpAuthorization" SET "consumedAt" = NOW()
      WHERE "id" = 'alpha7-verifier-step-up';

    BEGIN
      UPDATE "StepUpAuthorization" SET "consumedAt" = NOW()
        WHERE "id" = 'alpha7-verifier-step-up';
      RAISE EXCEPTION 'step-up authorization replay unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'step-up authorization replay unexpectedly succeeded' THEN RAISE; END IF;
    END;

    BEGIN
      UPDATE "PayoutRoute" SET "addressCooldownSeconds" = 0 WHERE "id" = route_id;
      RAISE EXCEPTION 'payout route mutation unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'payout route mutation unexpectedly succeeded' THEN RAISE; END IF;
    END;

    SELECT "id" INTO address_id FROM "PayoutAddress"
      WHERE "id" = 'alpha7-upgrade-address';
    IF address_id IS NULL THEN
      INSERT INTO "PayoutAddress" (
        "id", "userId", "assetId", "assetNetworkId", "payoutRouteId", "address",
        "addressHash", "label", "status", "verified", "verifiedAt", "active",
        "cooldownUntil", "activatedAt", "createdAt", "updatedAt"
      ) VALUES (
        'alpha7-verifier-address', 'alpha7-verifier-user', btc_id, network_id, route_id,
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        encode(digest(network_id || ':1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'sha256'), 'hex'),
        'Verifier active address', 'ACTIVE', true, NOW(), true,
        NOW() - INTERVAL '1 second', NOW(), NOW(), NOW()
      );
      address_id := 'alpha7-verifier-address';
    END IF;

    BEGIN
      UPDATE "PayoutAddress" SET "address" = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT'
        WHERE "id" = address_id;
      RAISE EXCEPTION 'payout address identity mutation unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'payout address identity mutation unexpectedly succeeded' THEN RAISE; END IF;
    END;

    INSERT INTO "PayoutRoute" (
      "id", "assetNetworkId", "routeKey", "version", "status",
      "minimumPayoutAtomic", "fixedNetworkFeeAtomic", "addressCooldownSeconds",
      "requiredConfirmations", "manualApprovalRequired", "effectiveFrom",
      "changeReason"
    ) VALUES (
      pilot_route_id, network_id, 'verifier-pilot', 1, 'PILOT',
      1, 0, 0, 1, true, NOW() - INTERVAL '1 minute',
      'Disposable migration verifier pilot route.'
    );
    INSERT INTO "PayoutAddress" (
      "id", "userId", "assetId", "assetNetworkId", "payoutRouteId", "address",
      "addressHash", "label", "status", "verified", "verifiedAt", "active",
      "cooldownUntil", "activatedAt", "createdAt", "updatedAt"
    ) VALUES (
      pilot_address_id, 'alpha7-verifier-user', btc_id, network_id, pilot_route_id,
      '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      encode(digest(network_id || ':1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'sha256'), 'hex'),
      'Verifier pilot address', 'ACTIVE', true, NOW(), true,
      NOW() - INTERVAL '1 second', NOW(), NOW(), NOW()
    );
    INSERT INTO "Payout" (
      "id", "idempotencyKey", "userId", "assetId", "payoutAddressId",
      "payoutRouteId", "amount", "networkFee", "status", "scheduledAt", "updatedAt"
    ) VALUES (
      'alpha7-verifier-pilot-payout', 'alpha7-verifier-pilot-payout-key',
      'alpha7-verifier-user', btc_id, pilot_address_id, pilot_route_id,
      0.00000001, 0, 'REVIEW', NOW(), NOW()
    );
    BEGIN
      UPDATE "Payout" SET "status" = 'SIGNING'
        WHERE "id" = 'alpha7-verifier-pilot-payout';
      RAISE EXCEPTION 'pilot payout status gate unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'pilot payout status gate unexpectedly succeeded' THEN RAISE; END IF;
    END;
    UPDATE "Payout" SET "status" = 'CANCELLED'
      WHERE "id" = 'alpha7-verifier-pilot-payout';
    IF NOT EXISTS (
      SELECT 1 FROM "Payout"
      WHERE "id" = 'alpha7-verifier-pilot-payout' AND "status" = 'CANCELLED'
    ) THEN
      RAISE EXCEPTION 'pilot payout fail-closed cancellation did not persist';
    END IF;
  END $$;
`);

if (mode === 'upgrade') {
  psql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "PayoutAddress" address
        JOIN "AssetNetwork" network ON network."id" = address."assetNetworkId"
        JOIN "PayoutRoute" route ON route."id" = address."payoutRouteId"
        WHERE address."id" = 'alpha7-upgrade-address'
          AND address."status" = 'ACTIVE'
          AND address."active"
          AND address."verified"
          AND network."assetId" = address."assetId"
          AND route."assetNetworkId" = network."id"
      ) THEN
        RAISE EXCEPTION 'legacy payout address was not backfilled safely';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "Payout" payout
        JOIN "PayoutAddress" address ON address."id" = payout."payoutAddressId"
        WHERE payout."id" = 'alpha7-upgrade-payout'
          AND payout."payoutRouteId" = address."payoutRouteId"
      ) THEN
        RAISE EXCEPTION 'legacy payout route reference was not backfilled';
      END IF;
      BEGIN
        UPDATE "Payout" SET "status" = 'SIGNING'
          WHERE "id" = 'alpha7-upgrade-payout';
        RAISE EXCEPTION 'registration-only legacy payout status gate unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'registration-only legacy payout status gate unexpectedly succeeded' THEN
          RAISE;
        END IF;
      END;
      UPDATE "Payout" SET "status" = 'CANCELLED'
        WHERE "id" = 'alpha7-upgrade-payout';
      IF NOT EXISTS (
        SELECT 1 FROM "Payout"
        WHERE "id" = 'alpha7-upgrade-payout' AND "status" = 'CANCELLED'
      ) THEN
        RAISE EXCEPTION 'legacy payout cancellation did not persist';
      END IF;
    END $$;
  `);
}

process.stdout.write(`\nv0.3.0-alpha.7 ${mode} migration verification completed successfully.\n`);
