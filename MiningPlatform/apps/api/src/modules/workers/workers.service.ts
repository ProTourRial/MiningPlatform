/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { CreateWorkerDto, UpdateWorkerDto } from './dto/workers.dto';

interface WorkerListRecord {
  id: string;
  name: string;
  status: string;
  miningAccount: { username: string; asset: { symbol: string; algorithm: string } };
  deviceProfile: { declaredType: string | null; detectedType: string; detectionConfidence: string; deviceCount: number } | null;
  credentials: Array<{ id: string }>;
  hashrateSnapshots: Array<{ hashrate: { toString(): string } }>;
  lastConnectedAt: Date | null;
  lastShareAt: Date | null;
  createdAt: Date;
}

interface ShareCountRecord {
  status: string;
  _count: { _all: number };
}

interface HashrateSnapshotRecord {
  windowSeconds: number;
  hashrate: { toString(): string };
  recordedAt: Date;
}

@Injectable()
export class WorkersService {
  constructor(private readonly audit: AuditService) {}

  async list(principal: AuthPrincipal) {
    const workers = await prisma.worker.findMany({
      where: { userId: principal.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        miningAccount: { include: { asset: true } },
        deviceProfile: true,
        hashrateSnapshots: { orderBy: { recordedAt: 'desc' }, take: 5 },
        credentials: { where: { status: 'ACTIVE' }, select: { id: true } },
      },
    });
    return workers.map((worker: WorkerListRecord) => ({
      id: worker.id,
      name: worker.name,
      status: worker.status,
      asset: worker.miningAccount.asset.symbol,
      algorithm: worker.miningAccount.asset.algorithm,
      miningUsername: worker.miningAccount.username,
      hardware: worker.deviceProfile
        ? {
            declaredType: worker.deviceProfile.declaredType,
            detectedType: worker.deviceProfile.detectedType,
            confidence: worker.deviceProfile.detectionConfidence,
            deviceCount: worker.deviceProfile.deviceCount,
          }
        : null,
      activeCredentials: worker.credentials.length,
      latestHashrate: worker.hashrateSnapshots[0]?.hashrate?.toString() ?? '0',
      lastConnectedAt: worker.lastConnectedAt,
      lastShareAt: worker.lastShareAt,
      createdAt: worker.createdAt,
    }));
  }

  async get(principal: AuthPrincipal, workerId: string) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, userId: principal.userId, deletedAt: null },
      include: { miningAccount: { include: { asset: true } }, deviceProfile: true },
    });
    if (!worker) throw new NotFoundException('Worker not found');
    return worker;
  }

  async create(principal: AuthPrincipal, input: CreateWorkerDto) {
    const miningAccount = input.miningAccountId
      ? await prisma.miningAccount.findFirst({ where: { id: input.miningAccountId, userId: principal.userId, enabled: true, deletedAt: null } })
      : await prisma.miningAccount.findFirst({ where: { userId: principal.userId, enabled: true, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    if (!miningAccount) throw new NotFoundException('Active mining account not found');
    const duplicate = await prisma.worker.findFirst({ where: { miningAccountId: miningAccount.id, name: input.name, deletedAt: null } });
    if (duplicate) throw new ConflictException('Worker name already exists for this mining account');
    const worker = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.worker.create({
        data: {
          userId: principal.userId,
          miningAccountId: miningAccount.id,
          name: input.name,
          passwordHash: 'MANAGED_BY_WORKER_CREDENTIALS',
          status: 'PENDING',
        },
      });
      if (input.declaredType) {
        await tx.workerDeviceProfile.create({
          data: {
            workerId: created.id,
            declaredType: input.declaredType,
            detectedType: input.declaredType,
            possibleTypes: [input.declaredType],
            detectionSource: 'USER_DECLARED',
            detectionConfidence: 'MEDIUM',
            deviceCount: 1,
            algorithmCapabilities: [],
          },
        });
      }
      return created;
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'WORKER', action: 'worker.created', resourceType: 'Worker', resourceId: worker.id, sessionId: principal.sessionId, metadata: { name: worker.name, miningAccountId: worker.miningAccountId, declaredType: input.declaredType } });
    return worker;
  }

  async update(principal: AuthPrincipal, workerId: string, input: UpdateWorkerDto) {
    await this.get(principal, workerId);
    const worker = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.worker.update({ where: { id: workerId }, data: { name: input.name, status: input.status } });
      if (input.declaredType) {
        await tx.workerDeviceProfile.upsert({
          where: { workerId },
          create: {
            workerId,
            declaredType: input.declaredType,
            detectedType: input.declaredType,
            possibleTypes: [input.declaredType],
            detectionSource: 'USER_DECLARED',
            detectionConfidence: 'MEDIUM',
            deviceCount: 1,
            algorithmCapabilities: [],
          },
          update: { declaredType: input.declaredType, detectionSource: 'USER_DECLARED', lastDetectedAt: new Date() },
        });
      }
      return updated;
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'WORKER', action: 'worker.updated', resourceType: 'Worker', resourceId: workerId, sessionId: principal.sessionId, metadata: { changedFields: Object.keys(input) } });
    return worker;
  }

  async remove(principal: AuthPrincipal, workerId: string) {
    await this.get(principal, workerId);
    const worker = await prisma.worker.update({ where: { id: workerId }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    await prisma.workerCredential.updateMany({ where: { workerId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await this.audit.record({ actorUserId: principal.userId, category: 'WORKER', action: 'worker.deleted', resourceType: 'Worker', resourceId: workerId, sessionId: principal.sessionId });
    return { deleted: true, workerId: worker.id };
  }

  async statistics(principal: AuthPrincipal, workerId: string) {
    await this.get(principal, workerId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [shares, snapshots] = await Promise.all([
      prisma.share.groupBy({
        by: ['status'],
        where: { workerId, submittedAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.hashrateSnapshot.findMany({ where: { workerId }, orderBy: { recordedAt: 'desc' }, take: 5 }),
    ]);
    return {
      workerId,
      period: '24h',
      shares: Object.fromEntries(shares.map((entry: ShareCountRecord) => [entry.status, entry._count._all])),
      hashrate: snapshots.map((snapshot: HashrateSnapshotRecord) => ({ windowSeconds: snapshot.windowSeconds, hashesPerSecond: snapshot.hashrate.toString(), recordedAt: snapshot.recordedAt })),
    };
  }
}
