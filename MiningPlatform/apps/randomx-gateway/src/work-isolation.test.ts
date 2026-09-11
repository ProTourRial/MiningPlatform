/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyRandomXNonce } from '@mining/randomx';
import type { RandomXMinerJobAssignment } from './miner-protocol.js';
import type { RandomXMinerPrincipal, RandomXMinerWorkProvider } from './miner-server.js';
import {
  randomXMinerWorkFingerprint,
  RedisRandomXWorkLeaseStore,
  type RandomXWorkLeaseReceipt,
  type RandomXWorkLeaseStore,
  RandomXWorkIsolationConflictError,
  UniqueRandomXMinerWorkProvider,
} from './work-isolation.js';

const now = new Date('2026-09-08T01:00:00.000Z');
const principal: RandomXMinerPrincipal = {
  workerId: 'worker-1',
  workerName: 'account.worker-1',
  miningAccountId: 'account-1',
};
const baseAssignment: RandomXMinerJobAssignment = {
  minerJobId: 'miner-job-1',
  upstreamJobId: 'upstream-job-1',
  algorithm: 'rx/0',
  blob: '00'.repeat(80),
  target: 'ffffffff',
  seedHash: '11'.repeat(32),
  height: 3_500_000n,
  expiresAt: new Date(now.getTime() + 60_000),
};

function cloneAssignment(assignment: RandomXMinerJobAssignment): RandomXMinerJobAssignment {
  return { ...assignment, expiresAt: new Date(assignment.expiresAt) };
}

class MemoryLeaseStore implements RandomXWorkLeaseStore {
  readonly leases = new Map<string, { owner: string; expiresAt: Date }>();
  readonly acquisitions: Array<{ fingerprint: string; owner: string }> = [];
  closed = false;

  async acquire(input: {
    fingerprint: string;
    owner: string;
    expiresAt: Date;
  }): Promise<RandomXWorkLeaseReceipt | undefined> {
    this.acquisitions.push({ fingerprint: input.fingerprint, owner: input.owner });
    const existing = this.leases.get(input.fingerprint);
    if (existing && existing.owner !== input.owner) return undefined;
    this.leases.set(input.fingerprint, {
      owner: input.owner,
      expiresAt: new Date(input.expiresAt),
    });
    return {
      status: existing ? 'RENEWED' : 'ACQUIRED',
      fingerprint: input.fingerprint,
      acquiredAt: new Date(now),
      expiresAt: new Date(input.expiresAt),
    };
  }

  async owns(fingerprint: string, owner: string): Promise<boolean> {
    const lease = this.leases.get(fingerprint);
    return lease?.owner === owner && lease.expiresAt > now;
  }

  async release(fingerprint: string, owner: string): Promise<void> {
    if (this.leases.get(fingerprint)?.owner === owner) this.leases.delete(fingerprint);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  steal(fingerprint: string, owner: string): void {
    this.leases.set(fingerprint, {
      owner,
      expiresAt: new Date(now.getTime() + 60_000),
    });
  }
}

class MemoryWorkSource implements RandomXMinerWorkProvider {
  readonly active = new Map<string, RandomXMinerJobAssignment>();
  readonly releases: string[] = [];
  closed = false;

  constructor(
    private readonly assignmentFor: (connectionId: string) => RandomXMinerJobAssignment | undefined,
  ) {}

  async assign(input: {
    connectionId: string;
    worker: RandomXMinerPrincipal;
  }): Promise<RandomXMinerJobAssignment | undefined> {
    const assignment = this.assignmentFor(input.connectionId);
    if (!assignment) return undefined;
    const value = cloneAssignment(assignment);
    this.active.set(input.connectionId, value);
    return cloneAssignment(value);
  }

  async resolve(
    connectionId: string,
    minerJobId: string,
  ): Promise<{ upstreamJobId: string } | undefined> {
    const assignment = this.active.get(connectionId);
    return assignment?.minerJobId === minerJobId
      ? { upstreamJobId: assignment.upstreamJobId }
      : undefined;
  }

  async release(connectionId: string): Promise<void> {
    this.active.delete(connectionId);
    this.releases.push(connectionId);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

test('work fingerprint normalizes the nonce and excludes routing metadata', () => {
  const baseline = randomXMinerWorkFingerprint(baseAssignment);
  const sameSearchSpace = randomXMinerWorkFingerprint({
    ...baseAssignment,
    minerJobId: 'another-miner-job',
    upstreamJobId: 'another-upstream-job',
    target: 'fffffffe',
    height: 3_500_001n,
    blob: applyRandomXNonce(baseAssignment.blob, '78563412'),
  });
  const distinctSearchSpace = randomXMinerWorkFingerprint({
    ...baseAssignment,
    blob: `01${baseAssignment.blob.slice(2)}`,
  });
  assert.equal(sameSearchSpace, baseline);
  assert.notEqual(distinctSearchSpace, baseline);
});

test('two gateway replicas cannot lease the same RandomX search space', async () => {
  const leaseStore = new MemoryLeaseStore();
  const firstSource = new MemoryWorkSource(() => baseAssignment);
  const secondSource = new MemoryWorkSource(() => ({
    ...baseAssignment,
    minerJobId: 'miner-job-2',
    upstreamJobId: 'upstream-job-2',
  }));
  const first = new UniqueRandomXMinerWorkProvider(firstSource, leaseStore, {
    createOwner: () => 'owner-token-0001',
  });
  const second = new UniqueRandomXMinerWorkProvider(secondSource, leaseStore, {
    createOwner: () => 'owner-token-0002',
  });

  const assigned = await first.assign({ connectionId: 'connection-1', worker: principal });
  assert.equal(assigned?.minerJobId, 'miner-job-1');
  await assert.rejects(
    second.assign({ connectionId: 'connection-2', worker: principal }),
    (error: unknown) => error instanceof RandomXWorkIsolationConflictError,
  );
  assert.equal(secondSource.active.size, 0, 'colliding source work must be released');
  assert.deepEqual(await first.resolve('connection-1', 'miner-job-1'), {
    upstreamJobId: 'upstream-job-1',
  });

  await first.release('connection-1');
  const reassigned = await second.assign({ connectionId: 'connection-2', worker: principal });
  assert.equal(reassigned?.minerJobId, 'miner-job-2');
  await second.release('connection-2');
  assert.equal(leaseStore.leases.size, 0);
});

test('a repeated assignment renews its owner while distinct blobs can run concurrently', async () => {
  const leaseStore = new MemoryLeaseStore();
  const firstSource = new MemoryWorkSource(() => baseAssignment);
  const secondSource = new MemoryWorkSource(() => ({
    ...baseAssignment,
    minerJobId: 'miner-job-distinct',
    upstreamJobId: 'upstream-job-distinct',
    blob: `01${baseAssignment.blob.slice(2)}`,
  }));
  const first = new UniqueRandomXMinerWorkProvider(firstSource, leaseStore, {
    createOwner: () => 'owner-token-0003',
  });
  const second = new UniqueRandomXMinerWorkProvider(secondSource, leaseStore, {
    createOwner: () => 'owner-token-0004',
  });

  await first.assign({ connectionId: 'connection-3', worker: principal });
  await first.assign({ connectionId: 'connection-3', worker: principal });
  await second.assign({ connectionId: 'connection-4', worker: principal });
  assert.equal(leaseStore.acquisitions[0]?.owner, leaseStore.acquisitions[1]?.owner);
  assert.equal(leaseStore.leases.size, 2);
  await first.release('connection-3');
  await second.release('connection-4');
});

test('submission resolution fails closed after distributed lease ownership is lost', async () => {
  const leaseStore = new MemoryLeaseStore();
  const source = new MemoryWorkSource(() => baseAssignment);
  const provider = new UniqueRandomXMinerWorkProvider(source, leaseStore, {
    createOwner: () => 'owner-token-0005',
  });
  await provider.assign({ connectionId: 'connection-5', worker: principal });
  const workFingerprint = randomXMinerWorkFingerprint(baseAssignment);
  leaseStore.steal(workFingerprint, 'another-owner-0006');
  assert.equal(await provider.resolve('connection-5', 'miner-job-1'), undefined);
  await provider.release('connection-5');
  assert.equal(
    leaseStore.leases.get(workFingerprint)?.owner,
    'another-owner-0006',
    'release must not delete another replica owner',
  );
});

test('provider shutdown releases every lease and closes both owned boundaries', async () => {
  const leaseStore = new MemoryLeaseStore();
  const source = new MemoryWorkSource(() => baseAssignment);
  const provider = new UniqueRandomXMinerWorkProvider(source, leaseStore, {
    createOwner: () => 'owner-token-0007',
  });
  await provider.assign({ connectionId: 'connection-7', worker: principal });
  await provider.close();
  assert.equal(source.active.size, 0);
  assert.equal(leaseStore.leases.size, 0);
  assert.equal(source.closed, true);
  assert.equal(leaseStore.closed, true);
});

const redisUrl = process.env.REDIS_INTEGRATION_URL;
test(
  'Redis work leases serialize identical assignments across independent clients',
  { skip: redisUrl ? false : 'REDIS_INTEGRATION_URL is not configured' },
  async () => {
    const keyPrefix = `mining:randomx:test:${randomUUID().replaceAll('-', '')}:`;
    const first = await RedisRandomXWorkLeaseStore.connect(redisUrl!, keyPrefix);
    const second = await RedisRandomXWorkLeaseStore.connect(redisUrl!, keyPrefix);
    const workFingerprint = randomXMinerWorkFingerprint(baseAssignment);
    const expiresAt = new Date(Date.now() + 60_000);
    try {
      assert.equal(
        (
          await first.acquire({
            fingerprint: workFingerprint,
            owner: 'redis-owner-00001',
            expiresAt,
          })
        )?.status,
        'ACQUIRED',
      );
      assert.equal(
        await second.acquire({
          fingerprint: workFingerprint,
          owner: 'redis-owner-00002',
          expiresAt,
        }),
        undefined,
      );
      assert.equal(await first.owns(workFingerprint, 'redis-owner-00001'), true);
      assert.equal(await second.owns(workFingerprint, 'redis-owner-00002'), false);
      await second.release(workFingerprint, 'redis-owner-00002');
      assert.equal(await first.owns(workFingerprint, 'redis-owner-00001'), true);
      await first.release(workFingerprint, 'redis-owner-00001');
      assert.equal(
        (
          await second.acquire({
            fingerprint: workFingerprint,
            owner: 'redis-owner-00002',
            expiresAt,
          })
        )?.status,
        'ACQUIRED',
      );
      await second.release(workFingerprint, 'redis-owner-00002');
      await assert.rejects(
        first.acquire({
          fingerprint: workFingerprint,
          owner: 'redis-owner-00001',
          expiresAt: new Date(Date.now() + 310_000),
        }),
        /EXPIRY_TOO_FAR/,
      );
    } finally {
      await first.close();
      await second.close();
    }
  },
);
