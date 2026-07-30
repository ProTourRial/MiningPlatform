/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type Contribution = {
  miningAccountId: string;
  acceptedDifficulty: bigint;
};

export type RewardAllocation = {
  miningAccountId: string;
  grossSats: bigint;
  platformFeeSats: bigint;
  netSats: bigint;
};

export function allocateFollowUpstreamReward(
  distributableSats: bigint,
  contributions: readonly Contribution[],
  platformFeeBps: bigint,
): RewardAllocation[] {
  if (distributableSats < 0n) throw new Error('Reward cannot be negative');
  if (platformFeeBps < 0n || platformFeeBps > 10_000n) throw new Error('Invalid platform fee');

  const seen = new Set<string>();
  for (const contribution of contributions) {
    if (!contribution.miningAccountId.trim()) throw new Error('Mining account ID is required');
    if (seen.has(contribution.miningAccountId)) {
      throw new Error(`Duplicate mining account contribution: ${contribution.miningAccountId}`);
    }
    if (contribution.acceptedDifficulty <= 0n) {
      throw new Error('Accepted difficulty must be greater than zero');
    }
    seen.add(contribution.miningAccountId);
  }

  const total = contributions.reduce((sum, item) => sum + item.acceptedDifficulty, 0n);
  if (total === 0n) return [];

  let allocatedGross = 0n;
  return contributions.map((item, index) => {
    const isLast = index === contributions.length - 1;
    const grossSats = isLast
      ? distributableSats - allocatedGross
      : (distributableSats * item.acceptedDifficulty) / total;
    allocatedGross += grossSats;
    const platformFeeSats = (grossSats * platformFeeBps) / 10_000n;
    return {
      miningAccountId: item.miningAccountId,
      grossSats,
      platformFeeSats,
      netSats: grossSats - platformFeeSats,
    };
  });
}
