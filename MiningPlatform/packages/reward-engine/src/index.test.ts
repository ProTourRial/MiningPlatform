/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateFollowUpstreamReward,
  allocateSettledReward,
  resolveEffectiveFeePolicy,
  snapshotFeePolicy,
  type FeePolicyCandidate,
} from './index.js';

const policy = (overrides: Partial<FeePolicyCandidate> = {}): FeePolicyCandidate => {
  const feeBasisPoints = overrides.feeBasisPoints ?? 50;
  return {
    id: 'default-v1',
    policyKey: 'platform-default',
    version: 1,
    status: 'ACTIVE',
    scope: 'PLATFORM_DEFAULT',
    feeBasisPoints,
    feePartsPerMillion: overrides.feePartsPerMillion ?? feeBasisPoints * 100,
    effectiveFrom: new Date('2026-08-12T17:00:00Z'),
    effectiveUntil: null,
    ...overrides,
  };
};

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
    feePartsPerMillion: 2500,
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

test('allocates gross reward and provider costs exactly with deterministic remainders', () => {
  const allocations = allocateSettledReward({
    grossAtomic: 1_001n,
    upstreamFeeAtomic: 10n,
    networkFeeAtomic: 1n,
    contributions: [
      { miningAccountId: 'account-b', contributionUnits: 1n, feePartsPerMillion: 5000n },
      { miningAccountId: 'account-a', contributionUnits: 2n, feePartsPerMillion: 5000n },
    ],
  });

  assert.deepEqual(
    allocations.map(({ miningAccountId, grossAtomic, upstreamFeeAtomic, networkFeeAtomic }) => ({
      miningAccountId,
      grossAtomic,
      upstreamFeeAtomic,
      networkFeeAtomic,
    })),
    [
      {
        miningAccountId: 'account-a',
        grossAtomic: 667n,
        upstreamFeeAtomic: 7n,
        networkFeeAtomic: 1n,
      },
      {
        miningAccountId: 'account-b',
        grossAtomic: 334n,
        upstreamFeeAtomic: 3n,
        networkFeeAtomic: 0n,
      },
    ],
  );
  assert.equal(
    allocations.reduce((sum, row) => sum + row.grossAtomic, 0n),
    1_001n,
  );
  assert.equal(
    allocations.reduce((sum, row) => sum + row.upstreamFeeAtomic, 0n),
    10n,
  );
  assert.equal(
    allocations.reduce((sum, row) => sum + row.networkFeeAtomic, 0n),
    1n,
  );
  assert.equal(
    allocations.reduce((sum, row) => sum + row.netAtomic + row.platformFeeAtomic, 0n),
    990n,
  );
});

test('applies per-account fee policies and rounds platform fees in the user favour', () => {
  const allocations = allocateSettledReward({
    grossAtomic: 100_001n,
    upstreamFeeAtomic: 0n,
    networkFeeAtomic: 0n,
    contributions: [
      { miningAccountId: 'default-fee', contributionUnits: 1n, feePartsPerMillion: 5000n },
      { miningAccountId: 'custom-fee', contributionUnits: 1n, feePartsPerMillion: 2500n },
    ],
  });

  assert.deepEqual(
    allocations.map(({ miningAccountId, platformFeeAtomic }) => ({
      miningAccountId,
      platformFeeAtomic,
    })),
    [
      { miningAccountId: 'custom-fee', platformFeeAtomic: 125n },
      { miningAccountId: 'default-fee', platformFeeAtomic: 250n },
    ],
  );
});

test('rejects settlements whose costs exceed gross reward', () => {
  assert.throws(
    () =>
      allocateSettledReward({
        grossAtomic: 100n,
        upstreamFeeAtomic: 101n,
        networkFeeAtomic: 0n,
        contributions: [
          { miningAccountId: 'account-a', contributionUnits: 1n, feePartsPerMillion: 5000n },
        ],
      }),
    /cannot exceed gross reward/,
  );
});

test('caps independently rounded provider costs at each account gross allocation', () => {
  const allocations = allocateSettledReward({
    grossAtomic: 2n,
    upstreamFeeAtomic: 1n,
    networkFeeAtomic: 1n,
    contributions: [
      { miningAccountId: 'account-a', contributionUnits: 1n, feePartsPerMillion: 5000n },
      { miningAccountId: 'account-b', contributionUnits: 1n, feePartsPerMillion: 5000n },
    ],
  });

  assert.deepEqual(
    allocations.map(({ miningAccountId, upstreamFeeAtomic, networkFeeAtomic, netAtomic }) => ({
      miningAccountId,
      upstreamFeeAtomic,
      networkFeeAtomic,
      netAtomic,
    })),
    [
      { miningAccountId: 'account-a', upstreamFeeAtomic: 1n, networkFeeAtomic: 0n, netAtomic: 0n },
      { miningAccountId: 'account-b', upstreamFeeAtomic: 0n, networkFeeAtomic: 1n, netAtomic: 0n },
    ],
  );
});

test('applies the exact referral fee and funds commission from the charged platform fee', () => {
  const [allocation] = allocateSettledReward({
    grossAtomic: 100_000n,
    upstreamFeeAtomic: 0n,
    networkFeeAtomic: 0n,
    contributions: [
      {
        miningAccountId: 'referred-account',
        contributionUnits: 1n,
        feePartsPerMillion: 3750n,
        referralCommissionPartsPerMillion: 1250n,
      },
    ],
  });

  assert.equal(allocation?.platformFeeAtomic, 375n);
  assert.equal(allocation?.referralCommissionAtomic, 125n);
  assert.equal(allocation?.platformRetainedAtomic, 250n);
  assert.equal(allocation?.netAtomic, 99_625n);
});
