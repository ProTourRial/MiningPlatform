/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  prisma,
  type Prisma,
  type RandomXShareSubmissionIntent as StoredRandomXShareSubmissionIntent,
  type RandomXUpstreamJobEvidence as StoredRandomXUpstreamJobEvidence,
  type RandomXUpstreamShareDecision as StoredRandomXUpstreamShareDecision,
} from '@mining/database';
import {
  createRandomXAcceptedShareEvent,
  projectRandomXSubmissionIntent,
  type RandomXAccountingProjectionInput,
  type RandomXShareSubmissionIntentProjection,
  type RandomXSubmissionIntentProjectionInput,
  type RandomXUpstreamJobEvidenceProjection,
} from '@mining/randomx';

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function sameDate(stored: Date, projected: string): boolean {
  return stored.toISOString() === projected;
}

function assertJobEquivalent(
  stored: StoredRandomXUpstreamJobEvidence,
  projected: RandomXUpstreamJobEvidenceProjection,
): void {
  if (
    stored.sourceDigest !== projected.sourceDigest ||
    stored.algorithm !== projected.algorithm ||
    stored.assetId !== projected.assetId ||
    stored.upstreamPoolId !== projected.upstreamPoolId ||
    stored.upstreamSessionId !== projected.upstreamSessionId ||
    stored.upstreamJobId !== projected.upstreamJobId ||
    stored.upstreamClientId !== projected.upstreamClientId ||
    stored.jobBlob !== projected.jobBlob ||
    stored.seedHash !== projected.seedHash ||
    stored.targetHex !== projected.targetHex ||
    stored.height.toFixed(0) !== projected.height ||
    !sameDate(stored.receivedAt, projected.receivedAt) ||
    !sameDate(stored.expiresAt, projected.expiresAt)
  ) {
    throw new Error('RandomX upstream job evidence idempotency conflict');
  }
}

function assertIntentEquivalent(
  stored: StoredRandomXShareSubmissionIntent,
  projected: RandomXShareSubmissionIntentProjection,
  jobEvidenceId: string,
): void {
  if (
    stored.idempotencyKey !== projected.idempotencyKey ||
    stored.sourceDigest !== projected.sourceDigest ||
    stored.shareFingerprint !== projected.shareFingerprint ||
    stored.jobEvidenceId !== jobEvidenceId ||
    stored.miningAccountId !== projected.miningAccountId ||
    stored.assetId !== projected.assetId ||
    stored.upstreamPoolId !== projected.upstreamPoolId ||
    stored.workerName !== projected.workerName ||
    stored.nonce !== projected.nonce ||
    stored.submittedResult !== projected.submittedResult ||
    stored.computedResult !== projected.computedResult ||
    stored.localTarget.toFixed(0) !== projected.localTarget ||
    stored.acceptedDifficulty.toString() !== projected.acceptedDifficulty ||
    !sameDate(stored.submittedAt, projected.submittedAt) ||
    stored.correlationId !== projected.correlationId ||
    stored.validationDigest !== projected.validationDigest
  ) {
    throw new Error('RandomX submission intent idempotency conflict');
  }
}

function jobData(projected: RandomXUpstreamJobEvidenceProjection) {
  return {
    sourceDigest: projected.sourceDigest,
    algorithm: projected.algorithm,
    assetId: projected.assetId,
    upstreamPoolId: projected.upstreamPoolId,
    upstreamSessionId: projected.upstreamSessionId,
    upstreamJobId: projected.upstreamJobId,
    upstreamClientId: projected.upstreamClientId,
    jobBlob: projected.jobBlob,
    seedHash: projected.seedHash,
    targetHex: projected.targetHex,
    height: projected.height,
    receivedAt: new Date(projected.receivedAt),
    expiresAt: new Date(projected.expiresAt),
  } as const;
}

function intentData(projected: RandomXShareSubmissionIntentProjection, jobEvidenceId: string) {
  return {
    idempotencyKey: projected.idempotencyKey,
    sourceDigest: projected.sourceDigest,
    shareFingerprint: projected.shareFingerprint,
    jobEvidenceId,
    miningAccountId: projected.miningAccountId,
    assetId: projected.assetId,
    upstreamPoolId: projected.upstreamPoolId,
    workerName: projected.workerName,
    nonce: projected.nonce,
    submittedResult: projected.submittedResult,
    computedResult: projected.computedResult,
    localTarget: projected.localTarget,
    acceptedDifficulty: projected.acceptedDifficulty,
    submittedAt: new Date(projected.submittedAt),
    correlationId: projected.correlationId,
    validationDigest: projected.validationDigest,
  } as const;
}

async function advisoryLock(transaction: Prisma.TransactionClient, key: string): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export type PreparedRandomXSubmission = {
  job: StoredRandomXUpstreamJobEvidence;
  intent: StoredRandomXShareSubmissionIntent;
  created: boolean;
  projection: RandomXShareSubmissionIntentProjection;
};

export type RecordRandomXDecisionInput = {
  decisionId: string;
  eventId?: string;
  submissionIntentId: string;
  accepted: boolean;
  errorCode?: number;
  errorMessage?: string;
  sourceDigest: string;
  decidedAt: Date;
  accounting?: RandomXAccountingProjectionInput;
};

export type RecordedRandomXDecision = {
  decision: StoredRandomXUpstreamShareDecision;
  outboxEventId: string | null;
  created: boolean;
};

export class RandomXSubmissionRepository {
  async currentDatabaseTime(): Promise<Date> {
    const rows = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS "now"
    `;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error('RandomX database time is unavailable');
    }
    return now;
  }

  async recordPreparedSubmission(
    input: RandomXSubmissionIntentProjectionInput,
  ): Promise<PreparedRandomXSubmission> {
    const projected = projectRandomXSubmissionIntent(input);
    return prisma.$transaction(async (transaction) => {
      await advisoryLock(
        transaction,
        `randomx-job:${projected.job.upstreamPoolId}:${projected.job.upstreamSessionId}:${projected.job.upstreamJobId}`,
      );
      await advisoryLock(transaction, `randomx-share:${projected.shareFingerprint}`);

      let job = await transaction.randomXUpstreamJobEvidence.findFirst({
        where: {
          OR: [
            { sourceDigest: projected.job.sourceDigest },
            {
              upstreamPoolId: projected.job.upstreamPoolId,
              upstreamSessionId: projected.job.upstreamSessionId,
              upstreamJobId: projected.job.upstreamJobId,
            },
          ],
        },
      });
      if (job) {
        assertJobEquivalent(job, projected.job);
      } else {
        job = await transaction.randomXUpstreamJobEvidence.create({ data: jobData(projected.job) });
      }

      const existing = await transaction.randomXShareSubmissionIntent.findFirst({
        where: {
          OR: [
            { idempotencyKey: projected.idempotencyKey },
            { sourceDigest: projected.sourceDigest },
            { shareFingerprint: projected.shareFingerprint },
          ],
        },
      });
      if (existing) {
        assertIntentEquivalent(existing, projected, job.id);
        return { job, intent: existing, created: false, projection: projected };
      }

      const intent = await transaction.randomXShareSubmissionIntent.create({
        data: intentData(projected, job.id),
      });
      return { job, intent, created: true, projection: projected };
    });
  }

  async findDecisionByIntent(
    submissionIntentId: string,
  ): Promise<StoredRandomXUpstreamShareDecision | null> {
    return prisma.randomXUpstreamShareDecision.findUnique({ where: { submissionIntentId } });
  }

  async recordDecision(input: RecordRandomXDecisionInput): Promise<RecordedRandomXDecision> {
    if (!HASH_PATTERN.test(input.sourceDigest)) {
      throw new Error('RandomX upstream decision source digest is invalid');
    }
    if (!(input.decidedAt instanceof Date) || Number.isNaN(input.decidedAt.getTime())) {
      throw new Error('RandomX upstream decision time is invalid');
    }
    if (!input.decisionId || input.decisionId.length > 256) {
      throw new Error('RandomX upstream decision id is invalid');
    }
    const errorCode = input.accepted ? null : input.errorCode ?? null;
    if (
      errorCode !== null &&
      (!Number.isSafeInteger(errorCode) || errorCode < -2_147_483_648 || errorCode > 2_147_483_647)
    ) {
      throw new Error('RandomX upstream decision error code is invalid');
    }
    const errorMessage = input.accepted
      ? null
      : (input.errorMessage?.trim() || 'RandomX upstream rejected share').slice(0, 512);
    if (input.accepted && (!input.accounting || !input.eventId)) {
      throw new Error('RandomX accepted decision requires accounting input and event id');
    }
    if (!input.accepted && (input.accounting || input.eventId)) {
      throw new Error('RandomX rejected decision cannot create an accepted event');
    }

    const acceptedEvent = input.accepted
      ? createRandomXAcceptedShareEvent({
          eventId: input.eventId!,
          causationId: input.decisionId,
          accounting: input.accounting!,
        })
      : undefined;
    if (
      acceptedEvent &&
      (acceptedEvent.payload.upstreamDecisionDigest !== input.sourceDigest ||
        acceptedEvent.occurredAt !== input.decidedAt.toISOString())
    ) {
      throw new Error('RandomX accepted event does not match the upstream decision');
    }

    return prisma.$transaction(async (transaction) => {
      await advisoryLock(transaction, `randomx-intent-decision:${input.submissionIntentId}`);
      const intent = await transaction.randomXShareSubmissionIntent.findUnique({
        where: { id: input.submissionIntentId },
        include: { jobEvidence: true, decision: { include: { outboxEvent: true } } },
      });
      if (!intent) throw new Error('RandomX submission intent does not exist');

      const existing = intent.decision;
      if (existing) {
        if (
          existing.id !== input.decisionId ||
          existing.accepted !== input.accepted ||
          existing.errorCode !== errorCode ||
          existing.errorMessage !== errorMessage ||
          existing.sourceDigest !== input.sourceDigest ||
          existing.decidedAt.getTime() !== input.decidedAt.getTime() ||
          (acceptedEvent && existing.outboxEvent?.eventId !== acceptedEvent.eventId)
        ) {
          throw new Error('RandomX upstream decision idempotency conflict');
        }
        return { decision: existing, outboxEventId: existing.outboxEventId, created: false };
      }

      if (
        acceptedEvent &&
        (acceptedEvent.payload.localFingerprint !== intent.shareFingerprint ||
          acceptedEvent.payload.miningAccountId !== intent.miningAccountId ||
          acceptedEvent.payload.assetId !== intent.assetId ||
          acceptedEvent.payload.upstreamPoolId !== intent.upstreamPoolId ||
          acceptedEvent.payload.upstreamSessionId !== intent.jobEvidence.upstreamSessionId ||
          acceptedEvent.payload.upstreamJobId !== intent.jobEvidence.upstreamJobId ||
          acceptedEvent.payload.upstreamClientId !== intent.jobEvidence.upstreamClientId ||
          acceptedEvent.payload.workerName !== intent.workerName ||
          acceptedEvent.payload.jobBlob !== intent.jobEvidence.jobBlob ||
          acceptedEvent.payload.seedHash !== intent.jobEvidence.seedHash ||
          acceptedEvent.payload.targetHex !== intent.jobEvidence.targetHex ||
          acceptedEvent.payload.jobHeight !== intent.jobEvidence.height.toFixed(0) ||
          acceptedEvent.payload.jobReceivedAt !== intent.jobEvidence.receivedAt.toISOString() ||
          acceptedEvent.payload.jobExpiresAt !== intent.jobEvidence.expiresAt.toISOString() ||
          acceptedEvent.payload.nonce !== intent.nonce ||
          acceptedEvent.payload.submittedResult !== intent.submittedResult ||
          acceptedEvent.payload.computedResult !== intent.computedResult ||
          acceptedEvent.payload.localTarget !== intent.localTarget.toFixed(0) ||
          acceptedEvent.payload.acceptedDifficulty !== intent.acceptedDifficulty.toString() ||
          acceptedEvent.payload.submittedAt !== intent.submittedAt.toISOString() ||
          acceptedEvent.correlationId !== intent.correlationId)
      ) {
        throw new Error('RandomX accepted event does not match the durable submission intent');
      }

      let outboxEventId: string | null = null;
      if (acceptedEvent) {
        const payload = JSON.parse(JSON.stringify(acceptedEvent.payload)) as Prisma.InputJsonValue;
        const outbox = await transaction.outboxEvent.create({
          data: {
            eventId: acceptedEvent.eventId,
            eventName: acceptedEvent.eventName,
            eventVersion: acceptedEvent.eventVersion,
            producer: acceptedEvent.producer,
            aggregateType: acceptedEvent.aggregateType,
            aggregateId: acceptedEvent.aggregateId,
            correlationId: acceptedEvent.correlationId,
            causationId: acceptedEvent.causationId,
            idempotencyKey: acceptedEvent.idempotencyKey,
            payload,
            occurredAt: new Date(acceptedEvent.occurredAt),
          },
        });
        outboxEventId = outbox.id;
      }

      const decision = await transaction.randomXUpstreamShareDecision.create({
        data: {
          id: input.decisionId,
          idempotencyKey: `randomx-decision:${intent.shareFingerprint}`,
          submissionIntentId: intent.id,
          accepted: input.accepted,
          errorCode,
          errorMessage,
          sourceDigest: input.sourceDigest,
          decidedAt: input.decidedAt,
          outboxEventId,
        },
      });
      return { decision, outboxEventId, created: true };
    });
  }
}
