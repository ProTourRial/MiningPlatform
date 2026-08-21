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
  const reconciliation = allocation.rewardPeriod.reconciliations[0] ?? null;
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
    feeBasisPoints: allocation.feeBasisPoints.toString(),
    feePartsPerMillion: allocation.feePartsPerMillion,
    referralCommissionPartsPerMillion: allocation.referralCommissionPartsPerMillion,
    referralCommissionAtomic: allocation.referralCommissionAtomic.toString(),
    platformRetainedAtomic: allocation.platformRetainedAtomic.toString(),
    feePolicyVersion: allocation.feePolicyVersion,
    feePolicySnapshot: allocation.feePolicySnapshot,
    referralCodeSnapshot: allocation.referralCodeSnapshot,
    referralProgramSnapshot: allocation.referralProgramSnapshot,
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
      sourceReference: reconciliation?.sourceReference ?? null,
      sourceChecksum: reconciliation?.sourceChecksum ?? null,
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
            reconciliations: {
              where: { status: 'MATCHED', reconciledAt: { not: null } },
              select: { sourceReference: true, sourceChecksum: true },
              orderBy: { importedAt: 'desc' },
              take: 1,
            },
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
        reconciliations: {
          select: {
            id: true,
            status: true,
            sourceReference: true,
            sourceChecksum: true,
            importedAt: true,
            resolvedAt: true,
            reconciledAt: true,
          },
          orderBy: { importedAt: 'asc' },
        },
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
                reconciliations: {
                  where: { status: 'MATCHED', reconciledAt: { not: null } },
                  select: { sourceReference: true, sourceChecksum: true },
                  orderBy: { importedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Reward period not found');
    const activeReconciliation = period.reconciliations.find(
      (reconciliation) => reconciliation.status === 'MATCHED' && reconciliation.reconciledAt,
    );
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
      sourceReference: activeReconciliation?.sourceReference ?? null,
      sourceChecksum: activeReconciliation?.sourceChecksum ?? null,
      reconciliationTrace: period.reconciliations,
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
