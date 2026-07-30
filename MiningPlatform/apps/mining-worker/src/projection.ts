import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus';
import { calculateHashrateWindow } from '@mining/mining-core';
import {
  MiningEvents,
  type MinerSessionAuthorizedPayload,
  type MinerSessionConnectedPayload,
  type MinerSessionDisconnectedPayload,
  type MinerSessionSubscribedPayload,
  type MiningJobReceivedPayload,
  type ShareAcceptedPayload,
  type ShareRejectedPayload,
} from '@mining/shared';

function eventHash(event: DomainEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

function isIdempotencyDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') return false;
  if (!('meta' in error) || typeof error.meta !== 'object' || error.meta === null) return false;
  const target = 'target' in error.meta ? error.meta.target : undefined;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.includes('key') || fields.some((field) => field.includes('IdempotencyRecord_key'));
}

export class MiningProjection {
  constructor(private readonly consumerName = 'mining-worker-v1') {}

  async handle(event: DomainEvent): Promise<void> {
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const idempotencyKey = `${this.consumerName}:${event.eventId}`;
        await tx.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            owner: this.consumerName,
            requestHash: eventHash(event),
            status: 'ACQUIRED',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
          },
        });

        switch (event.eventName) {
          case MiningEvents.sessionConnected:
            await this.sessionConnected(tx, event as DomainEvent<MinerSessionConnectedPayload>);
            break;
          case MiningEvents.sessionSubscribed:
            await this.sessionSubscribed(tx, event as DomainEvent<MinerSessionSubscribedPayload>);
            break;
          case MiningEvents.sessionAuthorized:
            await this.sessionAuthorized(tx, event as DomainEvent<MinerSessionAuthorizedPayload>);
            break;
          case MiningEvents.sessionDisconnected:
            await this.sessionDisconnected(tx, event as DomainEvent<MinerSessionDisconnectedPayload>);
            break;
          case MiningEvents.jobReceived:
            await this.jobReceived(tx, event as DomainEvent<MiningJobReceivedPayload>);
            break;
          case MiningEvents.shareLocalAccepted:
            await this.shareAccepted(tx, event as DomainEvent<ShareAcceptedPayload>);
            break;
          case MiningEvents.shareLocalRejected:
            await this.shareRejected(tx, event as DomainEvent<ShareRejectedPayload>);
            break;
          default:
            break;
        }

        await tx.idempotencyRecord.update({
          where: { key: idempotencyKey },
          data: { status: 'COMPLETED', resultReference: event.aggregateId },
        });
      });
    } catch (error) {
      if (isIdempotencyDuplicate(error)) return;
      throw error;
    }
  }

  private async sessionConnected(tx: Prisma.TransactionClient, event: DomainEvent<MinerSessionConnectedPayload>): Promise<void> {
    const payload = event.payload;
    await tx.minerSession.create({
      data: {
        id: payload.sessionId,
        eventId: event.eventId,
        status: 'CONNECTED',
        remoteIpHash: payload.remoteIpHash,
        connectedAt: new Date(payload.connectedAt),
        lastActivityAt: new Date(payload.connectedAt),
      },
    });
  }

  private async sessionSubscribed(tx: Prisma.TransactionClient, event: DomainEvent<MinerSessionSubscribedPayload>): Promise<void> {
    const payload = event.payload;
    await tx.minerSession.update({
      where: { id: payload.sessionId },
      data: {
        status: 'SUBSCRIBED',
        userAgent: payload.userAgent,
        extranonce1: payload.extranonce1,
        extranonce2Size: payload.extranonce2Size,
        subscribedAt: new Date(payload.subscribedAt),
        lastActivityAt: new Date(payload.subscribedAt),
      },
    });
  }

  private async sessionAuthorized(tx: Prisma.TransactionClient, event: DomainEvent<MinerSessionAuthorizedPayload>): Promise<void> {
    const payload = event.payload;
    await tx.minerSession.update({
      where: { id: payload.sessionId },
      data: {
        workerId: payload.workerId,
        status: 'ACTIVE',
        activeDifficulty: payload.assignedDifficulty,
        authorizedAt: new Date(payload.authorizedAt),
        lastActivityAt: new Date(payload.authorizedAt),
      },
    });
    await tx.difficultyAssignment.create({
      data: {
        sessionId: payload.sessionId,
        workerId: payload.workerId,
        difficulty: payload.assignedDifficulty,
        source: 'STRATUM_STATIC',
        assignedAt: new Date(payload.authorizedAt),
      },
    });
    await tx.worker.update({
      where: { id: payload.workerId },
      data: { status: 'ONLINE', lastConnectedAt: new Date(payload.authorizedAt) },
    });
  }

  private async sessionDisconnected(tx: Prisma.TransactionClient, event: DomainEvent<MinerSessionDisconnectedPayload>): Promise<void> {
    const payload = event.payload;
    await tx.minerSession.update({
      where: { id: payload.sessionId },
      data: {
        status: 'DISCONNECTED',
        disconnectedAt: new Date(payload.disconnectedAt),
        lastActivityAt: new Date(payload.disconnectedAt),
        disconnectReason: payload.reason,
      },
    });
    if (payload.workerId) {
      const activeSessions = await tx.minerSession.count({
        where: { workerId: payload.workerId, status: 'ACTIVE', id: { not: payload.sessionId } },
      });
      if (activeSessions === 0) {
        await tx.worker.update({ where: { id: payload.workerId }, data: { status: 'OFFLINE' } });
      }
    }
  }

  private async jobReceived(tx: Prisma.TransactionClient, event: DomainEvent<MiningJobReceivedPayload>): Promise<void> {
    const payload = event.payload;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: payload.asset } });
    await tx.stratumJob.upsert({
      where: { id: payload.jobId },
      update: {
        status: 'ACTIVE',
        expiresAt: new Date(payload.expiresAt),
      },
      create: {
        id: payload.jobId,
        assetId: asset.id,
        externalJobId: payload.jobId,
        status: 'ACTIVE',
        previousBlockHash: payload.previousBlockHash,
        coinbase1: payload.coinbase1,
        coinbase2: payload.coinbase2,
        merkleBranches: [...payload.merkleBranches],
        version: payload.version,
        networkBits: payload.networkBits,
        networkTime: payload.networkTime,
        cleanJobs: payload.cleanJobs,
        receivedAt: new Date(payload.receivedAt),
        expiresAt: new Date(payload.expiresAt),
      },
    });
  }

  private async shareAccepted(tx: Prisma.TransactionClient, event: DomainEvent<ShareAcceptedPayload>): Promise<void> {
    const payload = event.payload;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: payload.asset } });
    const assignment = await tx.difficultyAssignment.findFirst({
      where: { sessionId: payload.sessionId },
      orderBy: { assignedAt: 'desc' },
    });
    const job = await tx.stratumJob.findUnique({ where: { id: payload.jobId }, select: { id: true, expiresAt: true } });
    const expiresAt = job?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1_000);

    const reservation = await tx.shareFingerprint.create({
      data: {
        fingerprint: payload.fingerprint,
        workerId: payload.workerId,
        stratumJobId: job?.id,
        expiresAt,
      },
    });
    const share = await tx.share.create({
      data: {
        eventId: event.eventId,
        fingerprint: payload.fingerprint,
        workerId: payload.workerId,
        assetId: asset.id,
        sessionId: payload.sessionId,
        stratumJobId: job?.id,
        difficultyAssignmentId: assignment?.id,
        status: 'LOCAL_ACCEPTED',
        assignedDifficulty: payload.assignedDifficulty,
        achievedDifficulty: payload.achievedDifficulty,
        blockCandidate: payload.blockCandidate,
        headerHash: payload.headerHash,
        extranonce2: payload.extranonce2,
        networkTime: payload.networkTime,
        nonce: payload.nonce,
        versionBits: payload.versionBits,
        submittedAt: new Date(payload.submittedAt),
        processedAt: new Date(event.occurredAt),
      },
    });
    await tx.shareFingerprint.update({ where: { id: reservation.id }, data: { shareId: share.id } });
    await tx.worker.update({
      where: { id: payload.workerId },
      data: { status: 'ONLINE', lastShareAt: new Date(payload.submittedAt) },
    });

    const windowStart = new Date(new Date(payload.submittedAt).getTime() - 5 * 60 * 1_000);
    const recentShares = await tx.share.findMany({
      where: {
        workerId: payload.workerId,
        status: { in: ['LOCAL_ACCEPTED', 'UPSTREAM_PENDING', 'UPSTREAM_ACCEPTED'] },
        submittedAt: { gt: windowStart, lte: new Date(payload.submittedAt) },
      },
      select: { assignedDifficulty: true, submittedAt: true },
    });
    const hashrate = calculateHashrateWindow(
      recentShares.map((item: { assignedDifficulty: { toString(): string }; submittedAt: Date }) => ({
        difficulty: item.assignedDifficulty.toString(),
        acceptedAt: item.submittedAt,
      })),
      300,
      new Date(payload.submittedAt),
    );
    await tx.hashrateSnapshot.create({
      data: {
        workerId: payload.workerId,
        windowSeconds: 300,
        hashrate: hashrate.hashesPerSecond,
        acceptedShares: hashrate.shareCount,
        rejectedShares: 0,
        invalidShares: 0,
        recordedAt: new Date(payload.submittedAt),
      },
    });
  }

  private async shareRejected(tx: Prisma.TransactionClient, event: DomainEvent<ShareRejectedPayload>): Promise<void> {
    const payload = event.payload;
    if (!payload.workerId) return;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: payload.asset } });
    const session = await tx.minerSession.findUniqueOrThrow({ where: { id: payload.sessionId } });
    const job = payload.jobId
      ? await tx.stratumJob.findUnique({ where: { id: payload.jobId }, select: { id: true, expiresAt: true } })
      : null;
    const fingerprint = payload.fingerprint ?? event.aggregateId;
    const reservation = await tx.shareFingerprint.create({
      data: {
        fingerprint,
        workerId: payload.workerId,
        stratumJobId: job?.id,
        expiresAt: job?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1_000),
      },
    });
    const share = await tx.share.create({
      data: {
        eventId: event.eventId,
        fingerprint,
        workerId: payload.workerId,
        assetId: asset.id,
        sessionId: payload.sessionId,
        stratumJobId: job?.id,
        status: 'LOCAL_REJECTED',
        rejectionCode: payload.code,
        rejectionReason: payload.safeReason,
        assignedDifficulty: session.activeDifficulty?.toString() ?? '0.000001',
        extranonce2: payload.extranonce2 ?? '',
        networkTime: payload.networkTime ?? '',
        nonce: payload.nonce ?? '',
        versionBits: payload.versionBits,
        submittedAt: new Date(payload.submittedAt),
        processedAt: new Date(event.occurredAt),
      },
    });
    await tx.shareFingerprint.update({ where: { id: reservation.id }, data: { shareId: share.id } });
  }
}
