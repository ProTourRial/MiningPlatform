/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';
import { applyRandomXNonce } from '@mining/randomx';
import { projectRandomXMinerJob, type RandomXMinerJobAssignment } from './miner-protocol.js';
import type { RandomXMinerWorkProvider } from './miner-server.js';

const MAXIMUM_LEASE_MILLISECONDS = 300_000;

const ACQUIRE_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local expiresAt = tonumber(ARGV[1])
local owner = ARGV[2]

if not expiresAt or expiresAt <= now then return {0, 'EXPIRED', now} end
if expiresAt - now > ${MAXIMUM_LEASE_MILLISECONDS} then return {0, 'EXPIRY_TOO_FAR', now} end

local existing = redis.call('GET', KEYS[1])
if existing and existing ~= owner then return {0, 'CONFLICT', now} end

redis.call('SET', KEYS[1], owner, 'PXAT', expiresAt)
return {1, existing and 'RENEWED' or 'ACQUIRED', now}
`;

const OWNS_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local existing = redis.call('GET', KEYS[1])
local expiresAt = redis.call('PEXPIRETIME', KEYS[1])

if existing == ARGV[1] and expiresAt > now then return {1, 'OWNED', now} end
return {0, existing and 'OWNED_BY_ANOTHER' or 'MISSING', now}
`;

const RELEASE_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local existing = redis.call('GET', KEYS[1])

if existing == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {1, 'RELEASED', now}
end
return {1, existing and 'NOT_OWNER' or 'MISSING', now}
`;

export type RandomXWorkLeaseReceipt = {
  status: 'ACQUIRED' | 'RENEWED';
  fingerprint: string;
  acquiredAt: Date;
  expiresAt: Date;
};

export interface RandomXWorkLeaseStore {
  acquire(input: {
    fingerprint: string;
    owner: string;
    expiresAt: Date;
  }): Promise<RandomXWorkLeaseReceipt | undefined>;
  owns(fingerprint: string, owner: string): Promise<boolean>;
  release(fingerprint: string, owner: string): Promise<void>;
  close?(): Promise<void>;
}

export interface RedisRandomXWorkLeaseClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

type ActiveLease = {
  fingerprint: string;
  owner: string;
  minerJobId: string;
  upstreamJobId: string;
};

function boundedToken(value: string, label: string): string {
  if (!/^[A-Za-z0-9:_-]{16,256}$/.test(value)) {
    throw new Error(`RandomX ${label} is invalid`);
  }
  return value;
}

function fingerprint(value: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('RandomX work fingerprint is invalid');
  }
  return value.toLowerCase();
}

function prefix(value: string | undefined): string {
  const normalized = value?.trim() || 'mining:randomx:v1:';
  if (normalized.length > 128 || !/^[A-Za-z0-9:_-]+:$/.test(normalized)) {
    throw new Error('RandomX Redis key prefix is invalid');
  }
  return normalized;
}

function tuple(value: unknown, operation: string): readonly [number, string, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Redis RandomX ${operation} returned an invalid result`);
  }
  const success = Number(value[0]);
  const detail = value[1];
  const epoch = Number(value[2]);
  if (
    ![0, 1].includes(success) ||
    typeof detail !== 'string' ||
    !Number.isSafeInteger(epoch) ||
    epoch <= 0
  ) {
    throw new Error(`Redis RandomX ${operation} returned invalid fields`);
  }
  return [success, detail, epoch];
}

function cloneAssignment(assignment: RandomXMinerJobAssignment): RandomXMinerJobAssignment {
  return { ...assignment, expiresAt: new Date(assignment.expiresAt) };
}

/**
 * A miner may search all four nonce bytes. Work is therefore unique only when
 * the hashing blob outside those bytes (or the RandomX seed) is different.
 * Job ids and share targets intentionally do not participate in this digest.
 */
export function randomXMinerWorkFingerprint(assignment: RandomXMinerJobAssignment): string {
  projectRandomXMinerJob(assignment);
  const normalizedBlob = applyRandomXNonce(assignment.blob, '00000000');
  return createHash('sha256')
    .update('miningplatform:randomx-miner-work:v1\0', 'utf8')
    .update(assignment.algorithm, 'utf8')
    .update('\0', 'utf8')
    .update(assignment.seedHash.toLowerCase(), 'utf8')
    .update('\0', 'utf8')
    .update(normalizedBlob, 'utf8')
    .digest('hex');
}

export class RedisRandomXWorkLeaseStore implements RandomXWorkLeaseStore {
  private readonly keyPrefix: string;

  constructor(
    private readonly client: RedisRandomXWorkLeaseClient,
    keyPrefix?: string,
    private readonly closeClient?: () => Promise<void>,
  ) {
    this.keyPrefix = prefix(keyPrefix);
  }

  static async connect(url: string, keyPrefix?: string): Promise<RedisRandomXWorkLeaseStore> {
    if (!url.trim()) throw new Error('RandomX Redis URL is required');
    const client: RedisClientType = createClient({ url });
    await client.connect();
    return new RedisRandomXWorkLeaseStore(client, keyPrefix, async () => {
      if (client.isOpen) await client.quit();
    });
  }

  async acquire(input: {
    fingerprint: string;
    owner: string;
    expiresAt: Date;
  }): Promise<RandomXWorkLeaseReceipt | undefined> {
    const normalizedFingerprint = fingerprint(input.fingerprint);
    const owner = boundedToken(input.owner, 'work lease owner');
    if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
      throw new Error('RandomX work lease expiry is invalid');
    }
    const result = tuple(
      await this.client.eval(ACQUIRE_SCRIPT, {
        keys: [this.key(normalizedFingerprint)],
        arguments: [String(input.expiresAt.getTime()), owner],
      }),
      'work lease acquisition',
    );
    if (result[0] === 0) {
      if (result[1] === 'CONFLICT') return undefined;
      if (['EXPIRED', 'EXPIRY_TOO_FAR'].includes(result[1])) {
        throw new Error(`Redis RandomX work lease rejected the expiry: ${result[1]}`);
      }
      throw new Error(`Redis RandomX work lease acquisition failed: ${result[1]}`);
    }
    if (!['ACQUIRED', 'RENEWED'].includes(result[1])) {
      throw new Error('Redis RandomX work lease returned an unknown acquisition status');
    }
    return {
      status: result[1] as RandomXWorkLeaseReceipt['status'],
      fingerprint: normalizedFingerprint,
      acquiredAt: new Date(result[2]),
      expiresAt: new Date(input.expiresAt),
    };
  }

  async owns(workFingerprint: string, ownerValue: string): Promise<boolean> {
    const normalizedFingerprint = fingerprint(workFingerprint);
    const owner = boundedToken(ownerValue, 'work lease owner');
    const result = tuple(
      await this.client.eval(OWNS_SCRIPT, {
        keys: [this.key(normalizedFingerprint)],
        arguments: [owner],
      }),
      'work lease ownership check',
    );
    if (!['OWNED', 'OWNED_BY_ANOTHER', 'MISSING'].includes(result[1])) {
      throw new Error('Redis RandomX work lease returned an unknown ownership status');
    }
    return result[0] === 1 && result[1] === 'OWNED';
  }

  async release(workFingerprint: string, ownerValue: string): Promise<void> {
    const normalizedFingerprint = fingerprint(workFingerprint);
    const owner = boundedToken(ownerValue, 'work lease owner');
    const result = tuple(
      await this.client.eval(RELEASE_SCRIPT, {
        keys: [this.key(normalizedFingerprint)],
        arguments: [owner],
      }),
      'work lease release',
    );
    if (result[0] !== 1 || !['RELEASED', 'NOT_OWNER', 'MISSING'].includes(result[1])) {
      throw new Error(`Redis RandomX work lease release failed: ${result[1]}`);
    }
  }

  async close(): Promise<void> {
    await this.closeClient?.();
  }

  private key(workFingerprint: string): string {
    return `${this.keyPrefix}work:${workFingerprint}`;
  }
}

export class RandomXWorkIsolationConflictError extends Error {
  constructor(readonly fingerprint: string) {
    super('RandomX work is already leased to another active miner');
    this.name = 'RandomXWorkIsolationConflictError';
  }
}

export class UniqueRandomXMinerWorkProvider implements RandomXMinerWorkProvider {
  private readonly leases = new Map<string, ActiveLease>();
  private readonly createOwner: () => string;

  constructor(
    private readonly source: RandomXMinerWorkProvider,
    private readonly leaseStore: RandomXWorkLeaseStore,
    options: { createOwner?: () => string } = {},
  ) {
    this.createOwner = options.createOwner ?? randomUUID;
  }

  async assign(input: {
    connectionId: string;
    worker: { workerId: string; workerName: string; miningAccountId: string };
  }): Promise<RandomXMinerJobAssignment | undefined> {
    const assignment = await this.source.assign(input);
    if (!assignment) {
      await this.release(input.connectionId);
      return undefined;
    }
    const normalizedAssignment = cloneAssignment(assignment);
    const workFingerprint = randomXMinerWorkFingerprint(normalizedAssignment);
    const current = this.leases.get(input.connectionId);
    const owner =
      current?.fingerprint === workFingerprint
        ? current.owner
        : boundedToken(this.createOwner(), 'work lease owner');

    let receipt: RandomXWorkLeaseReceipt | undefined;
    try {
      receipt = await this.leaseStore.acquire({
        fingerprint: workFingerprint,
        owner,
        expiresAt: normalizedAssignment.expiresAt,
      });
    } catch (error) {
      await this.release(input.connectionId);
      throw error;
    }
    if (!receipt) {
      await this.release(input.connectionId);
      throw new RandomXWorkIsolationConflictError(workFingerprint);
    }

    const next: ActiveLease = {
      fingerprint: workFingerprint,
      owner,
      minerJobId: normalizedAssignment.minerJobId,
      upstreamJobId: normalizedAssignment.upstreamJobId,
    };
    this.leases.set(input.connectionId, next);
    if (current && current.fingerprint !== workFingerprint) {
      try {
        await this.leaseStore.release(current.fingerprint, current.owner);
      } catch (error) {
        await this.release(input.connectionId);
        throw error;
      }
    }
    return cloneAssignment(normalizedAssignment);
  }

  async resolve(
    connectionId: string,
    minerJobId: string,
  ): Promise<{ upstreamJobId: string } | undefined> {
    const active = this.leases.get(connectionId);
    if (!active || active.minerJobId !== minerJobId) return undefined;
    if (!(await this.leaseStore.owns(active.fingerprint, active.owner))) return undefined;
    const resolved = await this.source.resolve(connectionId, minerJobId);
    if (!resolved || resolved.upstreamJobId !== active.upstreamJobId) return undefined;
    return { upstreamJobId: active.upstreamJobId };
  }

  async release(connectionId: string): Promise<void> {
    const active = this.leases.get(connectionId);
    this.leases.delete(connectionId);
    const operations: Promise<unknown>[] = [this.source.release(connectionId)];
    if (active) {
      operations.push(this.leaseStore.release(active.fingerprint, active.owner));
    }
    const results = await Promise.allSettled(operations);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        'RandomX work release did not complete',
      );
    }
  }

  async close(): Promise<void> {
    const failures: unknown[] = [];
    for (const connectionId of [...this.leases.keys()]) {
      try {
        await this.release(connectionId);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await this.source.close?.();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.leaseStore.close?.();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'RandomX isolated work provider did not close cleanly');
    }
  }
}
