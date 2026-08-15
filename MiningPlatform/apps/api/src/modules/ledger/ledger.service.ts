/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@mining/database';

@Injectable()
export class LedgerService {
  async balances(userId: string) {
    const groups = await prisma.journalLine.groupBy({
      by: ['assetId'],
      where: {
        ledgerAccount: { userId, type: 'LIABILITY' },
        journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
      },
      _sum: { debitAtomic: true, creditAtomic: true },
    });
    const assets = await prisma.asset.findMany({
      where: { id: { in: groups.map((group) => group.assetId) } },
      select: { id: true, symbol: true, decimals: true },
    });
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    return {
      balances: groups.map((group) => {
        const asset = assetById.get(group.assetId)!;
        const atomic = (group._sum.creditAtomic ?? 0n) - (group._sum.debitAtomic ?? 0n);
        return {
          asset: asset.symbol,
          decimals: asset.decimals,
          atomic: atomic.toString(),
        };
      }),
      projection: 'POSTED_AND_REVERSED_JOURNAL_LINES',
      payoutStatus: 'DISABLED',
    };
  }

  async entries(userId: string) {
    const entries = await prisma.journalEntry.findMany({
      where: {
        status: { in: ['POSTED', 'REVERSED'] },
        lines: { some: { ledgerAccount: { userId } } },
      },
      select: {
        id: true,
        referenceType: true,
        referenceId: true,
        description: true,
        status: true,
        effectiveAt: true,
        postedAt: true,
        reversedAt: true,
        reversedEntryId: true,
        reversalReason: true,
        correlationId: true,
        lines: {
          where: { ledgerAccount: { userId } },
          select: {
            debit: true,
            credit: true,
            debitAtomic: true,
            creditAtomic: true,
            asset: { select: { symbol: true, decimals: true } },
            ledgerAccount: { select: { code: true, name: true, type: true } },
          },
        },
      },
      orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return {
      entries: entries.map((entry) => ({
        ...entry,
        lines: entry.lines.map((line) => ({
          ...line,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
          debitAtomic: line.debitAtomic.toString(),
          creditAtomic: line.creditAtomic.toString(),
        })),
      })),
    };
  }
}
