/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expectedVersion = '0.3.0-alpha.7';
const expectedMigration = '20260822010000_payout_control_foundation';

async function text(path) {
  return readFile(resolve(root, path), 'utf8');
}

async function parentWorkflow(name) {
  try {
    return await readFile(resolve(root, '..', '.github', 'workflows', name), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function requireText(contents, expected, label) {
  if (!contents.includes(expected)) throw new Error(`${label} is missing: ${expected}`);
}

const requiredFiles = [
  'PROJECT_VISION.md',
  'docs/product/PRODUCT_CONSTITUTION.md',
  'docs/product/PRODUCTION_GAP_REGISTER.md',
  'docs/adr/0013-payout-address-and-route-control.md',
  'docs/operations/payout-runbook.md',
  'docs/releases/v0.3.0-alpha.7.md',
  'docs/releases/v0.3.0-alpha.7-validation.md',
  `packages/database/prisma/migrations/${expectedMigration}/migration.sql`,
  'packages/blockchain-adapters/src/bitcoin-address.ts',
  'packages/blockchain-adapters/src/bitcoin-address.test.ts',
  'packages/randomx/src/accounting-projection.ts',
  'packages/randomx/src/accounting-projection.test.ts',
  'packages/randomx/src/accepted-share-event.ts',
  'packages/randomx/src/accepted-share-event.test.ts',
  'apps/mining-worker/src/randomx-accounting-evidence.ts',
  'apps/mining-worker/src/randomx-accounting-evidence.integration.test.ts',
  'apps/mining-worker/src/randomx-accounting-event.ts',
  'apps/mining-worker/src/runtime.ts',
  'apps/mining-worker/src/supported-events.ts',
  'packages/shared/src/events.ts',
  'packages/randomx/src/validator.ts',
  'packages/database/prisma/migrations/20260825010000_randomx_accounting_evidence/migration.sql',
  'apps/api/src/modules/auth/step-up.service.ts',
  'apps/api/src/modules/payouts/payouts.service.ts',
  'apps/api/src/payout-control.integration.test.ts',
  'apps/api/src/payout-execution.integration.test.ts',
  'apps/web/src/components/dashboard/payout-address-panel.tsx',
  'apps/web/src/services/api-client.test.ts',
  'scripts/verify-v030-alpha7-migration.mjs',
  'scripts/verify-v030-alpha8-migration.mjs',
  'apps/mining-worker/src/native-bitcoin-evidence.ts',
  'apps/mining-worker/src/native-bitcoin-submission-coordinator.ts',
  'apps/mining-worker/src/native-bitcoin-submission-recovery.ts',
  'docker-compose.regtest.yml',
  'infrastructure/docker/bitcoin-core-regtest.Dockerfile',
  'scripts/native-bitcoin-regtest-integration.ts',
  '.github/workflows/native-bitcoin-regtest.yml',
  'packages/database/prisma/migrations/20260824010000_native_bitcoin_submission_evidence/migration.sql',
  'packages/database/prisma/migrations/20260824020000_native_bitcoin_submission_intent/migration.sql',
  'packages/database/prisma/migrations/20260824030000_native_bitcoin_submission_recovery_observation/migration.sql',
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
if (packageFiles.length !== 32)
  throw new Error(`Expected 32 workspace package files, found ${packageFiles.length}`);
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
  'enum StepUpScope',
  'enum AddressValidator',
  'enum PayoutRouteStatus',
  'enum PayoutAddressStatus',
  'model StepUpAuthorization',
  'lastTotpCounter',
  'model AssetNetwork',
  'model PayoutRoute',
  'addressHash',
  'cooldownUntil',
  'payoutRouteId',
  'model NativeBitcoinSubmissionIntent',
  'model RandomXAcceptedShareEvidence',
  'model NativeBitcoinSubmissionRecoveryObservation',
  'submissionIntentId',
])
  requireText(schema, expected, 'Prisma schema');

const migration = await text(
  `packages/database/prisma/migrations/${expectedMigration}/migration.sql`,
);
for (const expected of [
  "'bitcoin-mainnet'",
  "'ADDRESS_REGISTRATION'",
  'StepUpAuthorization_immutable_trigger',
  'PayoutRoute_immutable_trigger',
  'PayoutAddress_lifecycle_trigger',
  'PayoutAddress_one_active_per_route_key',
  'Payout_route_alignment_trigger',
  'UPDATE OF "userId", "assetId", "payoutAddressId", "payoutRouteId", "status"',
  'route is not enabled for controlled funds',
  'Pilot payout must enter manual review',
  'Pilot payout cannot leave manual review without an approval control',
])
  requireText(migration, expected, 'Payout-control migration');

const nativeIntentMigration = await text(
  'packages/database/prisma/migrations/20260824020000_native_bitcoin_submission_intent/migration.sql',
);
for (const expected of [
  'NativeBitcoinSubmissionIntent_immutable_trigger',
  'NativeBitcoinSubmissionIntent_correlation_trigger',
  'NativeBitcoinSubmissionAttempt_submissionIntentId_key',
  'submissionIntentId',
  'migration:v16:',
  'requires matching intent and fresh valid proposal evidence',
])
  requireText(nativeIntentMigration, expected, 'Native Bitcoin submission-intent migration');

const nativeCoordinator = await text(
  'apps/mining-worker/src/native-bitcoin-submission-coordinator.ts',
);
for (const expected of [
  'recordSubmissionIntent',
  'findSubmissionByIdempotencyKey',
  'NativeBitcoinSubmissionUncertainError',
  'A prior execution stopped after durable intent and before durable outcome',
])
  requireText(nativeCoordinator, expected, 'Native Bitcoin submission coordinator');

const nativeRecoveryMigration = await text(
  'packages/database/prisma/migrations/20260824030000_native_bitcoin_submission_recovery_observation/migration.sql',
);
for (const expected of [
  'NativeBitcoinRecoveryObservationStatus',
  'NativeBitcoinSubmissionRecoveryObservation_immutable_trigger',
  'NativeBitcoinSubmissionRecoveryObservation_correlation_trigger',
  'confirmations" = "chainHeight" - "blockHeight" + 1',
  'does not match its submission intent',
])
  requireText(nativeRecoveryMigration, expected, 'Native Bitcoin recovery-observation migration');

const nativeRecovery = await text('apps/mining-worker/src/native-bitcoin-submission-recovery.ts');
for (const expected of [
  'observeSubmittedBlock',
  'SUBMISSION_OUTCOME_RECORDED',
  'STILL_UNRESOLVED',
  'terminalObservation',
])
  requireText(nativeRecovery, expected, 'Native Bitcoin submission recovery coordinator');

const nativeMiningRpc = await text('packages/blockchain-adapters/src/bitcoin-mining-rpc.ts');
for (const expected of [
  'observeSubmittedBlock',
  "'getblockheader'",
  "'getblockstats'",
  "status: 'NOT_FOUND'",
])
  requireText(nativeMiningRpc, expected, 'Native Bitcoin mining RPC adapter');

const regtestDockerfile = await text('infrastructure/docker/bitcoin-core-regtest.Dockerfile');
for (const expected of [
  'BITCOIN_CORE_VERSION=31.0',
  'd3e4c58a35b1d0a97a457462c94f55501ad167c660c245cb1ffa565641c65074',
  '4de1d568dedd48604f75132421bc0abeca432639589b49a3909c81db3a813112',
  'sha256sum --check --strict',
  'USER bitcoin',
])
  requireText(regtestDockerfile, expected, 'Bitcoin Core regtest Dockerfile');

const regtestCompose = await text('docker-compose.regtest.yml');
for (const expected of [
  "profiles: ['native-regtest']",
  "'127.0.0.1:${BITCOIN_REGTEST_RPC_PORT:-18443}:18443'",
  'bitcoin-core-fork-regtest:',
  "'127.0.0.1:${BITCOIN_FORK_REGTEST_RPC_PORT:-18444}:18443'",
  '- -listen=0',
  'no-new-privileges:true',
])
  requireText(regtestCompose, expected, 'Bitcoin Core regtest Compose profile');

const regtestIntegration = await text('scripts/native-bitcoin-regtest-integration.ts');
for (const expected of [
  'disposable-bitcoin-core-31-regtest-only',
  "expectedChain: 'regtest'",
  'buildNativeBitcoinJob',
  "walletRpc.call<string>('sendtoaddress'",
  "nodeRpc.call<string[]>('getrawmempool')",
  'templateTransactionId',
  'adapter.getBlockTemplate(longPollBaseline.longPollId)',
  'longPollReplacement.previousBlockHash',
  "assert.equal(staleObservation.status, 'STALE_CHAIN')",
  "forkNodeRpc.call<string>('getblock'",
  'validateBlockProposal',
  'submitBlock',
  'observeSubmittedBlock',
  "nodeRpc.call<VerboseBlock>('getblock'",
])
  requireText(regtestIntegration, expected, 'Native Bitcoin live-regtest integration');

const randomXAccountingProjection = await text('packages/randomx/src/accounting-projection.ts');
for (const expected of [
  'projectRandomXAcceptedContribution',
  "input.validation.reason !== 'ACCEPTED'",
  'RandomX accounting requires upstream acceptance',
  'computedResult !== submittedResult',
  'randomXShareFingerprint(input.job, input.submission)',
  'input.validation.target !== target',
  'randomx-accepted-contribution-v1',
  'Object.freeze',
])
  requireText(randomXAccountingProjection, expected, 'RandomX accounting projection');

const randomXEvidenceMigration = await text(
  'packages/database/prisma/migrations/20260825010000_randomx_accounting_evidence/migration.sql',
);
for (const expected of [
  'RandomXAcceptedShareEvidence_sourceDigest_key',
  'RandomXAcceptedShareEvidence_shareFingerprint_key',
  'RandomXAcceptedShareEvidence_immutable_trigger',
  'RandomXAcceptedShareEvidence_correlation_trigger',
  'RandomX accepted-share evidence is immutable',
  'RandomX evidence account, asset, and pool do not correlate',
  'RandomX evidence asset must use the RANDOMX or RX/0 algorithm',
])
  requireText(randomXEvidenceMigration, expected, 'RandomX accounting-evidence migration');

const randomXEvidenceRepository = await text(
  'apps/mining-worker/src/randomx-accounting-evidence.ts',
);
for (const expected of [
  'projectRandomXAcceptedContribution(input)',
  'randomXAcceptedShareEvidence.create',
  'RandomX accounting evidence idempotency conflict',
  'RandomX share fingerprint is already bound to different evidence',
])
  requireText(randomXEvidenceRepository, expected, 'RandomX accounting-evidence repository');

const randomXEventContract = await text('packages/shared/src/events.ts');
for (const expected of [
  "randomXShareAccepted: 'mining.randomx.share.accepted.v1'",
  "acceptedShare: 'randomx-mining-gateway'",
  'export interface RandomXAcceptedSharePayload',
  'localAccepted: true',
  'upstreamAccepted: true',
])
  requireText(randomXEventContract, expected, 'RandomX accepted-share event contract');

const randomXEventConsumer = await text('apps/mining-worker/src/randomx-accounting-event.ts');
for (const expected of [
  'event.producer !== RandomXEventProducers.acceptedShare',
  'expectedIdempotencyKey = `randomx-share:${payload.localFingerprint}`',
  'pg_advisory_xact_lock',
  'PrismaTransactionalIdempotencyService',
  'this.repository.recordAcceptedShare(parsed.input, transaction)',
  'payload shape is invalid',
])
  requireText(randomXEventConsumer, expected, 'RandomX accounting-event consumer');

const randomXAcceptedShareEvent = await text('packages/randomx/src/accepted-share-event.ts');
for (const expected of [
  'createRandomXAcceptedShareEvent',
  'projectRandomXAcceptedContribution(input.accounting)',
  'requires a uint64 job height',
  'applyRandomXNonce',
  'RandomXEventProducers.acceptedShare',
  'Object.freeze',
])
  requireText(randomXAcceptedShareEvent, expected, 'RandomX accepted-share event factory');

const randomXWorkerRuntime = await text('apps/mining-worker/src/runtime.ts');
requireText(
  randomXWorkerRuntime,
  'event.eventName === MiningEvents.randomXShareAccepted',
  'RandomX accounting runtime branch',
);

const randomXValidator = await text('packages/randomx/src/validator.ts');
for (const expected of [
  'randomx-share-fingerprint-v2',
  'job.blob',
  'job.target',
  "job.height?.toString() ?? ''",
])
  requireText(randomXValidator, expected, 'RandomX share fingerprint');

const stepUp = await text('apps/api/src/modules/auth/step-up.service.ts');
for (const expected of [
  "principal.authenticationType !== 'access-token'",
  'verifyTotpCodeWithCounter',
  'lastTotpCounter',
  'SELECT CURRENT_TIMESTAMP AS "now"',
  'hashOpaqueToken(token)',
  'consumedAt: null',
  'expiresAt: { gt: now }',
  'TOTP code was already used for authentication',
])
  requireText(stepUp, expected, 'Step-up service');

const authService = await text('apps/api/src/modules/auth/auth.service.ts');
for (const expected of [
  'disable it before re-enrollment',
  'verifyTotpCodeWithCounter',
  'array_remove("recoveryCodesHash"',
  'lastTotpCounter',
  'TOTP management requires an interactive user session',
])
  requireText(authService, expected, 'Authentication service');

const validator = await text('packages/blockchain-adapters/src/bitcoin-address.ts');
for (const expected of [
  'doubleSha256',
  'bech32',
  'bech32m',
  'wrong-witness-checksum-encoding',
  "network === 'mainnet' ? 'bc' : network === 'testnet' ? 'tb' : 'bcrt'",
])
  requireText(validator, expected, 'Bitcoin address validator');

const payoutService = await text('apps/api/src/modules/payouts/payouts.service.ts');
for (const expected of [
  'PAYOUT_ADDRESS_WRITE',
  'validateBitcoinAddress',
  'addressDisplay',
  'addressFingerprint',
  'serializableTransaction',
  'PAYOUT_ROUTE_NOT_ACTIVE',
  'PAYOUT_REQUEST_ENVIRONMENT_GATE_DISABLED',
  'PAYOUT_SIGNING_ENVIRONMENT_GATE_DISABLED',
  'PAYOUT_BROADCAST_ENVIRONMENT_GATE_DISABLED',
  'PAYOUT_CONTROL_NOT_CONFIGURED',
  'AUTO_WITHDRAWAL_REQUIRES_ACTIVE_ROUTE',
])
  requireText(payoutService, expected, 'Payout service');
requireText(
  payoutService,
  'Payout preferences require an interactive user session',
  'Payout preference authorization',
);

const payoutController = await text('apps/api/src/modules/payouts/payouts.controller.ts');
requireText(payoutController, "@Scopes('profile:read')", 'Payout API-key scope');

const apiClient = await text('apps/web/src/services/api-client.ts');
for (const expected of [
  'let refreshRequest:',
  'function refreshSession()',
  'await refreshSession()',
])
  requireText(apiClient, expected, 'Browser refresh single-flight');

const integration = await text('apps/api/src/payout-control.integration.test.ts');
for (const expected of [
  'consumed step-up token',
  'identity and verification evidence are immutable',
  'route is not enabled for controlled funds',
  'already used for authentication',
  'skewedEpoch',
  'assert.equal(await prisma.payout.count',
])
  requireText(integration, expected, 'Payout-control integration');

const payoutExecutionIntegration = await text('apps/api/src/payout-execution.integration.test.ts');
for (const expected of [
  'prisma.payoutControl.upsert',
  "where: { code: 'BTC-REWARD-CLEARING' }",
  "type: 'CLEARING'",
  'Integration fixture is fail-closed',
])
  requireText(payoutExecutionIntegration, expected, 'Payout-execution integration');

const authIntegration = await text('apps/api/src/auth.integration.test.ts');
for (const expected of [
  'already enabled; disable it before re-enrollment',
  'lastTotpCounter: null',
  'already used for authentication',
  'interactive user session',
])
  requireText(authIntegration, expected, 'Authentication integration');

const compose = await text('docker-compose.yml');
requireText(compose, 'SCHEMA_VERSION: ${SCHEMA_VERSION:-13}', 'Docker Compose');
requireText(
  compose,
  `SCHEMA_MIGRATION: \${SCHEMA_MIGRATION:-${expectedMigration}}`,
  'Docker Compose',
);

const changelog = await text('CHANGELOG.md');
requireText(changelog, '## [0.3.0-alpha.7] - 2026-08-22', 'CHANGELOG');
requireText(changelog, 'OpenAI Codex assisted', 'CHANGELOG Codex disclosure');
requireText(changelog, 'remain with Abia Nugrahanto', 'CHANGELOG ownership disclosure');

const projectManifest = JSON.parse(await text('project-manifest.json'));
if (
  projectManifest.version !== expectedVersion ||
  projectManifest.schema_version !== 13 ||
  projectManifest.database_summary.latest_migration !== expectedMigration ||
  projectManifest.database_summary.models !== 51 ||
  projectManifest.database_summary.enums !== 38
) {
  throw new Error('project-manifest.json release metadata is stale');
}
if (
  projectManifest.baseline.platform_fee_percent !== 0.5 ||
  projectManifest.baseline.auto_withdrawal_default !== false
) {
  throw new Error('project-manifest.json financial baseline is stale');
}

const releaseManifest = JSON.parse(await text('release-manifest.json'));
if (
  releaseManifest.version !== expectedVersion ||
  releaseManifest.schemaVersion !== 13 ||
  releaseManifest.migration !== expectedMigration ||
  !releaseManifest.compatibleFrom?.includes('0.3.0-alpha.6')
) {
  throw new Error('release-manifest.json release metadata or alpha.6 compatibility is stale');
}

const vision = await text('PROJECT_VISION.md');
for (const expected of [
  'default fee awal adalah **0,5% dari gross mining reward**',
  'Auto-withdraw berstatus **OFF secara default**',
  'Validasi checksum dan network membuktikan format tujuan, bukan kepemilikan private key',
])
  requireText(vision, expected, 'PROJECT_VISION');

const activeWorkflow = await parentWorkflow('ci.yml');
const workflow = activeWorkflow ?? (await text('.github/workflows/ci.yml'));
for (const expected of [
  ...(activeWorkflow ? ['working-directory: MiningPlatform'] : []),
  'pnpm install --frozen-lockfile',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm test:integration:payout-control',
  'pnpm verify:migration:v030-alpha8:fresh',
  'pnpm verify:migration:v030-alpha8:upgrade',
  'pnpm build',
])
  requireText(workflow, expected, 'GitHub CI');

if (activeWorkflow) {
  const releaseWorkflow = await parentWorkflow('release-artifact.yml');
  if (!releaseWorkflow) throw new Error('Active release-artifact workflow is missing');
  requireText(releaseWorkflow, 'pnpm verify:v030-alpha7:static', 'GitHub release workflow');
  const dockerWorkflow = await parentWorkflow('docker-e2e.yml');
  if (!dockerWorkflow) throw new Error('Active Docker E2E workflow is missing');
  requireText(dockerWorkflow, 'docker compose', 'GitHub Docker E2E workflow');
} else {
  requireText(workflow, 'docker compose', 'Packaged GitHub CI');
}

const packagedRegtestWorkflow = await text('.github/workflows/native-bitcoin-regtest.yml');
const activeRegtestWorkflow = await parentWorkflow('native-bitcoin-regtest.yml');
const regtestWorkflow = activeRegtestWorkflow ?? packagedRegtestWorkflow;
if (activeRegtestWorkflow) {
  requireText(
    activeRegtestWorkflow,
    'working-directory: MiningPlatform',
    'Active native Bitcoin regtest workflow',
  );
}
for (const expected of [
  'pnpm --filter @mining/bitcoin-template... build',
  'up -d --build --wait bitcoin-core-regtest bitcoin-core-fork-regtest',
  'pnpm test:integration:native-bitcoin-regtest',
  'restart bitcoin-core-regtest',
  'before_tip=',
  'after_tip=',
  'down -v --rmi local --remove-orphans',
]) {
  requireText(regtestWorkflow, expected, 'Active native Bitcoin regtest workflow');
  requireText(packagedRegtestWorkflow, expected, 'Packaged native Bitcoin regtest workflow');
}

process.stdout.write('v0.3.0-alpha.7 static payout-control checks passed.\n');
