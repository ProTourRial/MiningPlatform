/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';
import { generateWorkerCredential } from '@mining/security';
import type { CreateWorkerDto, UpdateWorkerDto } from './workers.dto.js';

@Injectable()
export class WorkersService {
  async list(userId: string) {
    const workers = await prisma.worker.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        agentEnabled: true,
        lastConnectedAt: true,
        lastShareAt: true,
        createdAt: true,
        miningAccount: { select: { id: true, username: true, asset: { select: { symbol: true, algorithm: true } } } },
        deviceProfile: true,
        hashrateSnapshots: { where: { windowSeconds: 300 }, orderBy: { recordedAt: 'desc' }, take: 1 },
        _count: { select: { credentials: true, shares: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return workers.map((worker) => ({
      ...worker,
      connectionUsername: `${worker.miningAccount.username}.${worker.name}`,
      hashrate5m: worker.hashrateSnapshots[0]?.hashrate.toString() ?? '0',
      hashrateSnapshots: undefined,
    }));
  }

  async get(userId: string, workerId: string) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, userId, deletedAt: null },
      include: {
        miningAccount: { include: { asset: true } },
        deviceProfile: true,
        credentials: {
          select: { id: true, credentialId: true, status: true, expiresAt: true, lastUsedAt: true, rotatedAt: true, revokedAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!worker) throw new NotFoundException('Worker not found');
    const { passwordHash: _hidden, ...safeWorker } = worker;
    return { ...safeWorker, connectionUsername: `${worker.miningAccount.username}.${worker.name}` };
  }

  async create(userId: string, dto: CreateWorkerDto) {
    const account = await prisma.miningAccount.findFirst({
      where: { id: dto.miningAccountId, userId, enabled: true, deletedAt: null },
      include: { asset: { select: { symbol: true, algorithm: true } } },
    });
    if (!account) throw new NotFoundException('Enabled mining account not found');
    const existing = await prisma.worker.findFirst({
      where: { miningAccountId: account.id, name: dto.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Worker name already exists in this mining account');

    const credential = await generateWorkerCredential();
    const worker = await prisma.$transaction(async (tx) => {
      const created = await tx.worker.create({
        data: {
          userId,
          miningAccountId: account.id,
          name: dto.name,
          passwordHash: 'WORKER_CREDENTIAL_V1',
          status: 'OFFLINE',
          deviceProfile: dto.declaredHardwareType
            ? { create: { declaredType: dto.declaredHardwareType, detectionSource: 'USER_DECLARED' } }
            : undefined,
          credentials: {
            create: {
              credentialId: credential.credentialId,
              secretHash: credential.secretHash,
            },
          },
        },
        select: { id: true, name: true, status: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'WORKER_CREATED',
          resourceType: 'Worker',
          resourceId: created.id,
          metadata: { credentialId: credential.credentialId },
        },
      });
      return created;
    });
    return {
      worker,
      connection: {
        username: `${account.username}.${worker.name}`,
        password: credential.secret,
        credentialId: credential.credentialId,
        asset: account.asset.symbol,
        algorithm: account.asset.algorithm,
      },
      warning: 'The worker password is shown only once. Store it in a secret manager.',
    };
  }

  async update(userId: string, workerId: string, dto: UpdateWorkerDto) {
    const worker = await prisma.worker.findFirst({ where: { id: workerId, userId, deletedAt: null } });
    if (!worker) throw new NotFoundException('Worker not found');
    if (dto.name && dto.name !== worker.name) {
      const duplicate = await prisma.worker.findFirst({
        where: {
          miningAccountId: worker.miningAccountId,
          name: dto.name,
          deletedAt: null,
          id: { not: worker.id },
        },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Worker name already exists in this mining account');
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.worker.update({
          where: { id: worker.id },
          data: {
            name: dto.name,
            agentEnabled: dto.agentEnabled,
            status: dto.disabled === undefined ? undefined : dto.disabled ? 'DISABLED' : 'OFFLINE',
            deviceProfile: dto.declaredHardwareType
              ? {
                  upsert: {
                    create: { declaredType: dto.declaredHardwareType, detectionSource: 'USER_DECLARED' },
                    update: { declaredType: dto.declaredHardwareType },
                  },
                }
              : undefined,
          },
        });
        await tx.auditLog.create({
          data: { actorUserId: userId, action: 'WORKER_UPDATED', resourceType: 'Worker', resourceId: worker.id, metadata: JSON.parse(JSON.stringify(dto)) },
        });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Worker name already exists in this mining account');
      }
      throw error;
    }
    return this.get(userId, worker.id);
  }

  async remove(userId: string, workerId: string) {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.worker.updateMany({
        where: { id: workerId, userId, deletedAt: null },
        data: { deletedAt: now, status: 'DISABLED' },
      });
      if (changed.count > 0) {
        await tx.workerCredential.updateMany({
          where: { workerId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: now },
        });
        await tx.auditLog.create({ data: { actorUserId: userId, action: 'WORKER_DELETED', resourceType: 'Worker', resourceId: workerId } });
      }
      return changed.count;
    });
    if (result === 0) throw new NotFoundException('Worker not found');
    return { deleted: true };
  }

  async credentials(userId: string, workerId: string) {
    await this.assertOwned(userId, workerId);
    return prisma.workerCredential.findMany({
      where: { workerId },
      select: { id: true, credentialId: true, status: true, failedAttempts: true, lockedUntil: true, expiresAt: true, lastUsedAt: true, rotatedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rotateCredential(userId: string, workerId: string) {
    const worker = await this.assertOwned(userId, workerId);
    const credential = await generateWorkerCredential();
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.workerCredential.updateMany({
        where: { workerId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, rotatedAt: now },
      });
      await tx.workerCredential.create({
        data: { workerId, credentialId: credential.credentialId, secretHash: credential.secretHash },
      });
      await tx.auditLog.create({
        data: { actorUserId: userId, action: 'WORKER_CREDENTIAL_ROTATED', resourceType: 'Worker', resourceId: workerId, metadata: { credentialId: credential.credentialId } },
      });
    });
    return {
      connectionUsername: `${worker.miningAccount.username}.${worker.name}`,
      password: credential.secret,
      credentialId: credential.credentialId,
      warning: 'The worker password is shown only once.',
    };
  }

  async revokeCredential(userId: string, workerId: string, credentialId: string) {
    await this.assertOwned(userId, workerId);
    const revoked = await prisma.$transaction(async (tx) => {
      const result = await tx.workerCredential.updateMany({
        where: { workerId, credentialId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      if (result.count === 0) return false;
      await tx.auditLog.create({
        data: { actorUserId: userId, action: 'WORKER_CREDENTIAL_REVOKED', resourceType: 'Worker', resourceId: workerId, metadata: { credentialId } },
      });
      return true;
    });
    if (!revoked) throw new NotFoundException('Active credential not found');
    return { revoked: true };
  }

  private async assertOwned(userId: string, workerId: string) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, userId, deletedAt: null },
      include: { miningAccount: { select: { username: true } } },
    });
    if (!worker) throw new NotFoundException('Worker not found');
    return worker;
  }
}
