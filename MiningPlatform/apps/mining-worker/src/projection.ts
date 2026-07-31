/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus';
import { addDecimalStrings, calculateHashrateFromAccumulatedDifficulty, transitionShareState } from '@mining/mining-core';
import {
  MiningEvents,
  type MinerSessionAuthorizedPayload,
  type MinerSessionConnectedPayload,
  type MinerSessionDisconnectedPayload,
  type MinerSessionSubscribedPayload,
  type MiningJobReceivedPayload,
  type ShareAcceptedPayload,
  type ShareRejectedPayload,
  type ShareUpstreamDecisionPayload,
  type ShareUpstreamPendingPayload,
  type WorkerDeviceDetectedPayload,
} from '@mining/shared';
import { PrismaTransactionalIdempotencyService } from './prisma-idempotency.js';
import { assertSupportedMiningEvent } from './supported-events.js';

const HASHRATE_BUCKET_SECONDS = 60;
const HASHRATE_WINDOWS = [60, 300, 900, 3_600, 86_400] as const;

export type ProjectionResult =
  | { processed: true }
  | { processed: false; reason: 'DUPLICATE' };

function eventHash(event: DomainEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

function bucketStart(at: Date): Date {
  return new Date(Math.floor(at.getTime() / (HASHRATE_BUCKET_SECONDS * 1_000)) * HASHRATE_BUCKET_SECONDS * 1_000);
}

function isInvalidRejection(code: ShareRejectedPayload['code']): boolean {
  return ['MALFORMED', 'UNAUTHORIZED', 'LOW_DIFFICULTY', 'INVALID_TIME', 'INVALID_VERSION'].includes(code);
}

export class MiningProjection {
  private readonly idempotency = new PrismaTransactionalIdempotencyService();

  constructor(private readonly consumerName = 'mining-worker-v1') {}

  async handle(event: DomainEvent): Promise<ProjectionResult> {
    assertSupportedMiningEvent(event.eventName, event.eventVersion);

    return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<ProjectionResult> => {
      const idempotencyKey = `${this.consumerName}:${event.eventId}`;
      const acquired = await this.idempotency.acquire(tx, {
        key: idempotencyKey,
        owner: this.consumerName,
        requestHash: eventHash(event),
        ttlMs: 30 * 24 * 60 * 60 * 1_000,
      });

      if (!acquired.acquired) {
        if (acquired.reason === 'COMPLETED') return { processed: false, reason: 'DUPLICATE' };
        if (acquired.reason === 'CONFLICT') throw new Error(`Idempotency payload conflict: ${idempotencyKey}`);
        throw new Error(`Idempotency record is still in progress: ${idempotencyKey}`);
      }

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
        case MiningEvents.workerDeviceDetected:
          await this.workerDeviceDetected(tx, event as DomainEvent<WorkerDeviceDetectedPayload>);
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
        case MiningEvents.shareUpstreamPending:
          await this.shareUpstreamPending(tx, event as DomainEvent<ShareUpstreamPendingPayload>);
          break;
        case MiningEvents.shareUpstreamAccepted:
        case MiningEvents.shareUpstreamRejected:
          await this.shareUpstreamDecision(tx, event as DomainEvent<ShareUpstreamDecisionPayload>);
          break;
      }

      await this.idempotency.complete(tx, {
        key: idempotencyKey,
        owner: this.consumerName,
        resultReference: event.aggregateId,
      });
      return { processed: true };
    });
  }

  private async sessionConnected(
    tx: Prisma.TransactionClient,
    event: DomainEvent<MinerSessionConnectedPayload>,
  ): Promise<void> {
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

  private async sessionSubscribed(
    tx: Prisma.TransactionClient,
    event: DomainEvent<MinerSessionSubscribedPayload>,
  ): Promise<void> {
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

  private async sessionAuthorized(
    tx: Prisma.TransactionClient,
    event: DomainEvent<MinerSessionAuthorizedPayload>,
  ): Promise<void> {
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
      where: { id: payload.workerId, deletedAt: null },
      data: { status: 'ONLINE', lastConnectedAt: new Date(payload.authorizedAt) },
    });
  }

  private async sessionDisconnected(
    tx: Prisma.TransactionClient,
    event: DomainEvent<MinerSessionDisconnectedPayload>,
  ): Promise<void> {
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
        await tx.worker.update({
          where: { id: payload.workerId, deletedAt: null },
          data: { status: 'OFFLINE' },
        });
      }
    }
  }


  private async workerDeviceDetected(
    tx: Prisma.TransactionClient,
    event: DomainEvent<WorkerDeviceDetectedPayload>,
  ): Promise<void> {
    const payload = event.payload;
    const workerDeviceProfile = (tx as unknown as {
      workerDeviceProfile: { upsert(args: unknown): Promise<unknown> };
    }).workerDeviceProfile;
    await workerDeviceProfile.upsert({
      where: { workerId: payload.workerId },
      update: {
        detectedType: payload.detectedType,
        possibleTypes: [...payload.possibleTypes],
        detectionSource: payload.detectionSource,
        detectionConfidence: payload.confidence,
        minerSoftware: payload.minerSoftware,
        softwareVersion: payload.softwareVersion,
        vendor: payload.vendor,
        model: payload.model,
        architecture: payload.architecture,
        operatingSystem: payload.operatingSystem,
        deviceCount: payload.deviceCount,
        algorithmCapabilities: [...payload.algorithmCapabilities],
        evidence: [...payload.evidence],
        lastDetectedAt: new Date(payload.detectedAt),
      },
      create: {
        workerId: payload.workerId,
        detectedType: payload.detectedType,
        possibleTypes: [...payload.possibleTypes],
        detectionSource: payload.detectionSource,
        detectionConfidence: payload.confidence,
        minerSoftware: payload.minerSoftware,
        softwareVersion: payload.softwareVersion,
        vendor: payload.vendor,
        model: payload.model,
        architecture: payload.architecture,
        operatingSystem: payload.operatingSystem,
        deviceCount: payload.deviceCount,
        algorithmCapabilities: [...payload.algorithmCapabilities],
        evidence: [...payload.evidence],
        firstDetectedAt: new Date(payload.detectedAt),
        lastDetectedAt: new Date(payload.detectedAt),
      },
    });
  }

  private async jobReceived(
    tx: Prisma.TransactionClient,
    event: DomainEvent<MiningJobReceivedPayload>,
  ): Promise<void> {
    const payload = event.payload;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: payload.asset } });
    await tx.stratumJob.upsert({
      where: { id: payload.jobId },
      update: { status: 'ACTIVE', expiresAt: new Date(payload.expiresAt) },
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

  private async shareAccepted(
    tx: Prisma.TransactionClient,
    event: DomainEvent<ShareAcceptedPayload>,
  ): Promise<void> {
    const payload = event.payload;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: payload.asset } });
    const assignment = await tx.difficultyAssignment.findFirst({
      where: { sessionId: payload.sessionId },
      orderBy: { assignedAt: 'desc' },
    });
    const job = await tx.stratumJob.findUnique({
      where: { id: payload.jobId },
      select: { id: true, expiresAt: true },
    });
    const expiresAt = job?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1_000);
    let state = transitionShareState('RECEIVED', 'VALIDATING');
    state = transitionShareState(state, 'LOCAL_ACCEPTED');

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
        status: state,
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
      where: { id: payload.workerId, deletedAt: null },
      data: { status: 'ONLINE', lastShareAt: new Date(payload.submittedAt) },
    });

    if (!payload.upstreamRequired) {
      await this.updateHashrateBuckets(tx, {
        workerId: payload.workerId,
        submittedAt: new Date(payload.submittedAt),
        acceptedDifficulty: payload.assignedDifficulty,
        rejected: false,
        invalid: false,
      });
    }
  }

  private async shareRejected(
    tx: Prisma.TransactionClient,
    event: DomainEvent<ShareRejectedPayload>,
  ): Promise<void> {
    const payload = event.payload;
    if (!payload.workerId) return;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: payload.asset } });
    const session = await tx.minerSession.findUniqueOrThrow({ where: { id: payload.sessionId } });
    const job = payload.jobId
      ? await tx.stratumJob.findUnique({ where: { id: payload.jobId }, select: { id: true, expiresAt: true } })
      : null;
    if (payload.code === 'DUPLICATE') {
      await this.updateHashrateBuckets(tx, {
        workerId: payload.workerId,
        submittedAt: new Date(payload.submittedAt),
        acceptedDifficulty: '0',
        rejected: true,
        invalid: false,
      });
      return;
    }

    const fingerprint = payload.fingerprint ?? event.aggregateId;
    let state = transitionShareState('RECEIVED', 'VALIDATING');
    state = transitionShareState(state, 'LOCAL_REJECTED');

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
        status: state,
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

    await this.updateHashrateBuckets(tx, {
      workerId: payload.workerId,
      submittedAt: new Date(payload.submittedAt),
      acceptedDifficulty: '0',
      rejected: true,
      invalid: isInvalidRejection(payload.code),
    });
  }

  private async shareUpstreamPending(
    tx: Prisma.TransactionClient,
    event: DomainEvent<ShareUpstreamPendingPayload>,
  ): Promise<void> {
    const payload = event.payload;
    const share = await tx.share.findUniqueOrThrow({ where: { fingerprint: payload.fingerprint } });
    const state = transitionShareState(share.status, 'UPSTREAM_PENDING');
    await tx.share.update({
      where: { id: share.id },
      data: {
        status: state,
        upstreamSubmittedAt: new Date(event.occurredAt),
      },
    });
  }

  private async shareUpstreamDecision(
    tx: Prisma.TransactionClient,
    event: DomainEvent<ShareUpstreamDecisionPayload>,
  ): Promise<void> {
    const payload = event.payload;
    const share = await tx.share.findUniqueOrThrow({ where: { fingerprint: payload.fingerprint } });
    const next = payload.upstreamAccepted ? 'UPSTREAM_ACCEPTED' : 'UPSTREAM_REJECTED';
    const state = transitionShareState(share.status, next);
    await tx.share.update({
      where: { id: share.id },
      data: {
        status: state,
        upstreamAccepted: payload.upstreamAccepted,
        upstreamReason: payload.errorMessage,
        upstreamRespondedAt: new Date(payload.decidedAt),
      },
    });
    await this.updateHashrateBuckets(tx, {
      workerId: payload.workerId,
      submittedAt: new Date(payload.submittedAt),
      acceptedDifficulty: payload.upstreamAccepted ? share.assignedDifficulty.toString() : '0',
      rejected: !payload.upstreamAccepted,
      invalid: false,
    });
  }

  private async updateHashrateBuckets(
    tx: Prisma.TransactionClient,
    input: {
      workerId: string;
      submittedAt: Date;
      acceptedDifficulty: string;
      rejected: boolean;
      invalid: boolean;
    },
  ): Promise<void> {
    const currentBucket = bucketStart(input.submittedAt);
    await tx.hashrateBucket.upsert({
      where: {
        workerId_bucketStart_bucketSeconds: {
          workerId: input.workerId,
          bucketStart: currentBucket,
          bucketSeconds: HASHRATE_BUCKET_SECONDS,
        },
      },
      update: {
        acceptedDifficultySum: { increment: input.acceptedDifficulty },
        acceptedCount: { increment: input.acceptedDifficulty === '0' ? 0 : 1 },
        rejectedCount: { increment: input.rejected ? 1 : 0 },
        invalidCount: { increment: input.invalid ? 1 : 0 },
      },
      create: {
        workerId: input.workerId,
        bucketStart: currentBucket,
        bucketSeconds: HASHRATE_BUCKET_SECONDS,
        acceptedDifficultySum: input.acceptedDifficulty,
        acceptedCount: input.acceptedDifficulty === '0' ? 0 : 1,
        rejectedCount: input.rejected ? 1 : 0,
        invalidCount: input.invalid ? 1 : 0,
      },
    });

    const oldestStart = new Date(input.submittedAt.getTime() - Math.max(...HASHRATE_WINDOWS) * 1_000);
    const buckets = await tx.hashrateBucket.findMany({
      where: {
        workerId: input.workerId,
        bucketSeconds: HASHRATE_BUCKET_SECONDS,
        bucketStart: { gt: oldestStart, lte: currentBucket },
      },
      orderBy: { bucketStart: 'asc' },
    });

    for (const windowSeconds of HASHRATE_WINDOWS) {
      const windowStart = input.submittedAt.getTime() - windowSeconds * 1_000;
      const included = buckets.filter((bucket) => bucket.bucketStart.getTime() > windowStart);
      const accumulatedDifficulty = included.length === 0
        ? '0'
        : addDecimalStrings(included.map((bucket) => bucket.acceptedDifficultySum.toString()), 12);
      const acceptedShares = included.reduce((sum, bucket) => sum + bucket.acceptedCount, 0);
      const rejectedShares = included.reduce((sum, bucket) => sum + bucket.rejectedCount, 0);
      const invalidShares = included.reduce((sum, bucket) => sum + bucket.invalidCount, 0);
      const result = calculateHashrateFromAccumulatedDifficulty(
        accumulatedDifficulty,
        acceptedShares,
        windowSeconds,
      );
      await tx.hashrateSnapshot.upsert({
        where: {
          workerId_windowSeconds_bucketStart: {
            workerId: input.workerId,
            windowSeconds,
            bucketStart: currentBucket,
          },
        },
        update: {
          hashrate: result.hashesPerSecond,
          acceptedShares,
          rejectedShares,
          invalidShares,
          recordedAt: input.submittedAt,
        },
        create: {
          workerId: input.workerId,
          windowSeconds,
          bucketStart: currentBucket,
          hashrate: result.hashesPerSecond,
          acceptedShares,
          rejectedShares,
          invalidShares,
          recordedAt: input.submittedAt,
        },
      });
    }
  }
}
