/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBitcoinBlockTemplate } from '@mining/blockchain-adapters';
import {
  buildNativeBitcoinJob,
  deserializeNativeBitcoinJobBundle,
  RedisNativeBitcoinJobStore,
  RedisNativeExtranonceAllocator,
  serializeNativeBitcoinJobBundle,
  type RedisNativeCoordinationClient,
} from './index.js';

const OBSERVED_AT = new Date('2026-08-24T01:00:00.000Z');
const REGTEST_TARGET = `7fffff${'00'.repeat(29)}`;
const WITNESS_COMMITMENT = `6a24aa21a9ed${'11'.repeat(32)}`;

function nativeBundle(extranonce1 = '01020304') {
  const template = normalizeBitcoinBlockTemplate(
    {
      version: 0x20000000,
      rules: ['segwit'],
      vbavailable: {},
      vbrequired: 0,
      previousblockhash: '22'.repeat(32),
      transactions: [],
      coinbaseaux: { flags: '062f503253482f' },
      coinbasevalue: 5_000_000_000,
      capabilities: ['proposal'],
      longpollid: 'native-coordination-101',
      target: REGTEST_TARGET,
      mintime: 1_787_529_599,
      mutable: ['time', 'transactions', 'prevblock'],
      noncerange: '00000000ffffffff',
      sigoplimit: 80_000,
      sizelimit: 4_000_000,
      weightlimit: 4_000_000,
      curtime: 1_787_529_600,
      bits: '207fffff',
      height: 101,
      workid: 'work-101',
      default_witness_commitment: WITNESS_COMMITMENT,
    },
    OBSERVED_AT,
  );
  return buildNativeBitcoinJob({
    template,
    payoutAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    payoutNetwork: 'regtest',
    extranonce1,
    extranonce2Size: 4,
    assignedDifficulty: '1',
  });
}

type ExpiringString = { value: string; expiresAt: number | null };
type ExpiringHash = { values: Map<string, string>; expiresAt: number | null };

class FakeRedisNativeCoordinationClient implements RedisNativeCoordinationClient {
  private readonly strings = new Map<string, ExpiringString>();
  private readonly hashes = new Map<string, ExpiringHash>();
  readonly evaluatedKeySets: string[][] = [];

  constructor(private nowMilliseconds: number) {}

  advance(milliseconds: number): void {
    this.nowMilliseconds += milliseconds;
    this.expire();
  }

  corruptJob(jobId: string): void {
    const entry = [...this.strings.entries()].find(([key]) => key.endsWith(`:job:${jobId}`));
    if (!entry) throw new Error('Fake stored job was not found');
    const parsed = JSON.parse(entry[1].value) as { job: { assignedDifficulty: string } };
    parsed.job.assignedDifficulty = '2';
    entry[1].value = JSON.stringify(parsed);
  }

  async eval(_script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown> {
    this.expire();
    this.evaluatedKeySets.push([...options.keys]);
    if (options.keys.length === 2) return this.storeJob(options);
    if (options.keys.length === 1) return this.allocateExtranonce(options);
    throw new Error('Unexpected fake Redis script');
  }

  async get(key: string): Promise<unknown> {
    this.expire();
    return this.strings.get(key)?.value ?? null;
  }

  async hGet(key: string, field: string): Promise<unknown> {
    this.expire();
    return this.hashes.get(key)?.values.get(field) ?? null;
  }

  private storeJob(options: { keys: string[]; arguments: string[] }): unknown {
    const [jobKey, activeKey] = options.keys;
    const [expiresAtRaw, observedAtRaw, payload, jobId] = options.arguments;
    if (!jobKey || !activeKey || !payload || !jobId) throw new Error('Invalid fake store input');
    const expiresAt = Number(expiresAtRaw);
    const observedAt = Number(observedAtRaw);
    if (expiresAt <= this.nowMilliseconds) return [0, 'EXPIRED', this.nowMilliseconds];
    if (expiresAt - this.nowMilliseconds > 300_000) {
      return [0, 'EXPIRY_TOO_FAR', this.nowMilliseconds];
    }
    const existing = this.strings.get(jobKey);
    if (existing && existing.value !== payload) return [0, 'JOB_CONFLICT', this.nowMilliseconds];

    const active = this.hashes.get(activeKey);
    const activeObservedAt = Number(active?.values.get('observedAt') ?? -1);
    const activeJobId = active?.values.get('jobId') ?? '';
    if (activeObservedAt === observedAt && activeJobId && activeJobId !== jobId) {
      return [0, 'ACTIVE_CONFLICT', this.nowMilliseconds];
    }
    if (!existing) this.strings.set(jobKey, { value: payload, expiresAt });
    if (activeObservedAt <= observedAt) {
      this.hashes.set(activeKey, {
        values: new Map([
          ['observedAt', String(observedAt)],
          ['jobId', jobId],
          ['payload', payload],
        ]),
        expiresAt,
      });
      return [1, existing ? 'IDEMPOTENT' : 'STORED_ACTIVE', this.nowMilliseconds];
    }
    return [1, existing ? 'IDEMPOTENT_OLDER' : 'STORED_OLDER', this.nowMilliseconds];
  }

  private allocateExtranonce(options: { keys: string[]; arguments: string[] }): unknown {
    const key = options.keys[0];
    const expiresAt = Number(options.arguments[0]);
    const maximum = Number(options.arguments[1]);
    if (!key) throw new Error('Invalid fake allocator input');
    if (expiresAt <= this.nowMilliseconds) return [0, 'EXPIRED', this.nowMilliseconds];
    if (expiresAt - this.nowMilliseconds > 300_000) {
      return [0, 'EXPIRY_TOO_FAR', this.nowMilliseconds];
    }
    const existing = this.strings.get(key);
    if (existing && existing.expiresAt === null) {
      return [0, 'TTL_INVALID', this.nowMilliseconds];
    }
    const counter = Number(existing?.value ?? 0) + 1;
    this.strings.set(key, {
      value: String(counter),
      expiresAt: Math.max(existing?.expiresAt ?? 0, expiresAt),
    });
    if (counter > maximum) return [0, 'EXHAUSTED', this.nowMilliseconds];
    return [1, String(counter), this.nowMilliseconds];
  }

  private expire(): void {
    for (const [key, value] of this.strings) {
      if (value.expiresAt !== null && value.expiresAt <= this.nowMilliseconds) {
        this.strings.delete(key);
      }
    }
    for (const [key, value] of this.hashes) {
      if (value.expiresAt !== null && value.expiresAt <= this.nowMilliseconds) {
        this.hashes.delete(key);
      }
    }
  }
}

test('native job serialization round trips BigInt and Date evidence and rejects mutation', () => {
  const bundle = nativeBundle();
  const serialized = serializeNativeBitcoinJobBundle(bundle);
  const restored = deserializeNativeBitcoinJobBundle(serialized);
  assert.equal(restored.jobDigest, bundle.jobDigest);
  assert.equal(restored.target, bundle.target);
  assert.equal(restored.coinbase.coinbaseValueAtomic, bundle.coinbase.coinbaseValueAtomic);
  assert.equal(restored.job.expiresAt.toISOString(), bundle.job.expiresAt.toISOString());

  const mutated = JSON.parse(serialized) as { job: { assignedDifficulty: string } };
  mutated.job.assignedDifficulty = '2';
  assert.throws(
    () => deserializeNativeBitcoinJobBundle(JSON.stringify(mutated)),
    /job evidence digest/,
  );
});

test('Redis native job store is idempotent, active, expiring, and mutation detecting', async () => {
  const bundle = nativeBundle();
  const client = new FakeRedisNativeCoordinationClient(OBSERVED_AT.getTime());
  const firstReplica = new RedisNativeBitcoinJobStore(client, 'test:native:v1:');
  const secondReplica = new RedisNativeBitcoinJobStore(client, 'test:native:v1:');

  assert.equal((await firstReplica.put('regtest', bundle)).status, 'STORED_ACTIVE');
  assert.equal(client.evaluatedKeySets[0]?.every((key) => key.includes('{regtest}')), true);
  assert.equal((await secondReplica.put('regtest', bundle)).status, 'IDEMPOTENT');
  assert.equal((await firstReplica.get('regtest', bundle.job.id))?.jobDigest, bundle.jobDigest);
  assert.equal((await secondReplica.getActive('regtest'))?.job.id, bundle.job.id);

  client.corruptJob(bundle.job.id);
  await assert.rejects(firstReplica.get('regtest', bundle.job.id), /job evidence digest/);
  assert.equal((await secondReplica.getActive('regtest'))?.jobDigest, bundle.jobDigest);

  client.advance(bundle.job.expiresAt.getTime() - OBSERVED_AT.getTime());
  assert.equal(await firstReplica.get('regtest', bundle.job.id), null);
  assert.equal(await secondReplica.getActive('regtest'), null);
});

test('Redis native job store rejects an active conflict without a partial job write', async () => {
  const firstBundle = nativeBundle();
  const conflictingBundle = nativeBundle('01020305');
  const client = new FakeRedisNativeCoordinationClient(OBSERVED_AT.getTime());
  const store = new RedisNativeBitcoinJobStore(client, 'test:native:v1:');

  assert.equal((await store.put('regtest', firstBundle)).status, 'STORED_ACTIVE');
  await assert.rejects(store.put('regtest', conflictingBundle), /ACTIVE_CONFLICT/);
  assert.equal(await store.get('regtest', conflictingBundle.job.id), null);
  assert.equal((await store.getActive('regtest'))?.job.id, firstBundle.job.id);
});

test('Redis-time extranonce allocation is unique across replicas and keeps refreshed TTL monotonic', async () => {
  const bundle = nativeBundle();
  const client = new FakeRedisNativeCoordinationClient(OBSERVED_AT.getTime());
  const firstReplica = new RedisNativeExtranonceAllocator(client, 'test:native:v1:');
  const secondReplica = new RedisNativeExtranonceAllocator(client, 'test:native:v1:');
  const request = {
    chain: 'regtest' as const,
    templateSourceDigest: bundle.templateSourceDigest,
    expiresAt: bundle.job.expiresAt,
    extranonce1Bytes: 2,
  };
  const leases = await Promise.all(
    Array.from({ length: 128 }, (_, index) =>
      (index % 2 === 0 ? firstReplica : secondReplica).allocate(request),
    ),
  );
  assert.equal(
    client.evaluatedKeySets.every(([key]) => key?.includes('{regtest}')),
    true,
  );
  assert.equal(new Set(leases.map((lease) => lease.extranonce1)).size, 128);
  assert.equal(Math.min(...leases.map((lease) => lease.counter)), 1);
  assert.equal(Math.max(...leases.map((lease) => lease.counter)), 128);
  assert.equal(
    leases.every((lease) => /^[0-9a-f]{4}$/.test(lease.extranonce1)),
    true,
  );
  assert.equal(
    leases.every((lease) => /^[0-9a-f]{64}$/.test(lease.evidenceDigest)),
    true,
  );

  const refreshedRequest = {
    ...request,
    expiresAt: new Date(bundle.job.expiresAt.getTime() + 60_000),
  };
  assert.equal((await secondReplica.allocate(refreshedRequest)).counter, 129);

  client.advance(bundle.job.expiresAt.getTime() - OBSERVED_AT.getTime());
  assert.equal((await firstReplica.allocate(refreshedRequest)).counter, 130);

  client.advance(60_000);
  await assert.rejects(firstReplica.allocate(refreshedRequest), /EXPIRED/);
});

test('Redis coordination rejects lifetimes beyond the bounded native job window', async () => {
  const bundle = nativeBundle();
  const client = new FakeRedisNativeCoordinationClient(OBSERVED_AT.getTime());
  const allocator = new RedisNativeExtranonceAllocator(client, 'test:native:v1:');
  await assert.rejects(
    allocator.allocate({
      chain: 'regtest',
      templateSourceDigest: bundle.templateSourceDigest,
      expiresAt: new Date(OBSERVED_AT.getTime() + 300_001),
    }),
    /EXPIRY_TOO_FAR/,
  );
});

test('Redis extranonce allocation fails closed after exhausting its counter space', async () => {
  const bundle = nativeBundle();
  const client = new FakeRedisNativeCoordinationClient(OBSERVED_AT.getTime());
  const allocator = new RedisNativeExtranonceAllocator(client, 'test:native:v1:');
  const request = {
    chain: 'regtest' as const,
    templateSourceDigest: bundle.templateSourceDigest,
    expiresAt: bundle.job.expiresAt,
    extranonce1Bytes: 1,
  };

  for (let counter = 1; counter <= 255; counter += 1) {
    assert.equal((await allocator.allocate(request)).counter, counter);
  }
  await assert.rejects(allocator.allocate(request), /EXHAUSTED/);
  await assert.rejects(allocator.allocate(request), /EXHAUSTED/);
});
