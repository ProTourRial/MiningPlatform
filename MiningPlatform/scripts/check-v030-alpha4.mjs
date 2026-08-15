/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.3.0-alpha.4';
const migrationName = '20260813010000_versioned_fee_policy';
const requiredFiles = [
  'PROJECT_VISION.md',
  'CHANGELOG.md',
  'docs/adr/0010-distributed-upstream-health-and-multiplexing.md',
  'docs/operations/distributed-upstream-health.md',
  'docs/product/PRODUCTION_GAP_REGISTER.md',
  'docs/releases/v0.3.0-alpha.4.md',
  'docs/releases/v0.3.0-alpha.4-validation.md',
  'packages/upstream-stratum/src/health-coordinator.ts',
  'packages/upstream-stratum/src/health-coordinator.test.ts',
  'packages/upstream-stratum/src/upstream-resilience.test.ts',
  'apps/stratum-server/src/redis-upstream-health-coordinator.ts',
  'apps/stratum-server/src/redis-upstream-health-coordinator.test.ts',
  'apps/stratum-server/src/config.test.ts',
  'turbo.json',
  'release-manifest.json',
];

async function exists(relativePath) {
  try {
    await stat(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function requireFragments(relativePath, fragments, failures) {
  const contents = await readFile(join(root, relativePath), 'utf8');
  for (const fragment of fragments) {
    if (!contents.includes(fragment)) failures.push(`${relativePath} is missing: ${fragment}`);
  }
}

const failures = [];
for (const relativePath of requiredFiles) {
  if (!(await exists(relativePath))) failures.push(`Required file is missing: ${relativePath}`);
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion)
  failures.push(`Root package version must be ${expectedVersion}`);
if (packageJson.scripts?.['verify:v030-alpha4:static'] !== 'node scripts/check-v030-alpha4.mjs') {
  failures.push('Alpha.4 static verification script is not wired in package.json');
}

const workspacePackagePaths = [
  'apps/api',
  'apps/mining-worker',
  'apps/monitoring-agent',
  'apps/outbox-worker',
  'apps/scheduler',
  'apps/stratum-server',
  'apps/upstream-simulator',
  'apps/wallet-worker',
  'apps/web',
  'packages/blockchain-adapters',
  'packages/build-info',
  'packages/config',
  'packages/database',
  'packages/event-bus',
  'packages/idempotency',
  'packages/ledger',
  'packages/logger',
  'packages/miner-detection',
  'packages/mining-core',
  'packages/reward-engine',
  'packages/security',
  'packages/shared',
  'packages/state-machine',
  'packages/stratum-protocol',
  'packages/upstream-stratum',
  'packages/validation',
];
for (const packagePath of workspacePackagePaths) {
  const workspacePackage = JSON.parse(
    await readFile(join(root, packagePath, 'package.json'), 'utf8'),
  );
  if (workspacePackage.version !== expectedVersion) {
    failures.push(`${packagePath}/package.json version must be ${expectedVersion}`);
  }
}

const projectManifest = JSON.parse(await readFile(join(root, 'project-manifest.json'), 'utf8'));
if (projectManifest.primary_product_reference !== 'PROJECT_VISION.md') {
  failures.push('PROJECT_VISION.md must remain the primary product reference');
}
if (projectManifest.baseline?.platform_fee_percent !== 0.5) {
  failures.push('Project baseline platform fee must remain 0.5 percent');
}
if (projectManifest.architecture_baseline !== 'ADR-0001 through ADR-0010') {
  failures.push('Project architecture baseline must include ADR-0010');
}
if (projectManifest.release_blockers?.includes('distributed-upstream-health-state')) {
  failures.push('Completed distributed health work must not remain a release blocker');
}
if (projectManifest.release_blockers?.includes('full-pnpm-prisma-next-nest-build-validation')) {
  failures.push('Completed full local build validation must not remain a release blocker');
}
if (!projectManifest.release_blockers?.includes('shared-upstream-multiplexing')) {
  failures.push('Provider-safe shared multiplexing implementation must remain a release blocker');
}

const releaseManifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (releaseManifest.version !== expectedVersion) failures.push('Release-manifest version mismatch');
if (releaseManifest.schemaVersion !== 9)
  failures.push('Release-manifest schemaVersion must remain 9');
if (releaseManifest.migration !== migrationName)
  failures.push('Release-manifest migration must remain the versioned-fee migration');

await requireFragments(
  'CHANGELOG.md',
  [
    '## [0.3.0-alpha.4] - 2026-08-15',
    'OpenAI Codex assisted with architecture review',
    'Product ownership, requirements, final decisions, approvals, and release responsibility remain with Abia Nugrahanto.',
  ],
  failures,
);
await requireFragments(
  'docs/adr/0010-distributed-upstream-health-and-multiplexing.md',
  [
    'Redis server time is authoritative',
    'At most one replica receives a half-open probe lease',
    'Coordinator failure is fail-open',
    'Connections must not be shared merely to reduce socket count',
    'non-overlapping extranonce partition',
  ],
  failures,
);
await requireFragments(
  'packages/upstream-stratum/src/health-coordinator.ts',
  ['DistributedPoolHealthCoordinator', 'InMemoryDistributedPoolHealthCoordinator', 'probeToken'],
  failures,
);
await requireFragments(
  'apps/stratum-server/src/redis-upstream-health-coordinator.ts',
  [
    "redis.call('TIME')",
    "redis.call('HINCRBY'",
    'RedisDistributedPoolHealthCoordinator',
    'error.message.slice(0, 1_024)',
  ],
  failures,
);
await requireFragments(
  'apps/stratum-server/src/config.ts',
  [
    "upstreamHealthDriver?: 'memory' | 'redis'",
    'Production Stratum requires UPSTREAM_HEALTH_DRIVER=redis',
    'UPSTREAM_HEALTH_PROBE_LEASE_MS',
  ],
  failures,
);
await requireFragments(
  'apps/stratum-server/src/server.ts',
  [
    'Production Stratum requires distributed Redis upstream health coordination',
    'closeResources(closers, false)',
    'upstreamHealthCoordinator',
  ],
  failures,
);
await requireFragments('turbo.json', ['"REDIS_INTEGRATION_URL"'], failures);
await requireFragments(
  '../.github/workflows/docker-e2e.yml',
  ['http://127.0.0.1/version', 'http://127.0.0.1/api/v1/wallets/status'],
  failures,
);
for (const envFile of ['.env.example', '.env.ci.example']) {
  await requireFragments(
    envFile,
    [
      'PLATFORM_FEE_PERCENT=0.5',
      'UPSTREAM_HEALTH_DRIVER=redis',
      'UPSTREAM_HEALTH_KEY_PREFIX=mining:upstream-health:v1:',
      'MINING_BUILD_VERSION=0.3.0-alpha.4',
    ],
    failures,
  );
}
for (const dockerfile of [
  'infrastructure/docker/api.Dockerfile',
  'infrastructure/docker/mining-worker.Dockerfile',
  'infrastructure/docker/outbox-worker.Dockerfile',
  'infrastructure/docker/scheduler.Dockerfile',
  'infrastructure/docker/stratum.Dockerfile',
]) {
  await requireFragments(
    dockerfile,
    ['COPY scripts/add-author-headers.mjs ./scripts/add-author-headers.mjs', 'pnpm db:generate'],
    failures,
  );
}

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('v0.3.0-alpha.4 static release checks passed.\n');
}
