/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinCoreChain } from '@mining/blockchain-adapters';
import { canonicalJson, sha256Hex } from '@mining/signer-protocol';
import { assertNativeBitcoinJobBundle, type NativeBitcoinJobBundle } from './native-job.js';
import {
  deserializeNativeBitcoinJobBundle,
  serializeNativeBitcoinJobBundle,
} from './stored-job.js';

const STORE_JOB_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local expiresAt = tonumber(ARGV[1])
local observedAt = tonumber(ARGV[2])
local payload = ARGV[3]
local jobId = ARGV[4]

if not expiresAt or expiresAt <= now then return {0, 'EXPIRED', now} end
if expiresAt - now > 300000 then return {0, 'EXPIRY_TOO_FAR', now} end

local existing = redis.call('GET', KEYS[1])
if existing and existing ~= payload then return {0, 'JOB_CONFLICT', now} end

local activeObservedAt = tonumber(redis.call('HGET', KEYS[2], 'observedAt') or '-1')
local activeJobId = redis.call('HGET', KEYS[2], 'jobId') or ''
if activeObservedAt == observedAt and activeJobId ~= '' and activeJobId ~= jobId then
  return {0, 'ACTIVE_CONFLICT', now}
end
if not existing then redis.call('SET', KEYS[1], payload, 'PXAT', expiresAt) end
if activeObservedAt <= observedAt then
  redis.call('HSET', KEYS[2], 'observedAt', observedAt, 'jobId', jobId, 'payload', payload)
  redis.call('PEXPIREAT', KEYS[2], expiresAt)
  return {1, existing and 'IDEMPOTENT' or 'STORED_ACTIVE', now}
end
return {1, existing and 'IDEMPOTENT_OLDER' or 'STORED_OLDER', now}
`;

const ALLOCATE_EXTRANONCE_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local expiresAt = tonumber(ARGV[1])
local maximum = tonumber(ARGV[2])

if not expiresAt or expiresAt <= now then return {0, 'EXPIRED', now} end
if expiresAt - now > 300000 then return {0, 'EXPIRY_TOO_FAR', now} end
local existing = redis.call('GET', KEYS[1])
local existingExpiry = -1
if existing then
  existingExpiry = redis.call('PEXPIRETIME', KEYS[1])
  if existingExpiry <= now then return {0, 'TTL_INVALID', now} end
end

local counter = redis.call('INCR', KEYS[1])
if counter > maximum then return {0, 'EXHAUSTED', now} end
if counter == 1 then redis.call('PEXPIREAT', KEYS[1], expiresAt) end
if counter > 1 and expiresAt > existingExpiry then redis.call('PEXPIREAT', KEYS[1], expiresAt) end
return {1, tostring(counter), now}
`;

export interface RedisNativeCoordinationClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  get(key: string): Promise<unknown>;
  hGet(key: string, field: string): Promise<unknown>;
}

export type NativeJobStoreReceipt = {
  status: 'STORED_ACTIVE' | 'IDEMPOTENT' | 'STORED_OLDER' | 'IDEMPOTENT_OLDER';
  jobId: string;
  jobDigest: string;
  storedAt: Date;
  expiresAt: Date;
};

export type NativeExtranonceLease = {
  chain: BitcoinCoreChain;
  templateSourceDigest: string;
  counter: number;
  extranonce1: string;
  allocatedAt: Date;
  expiresAt: Date;
  evidenceDigest: string;
};

export type NativeExtranonceAllocationRequest = {
  chain: BitcoinCoreChain;
  templateSourceDigest: string;
  expiresAt: Date;
  extranonce1Bytes?: number;
};

function keyPrefix(value: string | undefined): string {
  const normalized = value?.trim() || 'mining:native:v1:';
  if (normalized.length > 128 || !/^[A-Za-z0-9:_-]+:$/.test(normalized)) {
    throw new Error('Native Redis key prefix is invalid');
  }
  return normalized;
}

function chain(value: BitcoinCoreChain): BitcoinCoreChain {
  if (!['main', 'test', 'testnet4', 'signet', 'regtest'].includes(value)) {
    throw new Error('Native Bitcoin chain is invalid');
  }
  return value;
}

function tuple(
  value: unknown,
  operation: string,
): readonly [number | string, string, number | string] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Redis ${operation} script returned an invalid result`);
  }
  const [success, detail, epoch] = value;
  if (
    (typeof success !== 'number' && typeof success !== 'string') ||
    typeof detail !== 'string' ||
    (typeof epoch !== 'number' && typeof epoch !== 'string')
  ) {
    throw new Error(`Redis ${operation} script returned invalid fields`);
  }
  return [success, detail, epoch];
}

function redisDate(value: number | string, operation: string): Date {
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch) || epoch <= 0) {
    throw new Error(`Redis ${operation} returned an invalid server time`);
  }
  return new Date(epoch);
}

export class RedisNativeBitcoinJobStore {
  private readonly prefix: string;

  constructor(
    private readonly client: RedisNativeCoordinationClient,
    prefix?: string,
  ) {
    this.prefix = keyPrefix(prefix);
  }

  async put(
    nativeChain: BitcoinCoreChain,
    bundle: NativeBitcoinJobBundle,
  ): Promise<NativeJobStoreReceipt> {
    const normalizedChain = chain(nativeChain);
    assertNativeBitcoinJobBundle(bundle);
    const payload = serializeNativeBitcoinJobBundle(bundle);
    if (Buffer.byteLength(payload) > 16 * 1024 * 1024) {
      throw new Error('Native job payload exceeds 16 MiB');
    }
    const result = tuple(
      await this.client.eval(STORE_JOB_SCRIPT, {
        keys: [this.jobKey(normalizedChain, bundle.job.id), this.activeKey(normalizedChain)],
        arguments: [
          String(bundle.job.expiresAt.getTime()),
          String(bundle.job.receivedAt.getTime()),
          payload,
          bundle.job.id,
        ],
      }),
      'native job store',
    );
    if (Number(result[0]) !== 1) {
      throw new Error(`Redis native job store rejected the write: ${result[1]}`);
    }
    if (!['STORED_ACTIVE', 'IDEMPOTENT', 'STORED_OLDER', 'IDEMPOTENT_OLDER'].includes(result[1])) {
      throw new Error('Redis native job store returned an unknown status');
    }
    return {
      status: result[1] as NativeJobStoreReceipt['status'],
      jobId: bundle.job.id,
      jobDigest: bundle.jobDigest,
      storedAt: redisDate(result[2], 'native job store'),
      expiresAt: new Date(bundle.job.expiresAt),
    };
  }

  async get(nativeChain: BitcoinCoreChain, jobId: string): Promise<NativeBitcoinJobBundle | null> {
    const normalizedChain = chain(nativeChain);
    if (!/^native-[1-9]\d{0,9}-[0-9a-f]{24}$/.test(jobId)) {
      throw new Error('Native mining job id is invalid');
    }
    const payload = await this.client.get(this.jobKey(normalizedChain, jobId));
    if (payload === null) return null;
    if (typeof payload !== 'string') throw new Error('Redis native job payload is invalid');
    return deserializeNativeBitcoinJobBundle(payload);
  }

  async getActive(nativeChain: BitcoinCoreChain): Promise<NativeBitcoinJobBundle | null> {
    const normalizedChain = chain(nativeChain);
    const payload = await this.client.hGet(this.activeKey(normalizedChain), 'payload');
    if (payload === null) return null;
    if (typeof payload !== 'string') throw new Error('Redis active native job payload is invalid');
    return deserializeNativeBitcoinJobBundle(payload);
  }

  private jobKey(nativeChain: BitcoinCoreChain, jobId: string): string {
    return `${this.prefix}{${nativeChain}}:job:${encodeURIComponent(jobId)}`;
  }

  private activeKey(nativeChain: BitcoinCoreChain): string {
    return `${this.prefix}{${nativeChain}}:active`;
  }
}

export class RedisNativeExtranonceAllocator {
  private readonly prefix: string;

  constructor(
    private readonly client: Pick<RedisNativeCoordinationClient, 'eval'>,
    prefix?: string,
  ) {
    this.prefix = keyPrefix(prefix);
  }

  async allocate(input: NativeExtranonceAllocationRequest): Promise<NativeExtranonceLease> {
    const normalizedChain = chain(input.chain);
    if (!/^[0-9a-f]{64}$/i.test(input.templateSourceDigest)) {
      throw new Error('Native template source digest is invalid');
    }
    if (Number.isNaN(input.expiresAt.getTime())) {
      throw new Error('Native extranonce allocation expiry is invalid');
    }
    const extranonce1Bytes = input.extranonce1Bytes ?? 4;
    if (!Number.isInteger(extranonce1Bytes) || extranonce1Bytes < 1 || extranonce1Bytes > 6) {
      throw new Error('Native extranonce1 size must be between one and six bytes');
    }
    const maximum = 2 ** (extranonce1Bytes * 8) - 1;
    const result = tuple(
      await this.client.eval(ALLOCATE_EXTRANONCE_SCRIPT, {
        keys: [
          `${
            this.prefix
          }{${normalizedChain}}:extranonce:${input.templateSourceDigest.toLowerCase()}`,
        ],
        arguments: [String(input.expiresAt.getTime()), String(maximum)],
      }),
      'native extranonce allocation',
    );
    if (Number(result[0]) !== 1) {
      throw new Error(`Redis native extranonce allocation failed: ${result[1]}`);
    }
    if (!/^\d+$/.test(result[1])) {
      throw new Error('Redis native extranonce allocation returned an invalid counter');
    }
    const counter = Number(result[1]);
    if (!Number.isSafeInteger(counter) || counter < 1 || counter > maximum) {
      throw new Error('Redis native extranonce allocation exceeded its counter space');
    }
    const allocatedAt = redisDate(result[2], 'native extranonce allocation');
    const extranonce1 = counter.toString(16).padStart(extranonce1Bytes * 2, '0');
    const evidence = {
      chain: normalizedChain,
      templateSourceDigest: input.templateSourceDigest.toLowerCase(),
      counter,
      extranonce1,
      allocatedAt: allocatedAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
    };
    return {
      chain: normalizedChain,
      templateSourceDigest: input.templateSourceDigest.toLowerCase(),
      counter,
      extranonce1,
      allocatedAt,
      expiresAt: new Date(input.expiresAt),
      evidenceDigest: sha256Hex(canonicalJson(evidence)),
    };
  }
}
