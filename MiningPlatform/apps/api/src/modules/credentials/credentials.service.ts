/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';
import { generateWorkerCredential } from '@mining/security';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CredentialsService {
  constructor(private readonly audit: AuditService) {}

  private async ownedWorker(userId: string, workerId: string) {
    const worker = await prisma.worker.findFirst({ where: { id: workerId, userId, deletedAt: null } });
    if (!worker) throw new NotFoundException('Worker not found');
    return worker;
  }

  async list(principal: AuthPrincipal, workerId: string) {
    await this.ownedWorker(principal.userId, workerId);
    return prisma.workerCredential.findMany({
      where: { workerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        credentialId: true,
        status: true,
        failedAttempts: true,
        lockedUntil: true,
        expiresAt: true,
        lastUsedAt: true,
        rotatedAt: true,
        revokedAt: true,
        createdAt: true,
        createdByUserId: true,
      },
    });
  }

  async create(principal: AuthPrincipal, workerId: string, expiresAtRaw?: string) {
    await this.ownedWorker(principal.userId, workerId);
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('Credential expiry must be in the future');
    const activeCount = await prisma.workerCredential.count({ where: { workerId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (activeCount >= 10) throw new BadRequestException('Worker may have at most 10 active credentials');
    const generated = await generateWorkerCredential();
    const credential = await prisma.workerCredential.create({
      data: {
        workerId,
        createdByUserId: principal.userId,
        credentialId: generated.credentialId,
        secretHash: generated.secretHash,
        expiresAt,
      },
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'CREDENTIAL', action: 'worker-credential.created', resourceType: 'WorkerCredential', resourceId: credential.id, sessionId: principal.sessionId, metadata: { workerId, credentialId: credential.credentialId, expiresAt: credential.expiresAt?.toISOString() } });
    return {
      id: credential.id,
      credentialId: credential.credentialId,
      secret: generated.secret,
      workerId,
      expiresAt: credential.expiresAt,
      warning: 'Secret ini hanya ditampilkan sekali. Simpan di password manager atau konfigurasi miner yang aman.',
    };
  }

  async rotate(principal: AuthPrincipal, credentialId: string) {
    const existing = await prisma.workerCredential.findUnique({ where: { credentialId }, include: { worker: true } });
    if (!existing || existing.worker.userId !== principal.userId || existing.worker.deletedAt) throw new NotFoundException('Credential not found');
    if (existing.status !== 'ACTIVE' || (existing.expiresAt && existing.expiresAt <= new Date())) throw new BadRequestException('Only active credentials can be rotated');
    const generated = await generateWorkerCredential();
    const next = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.workerCredential.update({ where: { id: existing.id }, data: { status: 'REVOKED', revokedAt: new Date(), rotatedAt: new Date() } });
      return tx.workerCredential.create({
        data: {
          workerId: existing.workerId,
          createdByUserId: principal.userId,
          credentialId: generated.credentialId,
          secretHash: generated.secretHash,
          expiresAt: existing.expiresAt,
        },
      });
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'CREDENTIAL', action: 'worker-credential.rotated', resourceType: 'WorkerCredential', resourceId: next.id, sessionId: principal.sessionId, metadata: { previousCredentialId: existing.credentialId, credentialId: next.credentialId, workerId: existing.workerId } });
    return {
      id: next.id,
      credentialId: next.credentialId,
      secret: generated.secret,
      previousCredentialId: existing.credentialId,
      warning: 'Credential lama telah dicabut. Secret baru hanya ditampilkan sekali.',
    };
  }

  async revoke(principal: AuthPrincipal, credentialId: string, reason?: string) {
    const existing = await prisma.workerCredential.findUnique({ where: { credentialId }, include: { worker: true } });
    if (!existing || existing.worker.userId !== principal.userId) throw new NotFoundException('Credential not found');
    await prisma.workerCredential.update({ where: { id: existing.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await this.audit.record({ actorUserId: principal.userId, category: 'CREDENTIAL', action: 'worker-credential.revoked', resourceType: 'WorkerCredential', resourceId: existing.id, sessionId: principal.sessionId, metadata: { workerId: existing.workerId, credentialId, reason } });
    return { revoked: true, credentialId };
  }

  async expire(principal: AuthPrincipal, credentialId: string, reason?: string) {
    const existing = await prisma.workerCredential.findUnique({ where: { credentialId }, include: { worker: true } });
    if (!existing || existing.worker.userId !== principal.userId) throw new NotFoundException('Credential not found');
    await prisma.workerCredential.update({ where: { id: existing.id }, data: { status: 'EXPIRED', expiresAt: new Date() } });
    await this.audit.record({ actorUserId: principal.userId, category: 'CREDENTIAL', action: 'worker-credential.expired', resourceType: 'WorkerCredential', resourceId: existing.id, sessionId: principal.sessionId, metadata: { workerId: existing.workerId, credentialId, reason } });
    return { expired: true, credentialId };
  }
}
