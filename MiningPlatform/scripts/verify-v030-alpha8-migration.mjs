/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
if (!['fresh', 'upgrade'].includes(mode)) {
  throw new Error('Usage: node scripts/verify-v030-alpha8-migration.mjs <fresh|upgrade>');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const expectedAck =
  mode === 'fresh' ? 'v030-alpha8-fresh-empty-database' : 'v030-alpha7-upgrade-empty-database';
if (process.env.MIGRATION_TEST_ACK !== expectedAck) {
  throw new Error(
    `Set MIGRATION_TEST_ACK=${expectedAck} after provisioning a new disposable database`,
  );
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verifierTempRoot = resolve(process.env.MININGPLATFORM_TEMP_ROOT ?? tmpdir());
const latestMigration = '20260825010000_randomx_accounting_evidence';
const migrationsRoot = join(root, 'packages/database/prisma/migrations');
if (!existsSync(join(migrationsRoot, latestMigration, 'migration.sql'))) {
  throw new Error(`Missing migration: ${latestMigration}`);
}

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

// Never reset a caller-supplied database. The verifier only accepts a newly
// provisioned database with no Prisma migration history or public tables.
psql(`
  DO $$
  BEGIN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      )
    THEN RAISE EXCEPTION 'migration verifier requires a new empty disposable database'; END IF;
  END $$;
`);

let temporaryPrismaRoot;
let temporaryMigrations;
try {
  if (mode === 'upgrade') {
    mkdirSync(verifierTempRoot, { recursive: true });
    temporaryPrismaRoot = join(
      verifierTempRoot,
      `miningplatform-alpha8-migrations-${process.pid}-${Date.now()}`,
    );
    temporaryMigrations = join(temporaryPrismaRoot, 'migrations');
    mkdirSync(temporaryMigrations, { recursive: true });
    for (const migration of [
      '20260730000100_baseline_core_mining',
      '20260730000200_hardening_alpha_2',
      '20260731020000_universal_miner_detection',
      '20260731030000_architecture_miner_identity',
      '20260731110000_upstream_resilience',
      '20260731190000_identity_access',
      '20260803010000_control_plane_foundation',
      '20260803040000_auth_session_rotation_hardening',
      '20260813010000_versioned_fee_policy',
      '20260816020000_financial_truth_foundation',
      '20260821010000_reconciliation_exception_lifecycle',
      '20260821020000_referral_fee_foundation',
      '20260822010000_payout_control_foundation',
    ]) {
      cpSync(join(migrationsRoot, migration), join(temporaryMigrations, migration), {
        recursive: true,
      });
    }
    cpSync(
      join(migrationsRoot, 'migration_lock.toml'),
      join(temporaryMigrations, 'migration_lock.toml'),
    );
    writeFileSync(
      join(temporaryPrismaRoot, 'schema.prisma'),
      'datasource db {\n  provider = "postgresql"\n}\n',
      'utf8',
    );
    writeFileSync(
      join(temporaryPrismaRoot, 'prisma.config.ts'),
      `import { defineConfig, env } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(
        join(temporaryPrismaRoot, 'schema.prisma'),
      )}, migrations: { path: ${JSON.stringify(
        temporaryMigrations,
      )} }, datasource: { url: env('DATABASE_URL') } });\n`,
      'utf8',
    );
    run('pnpm', [
      '--filter',
      '@mining/database',
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--config',
      join(temporaryPrismaRoot, 'prisma.config.ts'),
    ]);
    psql(`
      INSERT INTO "Asset" (
        "id", "symbol", "name", "algorithm", "decimals", "enabled",
        "minimumPayout", "requiredConfirmations", "updatedAt"
      ) VALUES (
        'alpha8-upgrade-btc', 'BTC', 'Bitcoin', 'SHA256', 8, true, 0.001, 3, NOW()
      );
      INSERT INTO "AssetNetwork" (
        "id", "assetId", "networkKey", "displayName", "chainFamily",
        "addressValidator", "isTestnet", "enabled", "updatedAt"
      ) VALUES (
        'asset-network-alpha8-upgrade-btc', 'alpha8-upgrade-btc', 'bitcoin-mainnet',
        'Bitcoin Mainnet', 'BITCOIN', 'BITCOIN', false, true, NOW()
      );
      INSERT INTO "User" (
        "id", "email", "passwordHash", "displayName", "role", "status",
        "accountType", "emailVerifiedAt", "updatedAt"
      ) VALUES (
        'alpha8-upgrade-user', 'alpha8-upgrade@local.invalid', 'UPGRADE_FIXTURE',
        'Alpha8 Upgrade User', 'USER', 'ACTIVE', 'INDIVIDUAL', NOW(), NOW()
      );
      INSERT INTO "PayoutRoute" (
        "id", "assetNetworkId", "routeKey", "version", "status", "minimumPayoutAtomic",
        "fixedNetworkFeeAtomic", "addressCooldownSeconds", "requiredConfirmations",
        "manualApprovalRequired", "effectiveFrom", "changeReason"
      ) SELECT 'alpha8-upgrade-route', network."id", 'upgrade-pilot', 1, 'PILOT', 1,
        0, 0, 3, true, NOW() - INTERVAL '1 day', 'Representative alpha.7 pilot payout.'
      FROM "AssetNetwork" network JOIN "Asset" asset ON asset."id" = network."assetId"
      WHERE asset."symbol" = 'BTC' AND network."networkKey" = 'bitcoin-mainnet';
      INSERT INTO "PayoutAddress" (
        "id", "userId", "assetId", "assetNetworkId", "payoutRouteId", "address",
        "addressHash", "status", "verified", "verifiedAt", "active", "cooldownUntil",
        "activatedAt", "updatedAt"
      ) SELECT 'alpha8-upgrade-address', 'alpha8-upgrade-user', asset."id", network."id",
        'alpha8-upgrade-route', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', repeat('a', 64),
        'ACTIVE', true, NOW() - INTERVAL '1 day', true, NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day', NOW()
      FROM "Asset" asset JOIN "AssetNetwork" network ON network."assetId" = asset."id"
      WHERE asset."symbol" = 'BTC' AND network."networkKey" = 'bitcoin-mainnet';
      INSERT INTO "Payout" (
        "id", "idempotencyKey", "userId", "assetId", "payoutAddressId", "payoutRouteId",
        "amount", "networkFee", "status", "scheduledAt", "updatedAt"
      ) SELECT 'alpha8-upgrade-payout', 'alpha8-upgrade-payout-key', 'alpha8-upgrade-user',
        asset."id", 'alpha8-upgrade-address', 'alpha8-upgrade-route', 0.001, 0, 'REVIEW', NOW(), NOW()
      FROM "Asset" asset WHERE asset."symbol" = 'BTC';
    `);

    for (const migration of [
      '20260823010000_controlled_payout_execution',
      '20260824010000_native_bitcoin_submission_evidence',
    ]) {
      cpSync(join(migrationsRoot, migration), join(temporaryMigrations, migration), {
        recursive: true,
      });
    }
    run('pnpm', [
      '--filter',
      '@mining/database',
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--config',
      join(temporaryPrismaRoot, 'prisma.config.ts'),
    ]);
    psql(`
      INSERT INTO "NativeBitcoinCandidate" (
        "id", "idempotencyKey", "chain", "jobId", "templateSourceDigest",
        "coinbasePolicyDigest", "blockHash", "headerHex", "rawBlockDigest", "reconstructedAt"
      ) VALUES (
        'alpha8-upgrade-native-candidate', 'alpha8-upgrade-native-candidate-key', 'REGTEST',
        'native-404-aaaaaaaaaaaaaaaaaaaaaaaa', repeat('a', 64), repeat('b', 64),
        repeat('c', 64), repeat('d', 160), repeat('e', 64), NOW()
      );
      INSERT INTO "NativeBitcoinProposalEvidence" (
        "id", "idempotencyKey", "candidateId", "status", "reason",
        "rawBlockDigest", "sourceDigest", "observedAt", "validUntil"
      ) VALUES (
        'alpha8-upgrade-native-proposal', 'alpha8-upgrade-native-proposal-key',
        'alpha8-upgrade-native-candidate', 'VALID', NULL, repeat('e', 64), repeat('f', 64),
        NOW(), NOW() + INTERVAL '30 seconds'
      );
      INSERT INTO "NativeBitcoinSubmissionAttempt" (
        "id", "idempotencyKey", "candidateId", "proposalEvidenceId", "status", "reason",
        "rawBlockDigest", "workId", "sourceDigest", "observedAt"
      ) VALUES (
        'alpha8-upgrade-native-submission', 'alpha8-upgrade-native-submission-key',
        'alpha8-upgrade-native-candidate', 'alpha8-upgrade-native-proposal', 'ACCEPTED', NULL,
        repeat('e', 64), 'alpha8-upgrade-work', repeat('1', 64), NOW()
      );
    `);
  }

  run('pnpm', ['db:migrate:deploy']);
  run('pnpm', ['db:seed']);
  run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);

  psql(`
    DO $$
    DECLARE btc_id TEXT;
    BEGIN
      SELECT "id" INTO btc_id FROM "Asset" WHERE "symbol" = 'BTC';
      IF to_regclass('public."PayoutEligibility"') IS NULL
        OR to_regclass('public."BalanceReservation"') IS NULL
        OR to_regclass('public."PayoutApproval"') IS NULL
        OR to_regclass('public."SigningRequest"') IS NULL
        OR to_regclass('public."BroadcastAttempt"') IS NULL
        OR to_regclass('public."ChainObservation"') IS NULL
        OR to_regclass('public."PayoutReconciliation"') IS NULL
        OR to_regclass('public."WalletReconciliation"') IS NULL
        OR to_regclass('public."PayoutControl"') IS NULL
        OR to_regclass('public."NativeBitcoinCandidate"') IS NULL
        OR to_regclass('public."NativeBitcoinProposalEvidence"') IS NULL
        OR to_regclass('public."NativeBitcoinSubmissionIntent"') IS NULL
        OR to_regclass('public."NativeBitcoinSubmissionRecoveryObservation"') IS NULL
        OR to_regclass('public."NativeBitcoinSubmissionAttempt"') IS NULL
        OR to_regclass('public."RandomXAcceptedShareEvidence"') IS NULL
      THEN RAISE EXCEPTION 'required schema-18 tables are missing'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'PayoutRoute'
          AND column_name = 'payoutWalletId'
      ) THEN RAISE EXCEPTION 'payout route wallet binding is missing'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "PayoutControl" WHERE "assetId" = btc_id AND "paused"
          AND NOT "requestsEnabled" AND NOT "signingEnabled" AND NOT "broadcastEnabled"
      ) THEN RAISE EXCEPTION 'payout control did not seed fail-closed'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'Payout' AND t.tgname = 'Payout_required_evidence_trigger'
          AND t.tgdeferrable AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'BalanceReservation' AND t.tgname = 'BalanceReservation_lifecycle_trigger'
          AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'PayoutApproval' AND t.tgname = 'PayoutApproval_separation_trigger'
          AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'PayoutRoute' AND t.tgname = 'PayoutRoute_wallet_alignment_trigger'
          AND NOT t.tgisinternal
      ) THEN RAISE EXCEPTION 'controlled payout invariant triggers are missing'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinCandidate'
          AND t.tgname = 'NativeBitcoinCandidate_immutable_trigger' AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinProposalEvidence'
          AND t.tgname = 'NativeBitcoinProposalEvidence_correlation_trigger' AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinSubmissionIntent'
          AND t.tgname = 'NativeBitcoinSubmissionIntent_immutable_trigger' AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinSubmissionIntent'
          AND t.tgname = 'NativeBitcoinSubmissionIntent_correlation_trigger' AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinSubmissionRecoveryObservation'
          AND t.tgname = 'NativeBitcoinSubmissionRecoveryObservation_immutable_trigger'
          AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinSubmissionRecoveryObservation'
          AND t.tgname = 'NativeBitcoinSubmissionRecoveryObservation_correlation_trigger'
          AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'NativeBitcoinSubmissionAttempt'
          AND t.tgname = 'NativeBitcoinSubmissionAttempt_correlation_trigger' AND NOT t.tgisinternal
      ) THEN RAISE EXCEPTION 'native Bitcoin evidence triggers are missing'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'RandomXAcceptedShareEvidence'
          AND t.tgname = 'RandomXAcceptedShareEvidence_immutable_trigger'
          AND NOT t.tgisinternal
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'RandomXAcceptedShareEvidence'
          AND t.tgname = 'RandomXAcceptedShareEvidence_correlation_trigger'
          AND NOT t.tgisinternal
      ) THEN RAISE EXCEPTION 'RandomX accounting evidence triggers are missing'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'PayoutApproval'
          AND indexname = 'PayoutApproval_payoutId_key'
      ) THEN RAISE EXCEPTION 'one final payout approval decision is not database-enforced'; END IF;
      IF '${mode}' = 'upgrade' AND NOT EXISTS (
        SELECT 1 FROM "Payout" WHERE "id" = 'alpha8-upgrade-payout' AND "status" = 'REVIEW'
          AND "executionVersion" = 1 AND "miningAccountId" IS NULL AND "amountAtomic" IS NULL
      ) THEN RAISE EXCEPTION 'alpha.7 payout history was rewritten during upgrade'; END IF;
      IF '${mode}' = 'upgrade' AND NOT EXISTS (
        SELECT 1
        FROM "NativeBitcoinSubmissionAttempt" submission
        JOIN "NativeBitcoinSubmissionIntent" intent ON intent."id" = submission."submissionIntentId"
        WHERE submission."id" = 'alpha8-upgrade-native-submission'
          AND submission."status" = 'ACCEPTED'
          AND intent."candidateId" = submission."candidateId"
          AND intent."proposalEvidenceId" = submission."proposalEvidenceId"
          AND intent."rawBlockDigest" = submission."rawBlockDigest"
          AND intent."workId" = submission."workId"
          AND intent."idempotencyKey" LIKE 'migration:v16:%'
      ) THEN RAISE EXCEPTION 'schema-v15 submission history was not linked to a v16 intent'; END IF;
    END $$;
  `);

  psql(`
    INSERT INTO "Asset" (
      "id", "symbol", "name", "algorithm", "decimals", "enabled",
      "minimumPayout", "requiredConfirmations", "updatedAt"
    ) VALUES (
      'alpha8-randomx-asset', 'XMR-ALPHA8', 'RandomX migration fixture', 'RANDOMX', 12,
      false, 0.01, 10, NOW()
    ) ON CONFLICT ("symbol") DO NOTHING;
    INSERT INTO "User" (
      "id", "email", "passwordHash", "displayName", "role", "status",
      "accountType", "emailVerifiedAt", "updatedAt"
    ) VALUES (
      'alpha8-randomx-user', 'randomx-alpha8@local.invalid', 'MIGRATION_FIXTURE',
      'RandomX Migration User', 'USER', 'ACTIVE', 'INDIVIDUAL', NOW(), NOW()
    ) ON CONFLICT ("email") DO NOTHING;
    INSERT INTO "MiningAccount" (
      "id", "userId", "assetId", "feePolicyId", "username", "rewardMethod",
      "platformFeePercent", "updatedAt"
    ) VALUES (
      'alpha8-randomx-account', 'alpha8-randomx-user', 'alpha8-randomx-asset',
      'fee-policy-platform-default-v1', 'alpha8_randomx_account', 'FOLLOW_UPSTREAM',
      0.5, NOW()
    ) ON CONFLICT ("username") DO NOTHING;
    INSERT INTO "Asset" (
      "id", "symbol", "name", "algorithm", "decimals", "enabled",
      "minimumPayout", "requiredConfirmations", "updatedAt"
    ) VALUES (
      'alpha8-nonrandomx-asset', 'SHA-ALPHA8', 'Non-RandomX correlation fixture',
      'SHA256D', 8, false, 0.01, 10, NOW()
    ) ON CONFLICT ("symbol") DO NOTHING;
    INSERT INTO "MiningAccount" (
      "id", "userId", "assetId", "feePolicyId", "username", "rewardMethod",
      "platformFeePercent", "updatedAt"
    ) VALUES (
      'alpha8-nonrandomx-account', 'alpha8-randomx-user', 'alpha8-nonrandomx-asset',
      'fee-policy-platform-default-v1', 'alpha8_nonrandomx_account', 'FOLLOW_UPSTREAM',
      0.5, NOW()
    ) ON CONFLICT ("username") DO NOTHING;
    INSERT INTO "UpstreamPool" (
      "id", "assetId", "poolKey", "name", "host", "port", "tls",
      "rewardMethod", "status", "updatedAt"
    ) VALUES (
      'alpha8-randomx-pool', 'alpha8-randomx-asset', 'alpha8-randomx',
      'RandomX Migration Pool', '127.0.0.1', 3333, false, 'FOLLOW_UPSTREAM', 'SETUP', NOW()
    ) ON CONFLICT ("assetId", "poolKey") DO NOTHING;
    INSERT INTO "UpstreamPool" (
      "id", "assetId", "poolKey", "name", "host", "port", "tls",
      "rewardMethod", "status", "updatedAt"
    ) VALUES (
      'alpha8-nonrandomx-pool', 'alpha8-nonrandomx-asset', 'alpha8-sha',
      'Non-RandomX Correlation Pool', '127.0.0.1', 3334, false,
      'FOLLOW_UPSTREAM', 'SETUP', NOW()
    ) ON CONFLICT ("assetId", "poolKey") DO NOTHING;
    INSERT INTO "RandomXAcceptedShareEvidence" (
      "id", "sourceDigest", "shareFingerprint", "algorithm", "miningAccountId",
      "assetId", "upstreamPoolId", "upstreamSessionId", "upstreamJobId",
      "upstreamClientId", "workerName", "seedHash", "targetHex", "target", "nonce",
      "submittedResult", "computedResult", "acceptedDifficulty", "jobReceivedAt",
      "jobExpiresAt", "submittedAt", "acceptedAt", "correlationId", "validationDigest",
      "upstreamDecisionDigest"
    ) VALUES (
      'alpha8-randomx-evidence', repeat('1', 64), repeat('2', 64), 'rx/0',
      'alpha8-randomx-account', 'alpha8-randomx-asset', 'alpha8-randomx-pool',
      'alpha8-randomx-session', 'alpha8-randomx-job', 'alpha8-randomx-client',
      'alpha8_randomx_account.worker', repeat('3', 64), '0200000000000000', 2,
      '78563412', repeat('4', 64), repeat('4', 64), 1000.5,
      NOW() - INTERVAL '2 minutes', NOW() + INTERVAL '2 minutes',
      NOW() - INTERVAL '1 minute', NOW(), 'alpha8-randomx-correlation', repeat('5', 64),
      repeat('6', 64)
    ) ON CONFLICT ("sourceDigest") DO NOTHING;

    DO $$
    BEGIN
      IF (SELECT count(*) FROM "RandomXAcceptedShareEvidence"
          WHERE "id" = 'alpha8-randomx-evidence') <> 1
      THEN RAISE EXCEPTION 'RandomX evidence retry identity is not unique'; END IF;
      BEGIN
        INSERT INTO "RandomXAcceptedShareEvidence" (
          "id", "sourceDigest", "shareFingerprint", "algorithm", "miningAccountId",
          "assetId", "upstreamPoolId", "upstreamSessionId", "upstreamJobId",
          "upstreamClientId", "workerName", "seedHash", "targetHex", "target", "nonce",
          "submittedResult", "computedResult", "acceptedDifficulty", "jobReceivedAt",
          "jobExpiresAt", "submittedAt", "acceptedAt", "correlationId", "validationDigest",
          "upstreamDecisionDigest"
        ) SELECT
          'alpha8-randomx-bad-correlation', repeat('7', 64), repeat('8', 64), "algorithm",
          'alpha8-nonrandomx-account', "assetId", "upstreamPoolId", "upstreamSessionId",
          "upstreamJobId", "upstreamClientId", "workerName", "seedHash", "targetHex", "target",
          "nonce", "submittedResult", "computedResult", "acceptedDifficulty", "jobReceivedAt",
          "jobExpiresAt", "submittedAt", "acceptedAt", "correlationId", "validationDigest",
          "upstreamDecisionDigest"
        FROM "RandomXAcceptedShareEvidence" WHERE "id" = 'alpha8-randomx-evidence';
        RAISE EXCEPTION 'RandomX evidence correlation mismatch unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'RandomX evidence account, asset, and pool do not correlate'
        THEN RAISE; END IF;
      END;
      BEGIN
        INSERT INTO "RandomXAcceptedShareEvidence" (
          "id", "sourceDigest", "shareFingerprint", "algorithm", "miningAccountId",
          "assetId", "upstreamPoolId", "upstreamSessionId", "upstreamJobId",
          "upstreamClientId", "workerName", "seedHash", "targetHex", "target", "nonce",
          "submittedResult", "computedResult", "acceptedDifficulty", "jobReceivedAt",
          "jobExpiresAt", "submittedAt", "acceptedAt", "correlationId", "validationDigest",
          "upstreamDecisionDigest"
        ) SELECT
          'alpha8-randomx-bad-algorithm', repeat('9', 64), repeat('a', 64), "algorithm",
          'alpha8-nonrandomx-account', 'alpha8-nonrandomx-asset', 'alpha8-nonrandomx-pool',
          "upstreamSessionId", "upstreamJobId", "upstreamClientId", "workerName", "seedHash",
          "targetHex", "target", "nonce", "submittedResult", "computedResult",
          "acceptedDifficulty", "jobReceivedAt", "jobExpiresAt", "submittedAt", "acceptedAt",
          "correlationId", "validationDigest", "upstreamDecisionDigest"
        FROM "RandomXAcceptedShareEvidence" WHERE "id" = 'alpha8-randomx-evidence';
        RAISE EXCEPTION 'Non-RandomX evidence asset unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'RandomX evidence asset must use the RANDOMX or RX/0 algorithm'
        THEN RAISE; END IF;
      END;
      BEGIN
        UPDATE "RandomXAcceptedShareEvidence" SET "acceptedDifficulty" = 1001
        WHERE "id" = 'alpha8-randomx-evidence';
        RAISE EXCEPTION 'RandomX evidence update unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'RandomX accepted-share evidence is immutable'
        THEN RAISE; END IF;
      END;
      BEGIN
        DELETE FROM "RandomXAcceptedShareEvidence" WHERE "id" = 'alpha8-randomx-evidence';
        RAISE EXCEPTION 'RandomX evidence delete unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'RandomX accepted-share evidence is immutable'
        THEN RAISE; END IF;
      END;
    END $$;
  `);

  process.env.AUTH_JWT_SECRET ??= 'alpha8-migration-test-jwt-secret-at-least-32-bytes';
  process.env.AUTH_ENCRYPTION_KEY ??= Buffer.alloc(32, 17).toString('base64url');
  run('pnpm', [
    '--filter',
    '@mining/api',
    'exec',
    'node',
    '--import',
    'tsx',
    '--test',
    '--test-concurrency=1',
    'src/payout-execution.integration.test.ts',
  ]);
  run('pnpm', ['--filter', '@mining/mining-worker', 'test']);
  process.stdout.write(
    `\nSchema-18 payout, native-recovery, and RandomX-evidence ${mode} verification passed.\n`,
  );
} finally {
  if (
    temporaryPrismaRoot &&
    resolve(dirname(temporaryPrismaRoot)) === verifierTempRoot &&
    basename(temporaryPrismaRoot).startsWith('miningplatform-alpha8-migrations-')
  ) {
    rmSync(temporaryPrismaRoot, { recursive: true, force: true });
  }
}
