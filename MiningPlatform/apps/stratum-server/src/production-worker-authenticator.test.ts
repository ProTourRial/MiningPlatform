/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { hashWorkerCredentialSecret } from '@mining/security';
import { InMemoryWorkerAuthRateLimiter } from './auth-rate-limiter.js';
import type { StratumServerConfig } from './config.js';
import {
  ProductionWorkerAuthenticator,
  type WorkerCredentialCandidate,
  type WorkerCredentialStore,
} from './production-worker-authenticator.js';
import type { WorkerAuthenticationContext, WorkerAuthenticationFailureCode } from './worker-authenticator.js';

const context: WorkerAuthenticationContext = {
  sessionId: 'session-test-1',
  remoteIpHash: 'remote-hash-test',
  userAgent: 'TestMiner/1.0',
  userAgentHash: 'user-agent-hash-test',
};

function config(): StratumServerConfig {
  return {
    host: '127.0.0.1',
    port: 3333,
    developmentMode: false,
    developmentWorker: 'demo.worker1',
    developmentPassword: 'x',
    developmentDifficulty: '1',
    workerAuthDriver: 'postgres',
    workerAuthMaximumFailures: 2,
    workerAuthWindowMs: 60_000,
    workerAuthLockMs: 900_000,
    socketTimeoutMs: 120_000,
    maximumLineBytes: 16_384,
    maximumSubmissionsPerSecond: 20,
    developmentDataDirectory: './data/test',
    eventBusDriver: 'redis',
    eventStoreDriver: 'postgres',
    redisUrl: 'redis://127.0.0.1:6379',
    eventStream: 'test-events',
    versionRollingMask: '1fffe000',
    ipHashKey: 'test-hmac-key-with-enough-characters',
    upstreamDriver: 'tcp',
    upstreamHost: '127.0.0.1',
    upstreamPort: 3334,
    upstreamTls: false,
    upstreamUsername: 'upstream.account',
    upstreamPassword: 'x',
    upstreamUserAgent: 'MiningPlatform-test/0.3.0',
    upstreamConnectTimeoutMs: 5_000,
    upstreamResponseTimeoutMs: 10_000,
    upstreamMaximumAttempts: 5,
  };
}

class FakeStore implements WorkerCredentialStore {
  readonly successes: WorkerCredentialCandidate[] = [];
  readonly failures: WorkerAuthenticationFailureCode[] = [];

  constructor(readonly candidates: WorkerCredentialCandidate[]) {}

  async findCandidates(): Promise<readonly WorkerCredentialCandidate[]> {
    return this.candidates;
  }

  async recordSuccess(candidate: WorkerCredentialCandidate): Promise<void> {
    this.successes.push(candidate);
  }

  async recordFailure(input: { reason: WorkerAuthenticationFailureCode }): Promise<void> {
    this.failures.push(input.reason);
  }
}

async function candidate(overrides: Partial<WorkerCredentialCandidate> = {}): Promise<WorkerCredentialCandidate> {
  return {
    workerId: 'worker-1',
    workerName: 'account.worker1',
    userId: 'user-1',
    miningAccountId: 'account-1',
    workerStatus: 'OFFLINE',
    userStatus: 'ACTIVE',
    accountEnabled: true,
    credentialId: 'wc_test',
    credentialStatus: 'ACTIVE',
    secretHash: await hashWorkerCredentialSecret('mpw_valid-test-secret-123456789012345'),
    failedAttempts: 0,
    ...overrides,
  };
}

test('production authenticator accepts an active worker credential and clears limiter state', async () => {
  const store = new FakeStore([await candidate()]);
  const limiter = new InMemoryWorkerAuthRateLimiter(2, 60_000, 900_000);
  const authenticator = new ProductionWorkerAuthenticator(config(), store, limiter);
  const result = await authenticator.authenticate('account.worker1', 'mpw_valid-test-secret-123456789012345', context);
  assert.equal(result.authenticated, true);
  assert.equal(store.successes.length, 1);
  assert.deepEqual(store.failures, []);
});

test('production authenticator records invalid credentials without revealing worker existence', async () => {
  const store = new FakeStore([await candidate()]);
  const limiter = new InMemoryWorkerAuthRateLimiter(5, 60_000, 900_000);
  const authenticator = new ProductionWorkerAuthenticator(config(), store, limiter);
  const result = await authenticator.authenticate('account.worker1', 'wrong-secret-with-enough-characters', context);
  assert.deepEqual(result, { authenticated: false, code: 'INVALID_CREDENTIALS' });
  assert.deepEqual(store.failures, ['INVALID_CREDENTIALS']);
});

test('production authenticator rejects suspended or disabled identities even with a valid secret', async () => {
  const store = new FakeStore([await candidate({ userStatus: 'SUSPENDED' })]);
  const limiter = new InMemoryWorkerAuthRateLimiter(5, 60_000, 900_000);
  const authenticator = new ProductionWorkerAuthenticator(config(), store, limiter);
  const result = await authenticator.authenticate('account.worker1', 'mpw_valid-test-secret-123456789012345', context);
  assert.deepEqual(result, { authenticated: false, code: 'ACCOUNT_DISABLED' });
});

test('production authenticator rate-limits repeated failures', async () => {
  const store = new FakeStore([await candidate()]);
  const limiter = new InMemoryWorkerAuthRateLimiter(2, 60_000, 900_000);
  const authenticator = new ProductionWorkerAuthenticator(config(), store, limiter);
  await authenticator.authenticate('account.worker1', 'wrong-secret-one-with-enough-characters', context);
  await authenticator.authenticate('account.worker1', 'wrong-secret-two-with-enough-characters', context);
  const blocked = await authenticator.authenticate('account.worker1', 'mpw_valid-test-secret-123456789012345', context);
  assert.deepEqual(blocked, { authenticated: false, code: 'RATE_LIMITED' });
});


test('production authenticator distinguishes revoked credentials in the internal audit result', async () => {
  const store = new FakeStore([await candidate({ credentialStatus: 'REVOKED' })]);
  const limiter = new InMemoryWorkerAuthRateLimiter(5, 60_000, 900_000);
  const authenticator = new ProductionWorkerAuthenticator(config(), store, limiter);
  const result = await authenticator.authenticate('account.worker1', 'mpw_valid-test-secret-123456789012345', context);
  assert.deepEqual(result, { authenticated: false, code: 'CREDENTIAL_REVOKED' });
  assert.deepEqual(store.failures, ['CREDENTIAL_REVOKED']);
});
