/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';

@Injectable()
export class MonitoringService {
  async getDashboardOverview(userId: string) {
    const since = new Date(Date.now() - 5 * 60 * 1_000);
    const [workers, shareCounts, latestHashrate, unreadNotifications] = await Promise.all([
      prisma.worker.groupBy({
        by: ['status'],
        where: { userId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.share.groupBy({
        by: ['status'],
        where: { worker: { userId, deletedAt: null }, submittedAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.hashrateSnapshot.findMany({
        where: { worker: { userId, deletedAt: null }, windowSeconds: 300 },
        orderBy: { recordedAt: 'desc' },
        distinct: ['workerId'],
        select: { workerId: true, hashrate: true, acceptedShares: true, rejectedShares: true, recordedAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const workerStatus = Object.fromEntries(workers.map((entry) => [entry.status, entry._count._all]));
    const shares = Object.fromEntries(shareCounts.map((entry) => [entry.status, entry._count._all]));
    const totalHashrate5m = latestHashrate.reduce((sum, item) => sum + Number(item.hashrate.toString()), 0);
    return {
      generatedAt: new Date().toISOString(),
      windowSeconds: 300,
      workers: {
        total: Object.values(workerStatus).reduce((sum, count) => sum + count, 0),
        byStatus: workerStatus,
      },
      shares: {
        byStatus: shares,
        accepted: (shares.LOCAL_ACCEPTED ?? 0) + (shares.UPSTREAM_ACCEPTED ?? 0),
        rejected: (shares.LOCAL_REJECTED ?? 0) + (shares.UPSTREAM_REJECTED ?? 0),
      },
      hashrate5m: totalHashrate5m.toString(),
      unreadNotifications,
      workerSnapshots: latestHashrate.map((item) => ({ ...item, hashrate: item.hashrate.toString() })),
      accounting: { enabled: false, reason: 'Reward settlement, wallet orchestration, and payout remain gated.' },
    };
  }

  async getWorkerSnapshot(workerId: string, userId?: string) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        lastConnectedAt: true,
        lastShareAt: true,
        deviceProfile: true,
        hashrateSnapshots: {
          where: { windowSeconds: 300 },
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!worker) throw new NotFoundException('Worker not found');
    const snapshot = worker.hashrateSnapshots[0];
    return {
      id: worker.id,
      name: worker.name,
      status: worker.status,
      lastConnectedAt: worker.lastConnectedAt,
      lastShareAt: worker.lastShareAt,
      deviceProfile: worker.deviceProfile,
      hashrate5m: snapshot?.hashrate.toString() ?? '0',
      acceptedShares5m: snapshot?.acceptedShares ?? 0,
      rejectedShares5m: snapshot?.rejectedShares ?? 0,
      recordedAt: snapshot?.recordedAt ?? null,
    };
  }
}
