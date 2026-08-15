/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateFollowUpstreamReward,
  resolveEffectiveFeePolicy,
  snapshotFeePolicy,
  type FeePolicyCandidate,
} from './index.js';

const policy = (overrides: Partial<FeePolicyCandidate> = {}): FeePolicyCandidate => ({
  id: 'default-v1',
  policyKey: 'platform-default',
  version: 1,
  status: 'ACTIVE',
  scope: 'PLATFORM_DEFAULT',
  feeBasisPoints: 50,
  effectiveFrom: new Date('2026-08-12T17:00:00Z'),
  effectiveUntil: null,
  ...overrides,
});

test('allocates reward and preserves all satoshis', () => {
  const allocations = allocateFollowUpstreamReward(
    1_000n,
    [
      { miningAccountId: 'a', acceptedDifficulty: 3n },
      { miningAccountId: 'b', acceptedDifficulty: 1n },
    ],
    200n,
  );

  assert.equal(
    allocations.reduce((sum, row) => sum + row.grossSats, 0n),
    1_000n,
  );
  assert.equal(allocations[0]?.grossSats, 750n);
  assert.equal(allocations[1]?.grossSats, 250n);
});

test('applies the initial 0.5 percent platform fee policy', () => {
  const [allocation] = allocateFollowUpstreamReward(
    100_000n,
    [{ miningAccountId: 'a', acceptedDifficulty: 1n }],
    50n,
  );

  assert.equal(allocation?.platformFeeSats, 500n);
  assert.equal(allocation?.netSats, 99_500n);
});

test('rejects non-positive contribution', () => {
  assert.throws(
    () =>
      allocateFollowUpstreamReward(
        1_000n,
        [{ miningAccountId: 'a', acceptedDifficulty: -1n }],
        200n,
      ),
    /greater than zero/,
  );
});

test('rejects duplicate mining account contribution', () => {
  assert.throws(
    () =>
      allocateFollowUpstreamReward(
        1_000n,
        [
          { miningAccountId: 'a', acceptedDifficulty: 1n },
          { miningAccountId: 'a', acceptedDifficulty: 2n },
        ],
        200n,
      ),
    /Duplicate mining account/,
  );
});

test('resolves the most specific effective fee policy and snapshots it', () => {
  const resolvedAt = new Date('2026-08-13T00:00:00Z');
  const selected = resolveEffectiveFeePolicy(
    [
      policy(),
      policy({
        id: 'asset-v1',
        policyKey: 'asset:btc',
        scope: 'ASSET',
        assetId: 'btc',
        feeBasisPoints: 40,
      }),
      policy({
        id: 'account-v2',
        policyKey: 'account:miner-1',
        version: 2,
        scope: 'MINING_ACCOUNT',
        miningAccountId: 'miner-1',
        feeBasisPoints: 25,
      }),
    ],
    { assetId: 'btc', miningAccountId: 'miner-1' },
    resolvedAt,
  );

  assert.equal(selected.id, 'account-v2');
  assert.deepEqual(snapshotFeePolicy(selected, resolvedAt), {
    id: 'account-v2',
    policyKey: 'account:miner-1',
    version: 2,
    scope: 'MINING_ACCOUNT',
    feeBasisPoints: 25,
    effectiveFrom: '2026-08-12T17:00:00.000Z',
    effectiveUntil: null,
    resolvedAt: '2026-08-13T00:00:00.000Z',
  });
});

test('ignores inactive and future fee policies', () => {
  const selected = resolveEffectiveFeePolicy(
    [
      policy(),
      policy({
        id: 'future-v2',
        version: 2,
        feeBasisPoints: 10,
        effectiveFrom: new Date('2026-08-14T00:00:00Z'),
      }),
      policy({ id: 'retired', status: 'RETIRED', feeBasisPoints: 200 }),
    ],
    {},
    new Date('2026-08-13T00:00:00Z'),
  );

  assert.equal(selected.id, 'default-v1');
});

test('rejects ambiguous active fee policies at the same scope', () => {
  assert.throws(
    () =>
      resolveEffectiveFeePolicy(
        [policy(), policy({ id: 'other-default', policyKey: 'other-default' })],
        {},
        new Date('2026-08-13T00:00:00Z'),
      ),
    /Ambiguous active fee policies/,
  );
});
