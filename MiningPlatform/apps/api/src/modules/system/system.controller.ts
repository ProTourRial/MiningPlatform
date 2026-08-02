/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { prisma } from '@mining/database';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { HealthService } from '../health/health.service';

interface WorkerStatusCountRecord {
  status: string;
  _count: { _all: number };
}

interface WorkerHashrateRecord {
  hashrateSnapshots: Array<{ hashrate: { toString(): string } }>;
}

@ApiTags('system')
@Controller({ path: 'system', version: '1' })
export class SystemController {
  constructor(private readonly health: HealthService) {}

  @Get('configuration')
  getPublicConfiguration() {
    return {
      asset: process.env.MINING_ASSET ?? 'BTC',
      algorithm: process.env.MINING_ALGORITHM ?? 'SHA256',
      rewardMethod: process.env.REWARD_METHOD ?? 'FOLLOW_UPSTREAM',
      platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? 2),
      payoutsEnabled: process.env.PAYOUTS_ENABLED === 'true',
      identityRelease: '0.3.0',
    };
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions('system.read')
  async dashboard(@CurrentPrincipal() principal: AuthPrincipal) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [workersByStatus, workers, pools, recentEvents, readiness] = await Promise.all([
      prisma.worker.groupBy({
        by: ['status'],
        where: { userId: principal.userId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.worker.findMany({
        where: { userId: principal.userId, deletedAt: null },
        select: {
          id: true,
          hashrateSnapshots: { where: { recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' }, take: 1 },
        },
      }),
      prisma.upstreamPool.findMany({
        where: { status: { in: ['OPERATIONAL', 'DEGRADED', 'CIRCUIT_OPEN'] } },
        orderBy: [{ priority: 'asc' }, { weight: 'desc' }],
        select: { poolKey: true, name: true, status: true, lastConnectedAt: true, lastFailureAt: true },
        take: 20,
      }),
      prisma.auditLog.findMany({
        where: { actorUserId: principal.userId },
        orderBy: { occurredAt: 'desc' },
        take: 10,
        select: { id: true, category: true, outcome: true, action: true, resourceType: true, occurredAt: true },
      }),
      this.health.ready(),
    ]);
    const statusMap = Object.fromEntries(workersByStatus.map((row: WorkerStatusCountRecord) => [row.status, row._count._all]));
    const totalHashrate = workers.reduce((sum: bigint, worker: WorkerHashrateRecord) => sum + BigInt(worker.hashrateSnapshots[0]?.hashrate?.toString().split('.')[0] ?? '0'), 0n);
    return {
      workers: {
        total: Object.values(statusMap).reduce((sum, count) => sum + Number(count), 0),
        online: Number(statusMap.ONLINE ?? 0),
        offline: Number(statusMap.OFFLINE ?? 0),
        degraded: Number(statusMap.DEGRADED ?? 0),
        pending: Number(statusMap.PENDING ?? 0),
      },
      hashrate: { hashesPerSecond: totalHashrate.toString(), window: 'latest-per-worker' },
      connectedPools: pools,
      services: {
        api: { status: 'ok' },
        database: readiness.dependencies.postgres,
        redis: readiness.dependencies.redis,
      },
      recentEvents,
      generatedAt: new Date().toISOString(),
    };
  }
}
