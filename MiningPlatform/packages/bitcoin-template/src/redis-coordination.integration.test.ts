/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { normalizeBitcoinBlockTemplate } from '@mining/blockchain-adapters';
import { createClient } from 'redis';
import {
  buildNativeBitcoinJob,
  RedisNativeBitcoinJobStore,
  RedisNativeExtranonceAllocator,
} from './index.js';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const REGTEST_TARGET = `7fffff${'00'.repeat(29)}`;
const WITNESS_COMMITMENT = `6a24aa21a9ed${'44'.repeat(32)}`;

function liveBundle(observedAt: Date) {
  const template = normalizeBitcoinBlockTemplate(
    {
      version: 0x20000000,
      rules: ['segwit'],
      vbavailable: {},
      vbrequired: 0,
      previousblockhash: '33'.repeat(32),
      transactions: [],
      coinbaseaux: {},
      coinbasevalue: 5_000_000_000,
      capabilities: ['proposal'],
      longpollid: 'native-live-redis-202',
      target: REGTEST_TARGET,
      mintime: Math.floor(observedAt.getTime() / 1_000) - 1,
      mutable: ['time'],
      noncerange: '00000000ffffffff',
      sigoplimit: 80_000,
      sizelimit: 4_000_000,
      curtime: Math.floor(observedAt.getTime() / 1_000),
      bits: '207fffff',
      height: 202,
      workid: 'work-live-redis-202',
      default_witness_commitment: WITNESS_COMMITMENT,
    },
    observedAt,
  );
  return buildNativeBitcoinJob({
    template,
    payoutAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    payoutNetwork: 'regtest',
    extranonce1: '01020304',
    extranonce2Size: 4,
    assignedDifficulty: '1',
  });
}

test(
  'coordinates private native jobs and extranonce leases across live Redis clients',
  { skip: !redisUrl },
  async () => {
    const firstClient = createClient({ url: redisUrl });
    const secondClient = createClient({ url: redisUrl });
    const errors: Error[] = [];
    firstClient.on('error', (error) => errors.push(error));
    secondClient.on('error', (error) => errors.push(error));
    const prefix = `test:native-live:${randomUUID()}:`;
    const observedAt = new Date();
    const bundle = liveBundle(observedAt);
    const firstStore = new RedisNativeBitcoinJobStore(firstClient, prefix);
    const secondStore = new RedisNativeBitcoinJobStore(secondClient, prefix);
    const firstAllocator = new RedisNativeExtranonceAllocator(firstClient, prefix);
    const secondAllocator = new RedisNativeExtranonceAllocator(secondClient, prefix);
    const counterKey = `${prefix}{regtest}:extranonce:${bundle.templateSourceDigest}`;

    try {
      await Promise.all([firstClient.connect(), secondClient.connect()]);
      assert.equal((await firstStore.put('regtest', bundle)).status, 'STORED_ACTIVE');
      assert.equal((await secondStore.put('regtest', bundle)).status, 'IDEMPOTENT');
      assert.equal((await secondStore.getActive('regtest'))?.jobDigest, bundle.jobDigest);

      const initialExpiry = new Date(Date.now() + 20_000);
      const allocationRequest = {
        chain: 'regtest' as const,
        templateSourceDigest: bundle.templateSourceDigest,
        expiresAt: initialExpiry,
        extranonce1Bytes: 2,
      };
      const hostBefore = Date.now();
      const leases = await Promise.all(
        Array.from({ length: 128 }, (_, index) =>
          (index % 2 === 0 ? firstAllocator : secondAllocator).allocate(allocationRequest),
        ),
      );
      const hostAfter = Date.now();
      assert.equal(new Set(leases.map((lease) => lease.extranonce1)).size, 128);
      assert.equal(Math.min(...leases.map((lease) => lease.counter)), 1);
      assert.equal(Math.max(...leases.map((lease) => lease.counter)), 128);
      assert.equal(
        leases.every(
          (lease) =>
            lease.allocatedAt.getTime() >= hostBefore - 2_000 &&
            lease.allocatedAt.getTime() <= hostAfter + 2_000,
        ),
        true,
      );

      const initialRedisExpiry = await firstClient.pExpireTime(counterKey);
      const refreshedExpiry = new Date(initialExpiry.getTime() + 20_000);
      assert.equal(
        (
          await secondAllocator.allocate({
            ...allocationRequest,
            expiresAt: refreshedExpiry,
          })
        ).counter,
        129,
      );
      const extendedRedisExpiry = await secondClient.pExpireTime(counterKey);
      assert.ok(extendedRedisExpiry > initialRedisExpiry);

      assert.equal((await firstAllocator.allocate(allocationRequest)).counter, 130);
      assert.equal(await firstClient.pExpireTime(counterKey), extendedRedisExpiry);
      assert.equal(errors.length, 0);
    } finally {
      if (firstClient.isOpen) firstClient.destroy();
      if (secondClient.isOpen) secondClient.destroy();
    }
  },
);
