/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';

function serializeAllocation(
  allocation: Awaited<ReturnType<RewardsService['findAllocations']>>[number],
) {
  return {
    id: allocation.id,
    miningAccountId: allocation.miningAccountId,
    contribution: allocation.contribution.toString(),
    contributionUnits: allocation.contributionUnits.toString(),
    grossAmount: allocation.grossAmount.toString(),
    grossAtomic: allocation.grossAtomic.toString(),
    upstreamFeeAmount: allocation.upstreamFeeAmount.toString(),
    upstreamFeeAtomic: allocation.upstreamFeeAtomic.toString(),
    networkFeeAmount: allocation.networkFeeAmount.toString(),
    networkFeeAtomic: allocation.networkFeeAtomic.toString(),
    platformFeeAmount: allocation.platformFeeAmount.toString(),
    platformFeeAtomic: allocation.platformFeeAtomic.toString(),
    netAmount: allocation.netAmount.toString(),
    netAtomic: allocation.netAtomic.toString(),
    feeBasisPoints: allocation.feeBasisPoints,
    feePolicyVersion: allocation.feePolicyVersion,
    feePolicySnapshot: allocation.feePolicySnapshot,
    strategyVersion: allocation.strategyVersion,
    roundingPolicy: allocation.roundingPolicy,
    journalEntryId: allocation.journalEntryId,
    createdAt: allocation.createdAt,
    rewardPeriod: {
      id: allocation.rewardPeriod.id,
      status: allocation.rewardPeriod.status,
      reconciliationStatus: allocation.rewardPeriod.reconciliationStatus,
      periodStart: allocation.rewardPeriod.periodStart,
      periodEnd: allocation.rewardPeriod.periodEnd,
      asset: allocation.rewardPeriod.asset,
      upstreamPool: allocation.rewardPeriod.upstreamPool,
      sourceReference: allocation.rewardPeriod.reconciliation?.sourceReference ?? null,
      sourceChecksum: allocation.rewardPeriod.reconciliation?.sourceChecksum ?? null,
    },
  };
}

@Injectable()
export class RewardsService {
  findAllocations(userId: string) {
    return prisma.rewardAllocation.findMany({
      where: { miningAccount: { userId, deletedAt: null } },
      include: {
        rewardPeriod: {
          include: {
            asset: { select: { symbol: true, decimals: true } },
            upstreamPool: { select: { poolKey: true, name: true } },
            reconciliation: { select: { sourceReference: true, sourceChecksum: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async list(userId: string) {
    const allocations = await this.findAllocations(userId);
    return {
      allocations: allocations.map(serializeAllocation),
      payoutStatus: 'DISABLED',
    };
  }

  async period(userId: string, rewardPeriodId: string) {
    const period = await prisma.rewardPeriod.findFirst({
      where: {
        id: rewardPeriodId,
        allocations: { some: { miningAccount: { userId, deletedAt: null } } },
      },
      include: {
        asset: { select: { symbol: true, decimals: true } },
        upstreamPool: { select: { poolKey: true, name: true } },
        reconciliation: true,
        contributionSnapshots: {
          where: { miningAccount: { userId, deletedAt: null } },
          orderBy: { miningAccountId: 'asc' },
        },
        allocations: {
          where: { miningAccount: { userId, deletedAt: null } },
          include: {
            rewardPeriod: {
              include: {
                asset: { select: { symbol: true, decimals: true } },
                upstreamPool: { select: { poolKey: true, name: true } },
                reconciliation: { select: { sourceReference: true, sourceChecksum: true } },
              },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Reward period not found');
    return {
      id: period.id,
      status: period.status,
      reconciliationStatus: period.reconciliationStatus,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      strategyVersion: period.strategyVersion,
      settlementVersion: period.settlementVersion,
      asset: period.asset,
      upstreamPool: period.upstreamPool,
      sourceReference: period.reconciliation?.sourceReference ?? null,
      sourceChecksum: period.reconciliation?.sourceChecksum ?? null,
      contributionSnapshots: period.contributionSnapshots.map((snapshot) => ({
        miningAccountId: snapshot.miningAccountId,
        acceptedDifficulty: snapshot.acceptedDifficulty.toString(),
        shareCount: snapshot.shareCount,
        sourceDigest: snapshot.sourceDigest,
      })),
      allocations: period.allocations.map(serializeAllocation),
    };
  }
}
