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

export type SettlementContribution = {
  miningAccountId: string;
  contributionUnits: bigint;
  feeBasisPoints: bigint;
};

export type SettledRewardAllocation = {
  miningAccountId: string;
  contributionUnits: bigint;
  grossAtomic: bigint;
  upstreamFeeAtomic: bigint;
  networkFeeAtomic: bigint;
  platformFeeAtomic: bigint;
  netAtomic: bigint;
};

export type FeePolicyScope =
  | 'PLATFORM_DEFAULT'
  | 'ASSET'
  | 'ALGORITHM'
  | 'NETWORK'
  | 'CAMPAIGN'
  | 'REFERRAL'
  | 'ACCOUNT_TIER'
  | 'MINING_ACCOUNT';

export type FeePolicyCandidate = {
  id: string;
  policyKey: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  scope: FeePolicyScope;
  feeBasisPoints: number;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  assetId?: string | null;
  algorithm?: string | null;
  network?: string | null;
  campaignCode?: string | null;
  referralCode?: string | null;
  accountTier?: string | null;
  miningAccountId?: string | null;
};

export type FeePolicyResolutionContext = {
  assetId?: string;
  algorithm?: string;
  network?: string;
  campaignCode?: string;
  referralCode?: string;
  accountTier?: string;
  miningAccountId?: string;
};

export type FeePolicySnapshot = Readonly<{
  id: string;
  policyKey: string;
  version: number;
  scope: FeePolicyScope;
  feeBasisPoints: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  resolvedAt: string;
}>;

const FEE_SCOPE_PRIORITY: Record<FeePolicyScope, number> = {
  PLATFORM_DEFAULT: 0,
  ALGORITHM: 1,
  ASSET: 2,
  NETWORK: 3,
  CAMPAIGN: 4,
  REFERRAL: 5,
  ACCOUNT_TIER: 6,
  MINING_ACCOUNT: 7,
};

function matchesFeeScope(policy: FeePolicyCandidate, context: FeePolicyResolutionContext): boolean {
  switch (policy.scope) {
    case 'PLATFORM_DEFAULT':
      return true;
    case 'ASSET':
      return policy.assetId === context.assetId;
    case 'ALGORITHM':
      return policy.algorithm === context.algorithm;
    case 'NETWORK':
      return policy.network === context.network;
    case 'CAMPAIGN':
      return policy.campaignCode === context.campaignCode;
    case 'REFERRAL':
      return policy.referralCode === context.referralCode;
    case 'ACCOUNT_TIER':
      return policy.accountTier === context.accountTier;
    case 'MINING_ACCOUNT':
      return policy.miningAccountId === context.miningAccountId;
  }
}

export function resolveEffectiveFeePolicy(
  policies: readonly FeePolicyCandidate[],
  context: FeePolicyResolutionContext,
  at: Date = new Date(),
): FeePolicyCandidate {
  if (Number.isNaN(at.getTime())) throw new Error('Fee policy resolution time is invalid');

  const matches = policies.filter((policy) => {
    if (!Number.isInteger(policy.version) || policy.version < 0) {
      throw new Error(`Invalid fee policy version: ${policy.policyKey}`);
    }
    if (
      !Number.isInteger(policy.feeBasisPoints) ||
      policy.feeBasisPoints < 0 ||
      policy.feeBasisPoints > 10_000
    ) {
      throw new Error(`Invalid fee basis points: ${policy.policyKey}`);
    }
    if (
      Number.isNaN(policy.effectiveFrom.getTime()) ||
      (policy.effectiveUntil && Number.isNaN(policy.effectiveUntil.getTime()))
    ) {
      throw new Error(`Invalid fee policy effective window: ${policy.policyKey}`);
    }

    return (
      policy.status === 'ACTIVE' &&
      policy.effectiveFrom <= at &&
      (!policy.effectiveUntil || policy.effectiveUntil > at) &&
      matchesFeeScope(policy, context)
    );
  });

  if (matches.length === 0)
    throw new Error('No effective fee policy matches the settlement context');

  const highestPriority = Math.max(...matches.map((policy) => FEE_SCOPE_PRIORITY[policy.scope]));
  const scoped = matches.filter((policy) => FEE_SCOPE_PRIORITY[policy.scope] === highestPriority);
  const policyKeys = new Set(scoped.map((policy) => policy.policyKey));
  if (policyKeys.size > 1) {
    throw new Error(`Ambiguous active fee policies for scope ${scoped[0]?.scope ?? 'UNKNOWN'}`);
  }

  return [...scoped].sort((left, right) => {
    const effectiveDifference = right.effectiveFrom.getTime() - left.effectiveFrom.getTime();
    if (effectiveDifference !== 0) return effectiveDifference;
    if (right.version !== left.version) return right.version - left.version;
    return left.id.localeCompare(right.id);
  })[0]!;
}

export function snapshotFeePolicy(
  policy: FeePolicyCandidate,
  resolvedAt: Date = new Date(),
): FeePolicySnapshot {
  return Object.freeze({
    id: policy.id,
    policyKey: policy.policyKey,
    version: policy.version,
    scope: policy.scope,
    feeBasisPoints: policy.feeBasisPoints,
    effectiveFrom: policy.effectiveFrom.toISOString(),
    effectiveUntil: policy.effectiveUntil?.toISOString() ?? null,
    resolvedAt: resolvedAt.toISOString(),
  });
}

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

function assertSettlementContributions(
  contributions: readonly SettlementContribution[],
): readonly SettlementContribution[] {
  const ordered = [...contributions].sort((left, right) =>
    left.miningAccountId.localeCompare(right.miningAccountId),
  );
  const seen = new Set<string>();
  for (const contribution of ordered) {
    if (!contribution.miningAccountId.trim()) throw new Error('Mining account ID is required');
    if (seen.has(contribution.miningAccountId)) {
      throw new Error(`Duplicate mining account contribution: ${contribution.miningAccountId}`);
    }
    if (contribution.contributionUnits <= 0n) {
      throw new Error('Contribution units must be greater than zero');
    }
    if (contribution.feeBasisPoints < 0n || contribution.feeBasisPoints > 10_000n) {
      throw new Error(`Invalid fee basis points: ${contribution.miningAccountId}`);
    }
    seen.add(contribution.miningAccountId);
  }
  return ordered;
}

function allocateByLargestRemainder(
  totalAtomic: bigint,
  contributions: readonly SettlementContribution[],
  capacity?: ReadonlyMap<string, bigint>,
): ReadonlyMap<string, bigint> {
  if (totalAtomic < 0n) throw new Error('Settlement amount cannot be negative');
  const totalContribution = contributions.reduce(
    (sum, contribution) => sum + contribution.contributionUnits,
    0n,
  );
  if (totalContribution <= 0n) return new Map();

  const rows = contributions.map((contribution) => {
    const numerator = totalAtomic * contribution.contributionUnits;
    const maximum = capacity?.get(contribution.miningAccountId) ?? totalAtomic;
    return {
      miningAccountId: contribution.miningAccountId,
      allocated: [numerator / totalContribution, maximum].reduce((left, right) =>
        left < right ? left : right,
      ),
      remainder: numerator % totalContribution,
      maximum,
    };
  });
  let residual = totalAtomic - rows.reduce((sum, row) => sum + row.allocated, 0n);
  const ranked = [...rows].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.miningAccountId.localeCompare(right.miningAccountId);
    }
    return left.remainder > right.remainder ? -1 : 1;
  });
  while (residual > 0n) {
    let progressed = false;
    for (const row of ranked) {
      if (residual === 0n) break;
      if (row.allocated >= row.maximum) continue;
      row.allocated += 1n;
      residual -= 1n;
      progressed = true;
    }
    if (!progressed) throw new Error('Settlement allocation exceeds account capacity');
  }
  return new Map(rows.map((row) => [row.miningAccountId, row.allocated]));
}

/**
 * Allocates an imported upstream settlement in smallest asset units.
 *
 * Gross reward and provider costs use deterministic largest-remainder allocation.
 * Platform fees round down per account, favouring the user at the atomic-unit boundary.
 */
export function allocateSettledReward(input: {
  grossAtomic: bigint;
  upstreamFeeAtomic: bigint;
  networkFeeAtomic: bigint;
  contributions: readonly SettlementContribution[];
}): SettledRewardAllocation[] {
  if (input.grossAtomic < 0n) throw new Error('Gross reward cannot be negative');
  if (input.upstreamFeeAtomic < 0n || input.networkFeeAtomic < 0n) {
    throw new Error('Settlement costs cannot be negative');
  }
  if (input.upstreamFeeAtomic + input.networkFeeAtomic > input.grossAtomic) {
    throw new Error('Settlement costs cannot exceed gross reward');
  }

  const contributions = assertSettlementContributions(input.contributions);
  if (contributions.length === 0) {
    if (input.grossAtomic !== 0n) throw new Error('Non-zero settlement requires contributions');
    return [];
  }

  const gross = allocateByLargestRemainder(input.grossAtomic, contributions);
  const upstreamFees = allocateByLargestRemainder(input.upstreamFeeAtomic, contributions, gross);
  const networkCapacity = new Map(
    contributions.map((contribution) => [
      contribution.miningAccountId,
      (gross.get(contribution.miningAccountId) ?? 0n) -
        (upstreamFees.get(contribution.miningAccountId) ?? 0n),
    ]),
  );
  const networkFees = allocateByLargestRemainder(
    input.networkFeeAtomic,
    contributions,
    networkCapacity,
  );

  return contributions.map((contribution) => {
    const grossAtomic = gross.get(contribution.miningAccountId) ?? 0n;
    const upstreamFeeAtomic = upstreamFees.get(contribution.miningAccountId) ?? 0n;
    const networkFeeAtomic = networkFees.get(contribution.miningAccountId) ?? 0n;
    const platformFeeAtomic = (grossAtomic * contribution.feeBasisPoints) / 10_000n;
    const netAtomic = grossAtomic - upstreamFeeAtomic - networkFeeAtomic - platformFeeAtomic;
    if (netAtomic < 0n) {
      throw new Error(
        `Settlement costs and platform fee exceed account gross reward: ${contribution.miningAccountId}`,
      );
    }
    return {
      miningAccountId: contribution.miningAccountId,
      contributionUnits: contribution.contributionUnits,
      grossAtomic,
      upstreamFeeAtomic,
      networkFeeAtomic,
      platformFeeAtomic,
      netAtomic,
    };
  });
}
