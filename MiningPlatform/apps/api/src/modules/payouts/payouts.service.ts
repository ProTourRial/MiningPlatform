/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';

@Injectable()
export class PayoutsService {
  async preferences(userId: string) {
    const accounts = await prisma.miningAccount.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        autoWithdrawalEnabled: true,
        asset: {
          select: { id: true, symbol: true, minimumPayout: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const addresses = await prisma.payoutAddress.findMany({
      where: {
        userId,
        active: true,
        verified: true,
        assetId: { in: accounts.map((account) => account.asset.id) },
      },
      select: { assetId: true },
    });
    const verifiedAssetIds = new Set(addresses.map((address) => address.assetId));
    const globalPayoutsEnabled = process.env.PAYOUTS_ENABLED === 'true';
    return accounts.map((account) => {
      const hasVerifiedAddress = verifiedAssetIds.has(account.asset.id);
      const blockers = [
        'AUTO_PAYOUT_EXECUTOR_NOT_IMPLEMENTED',
        ...(!globalPayoutsEnabled ? ['GLOBAL_PAYOUT_GATE_DISABLED'] : []),
        ...(!hasVerifiedAddress ? ['NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS'] : []),
      ];
      return {
        miningAccountId: account.id,
        username: account.username,
        asset: account.asset.symbol,
        minimumPayout: account.asset.minimumPayout.toString(),
        autoWithdrawalEnabled: account.autoWithdrawalEnabled,
        effective: account.autoWithdrawalEnabled && blockers.length === 0,
        blockers,
      };
    });
  }

  async updatePreference(userId: string, miningAccountId: string, enabled: boolean) {
    const account = await prisma.miningAccount.findFirst({
      where: { id: miningAccountId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Mining account not found');

    await prisma.$transaction(async (tx) => {
      await tx.miningAccount.update({
        where: { id: miningAccountId },
        data: { autoWithdrawalEnabled: enabled },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: enabled ? 'AUTO_WITHDRAWAL_ENABLED' : 'AUTO_WITHDRAWAL_DISABLED',
          resourceType: 'MiningAccount',
          resourceId: miningAccountId,
          metadata: {
            preferenceOnly: true,
            globalPayoutGateEnabled: process.env.PAYOUTS_ENABLED === 'true',
          },
        },
      });
    });
    const preferences = await this.preferences(userId);
    return preferences.find((preference) => preference.miningAccountId === miningAccountId)!;
  }
}
