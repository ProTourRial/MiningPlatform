/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  parseRandomXTarget,
  randomXJobFingerprint,
  randomXTargetDifficulty,
  type RandomXAccountingProjectionInput,
  type RandomXJob,
  type RandomXShareSubmission,
  type RandomXValidationResult,
} from '@mining/randomx';
import {
  RandomXSubmissionRepository,
  type ReplayedRandomXSubmission,
} from './submission-repository.js';

export type RandomXGatewaySubmission = {
  connectionId: string;
  correlationId: string;
  submission: RandomXShareSubmission;
};

export type RandomXUpstreamSubmissionResult = {
  accepted: boolean;
  errorCode?: number;
  errorMessage?: string;
};

export interface RandomXGatewayValidator {
  validate(
    job: RandomXJob,
    submission: RandomXShareSubmission,
    now: Date,
  ): Promise<RandomXValidationResult>;
}

export interface RandomXGatewayUpstream {
  readonly id: string;
  readonly activeSessionId: string | undefined;
  getJob(jobId: string, at?: Date): RandomXJob | undefined;
  submit(
    submission: RandomXShareSubmission,
    expectedSessionId: string,
    expectedJobFingerprint: string,
  ): Promise<RandomXUpstreamSubmissionResult>;
}

export interface RandomXGatewayIdentityResolver {
  resolveAuthenticatedWorker(connectionId: string): Promise<{
    workerId: string;
    workerName: string;
    miningAccountId: string;
  }>;
}

export type RandomXSubmissionOutcome =
  | {
      status: 'JOB_UNAVAILABLE';
      reason: 'UNKNOWN_OR_STALE_JOB';
      replayed: false;
    }
  | {
      status: 'LOCAL_REJECTED';
      validation: RandomXValidationResult;
      replayed: false;
    }
  | {
      status: 'UPSTREAM_REJECTED';
      intentId: string;
      decisionId: string;
      errorCode: number | null;
      errorMessage: string;
      replayed: boolean;
    }
  | {
      status: 'ACCEPTED_ENQUEUED';
      intentId: string;
      decisionId: string;
      outboxEventId: string;
      replayed: boolean;
    };

export class RandomXSubmissionUncertainError extends Error {
  constructor(
    readonly intentId: string,
    message = 'RandomX submission outcome is uncertain; automatic resubmission is blocked',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RandomXSubmissionUncertainError';
  }
}

type RandomXSubmissionCoordinatorOptions = {
  validator: RandomXGatewayValidator;
  upstream: RandomXGatewayUpstream;
  identityResolver: RandomXGatewayIdentityResolver;
  repository?: RandomXSubmissionRepository;
  createId?: () => string;
};

function digestParts(parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part, 'utf8')));
    hash.update(':');
    hash.update(part);
    hash.update(';');
  }
  return hash.digest('hex');
}

function isBoundedIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    ![...value].some((character) => character.charCodeAt(0) < 0x20)
  );
}

function snapshotSubmission(input: RandomXGatewaySubmission): RandomXGatewaySubmission {
  if (!isBoundedIdentifier(input.connectionId)) {
    throw new Error('RandomX authenticated connection id is invalid');
  }
  const submittedAt = input.submission.submittedAt;
  if (!(submittedAt instanceof Date) || Number.isNaN(submittedAt.getTime())) {
    throw new Error('RandomX submission time is invalid');
  }
  return {
    connectionId: input.connectionId,
    correlationId: input.correlationId,
    submission: {
      ...input.submission,
      submittedAt: new Date(submittedAt.getTime()),
    },
  };
}

function snapshotJob(job: RandomXJob): RandomXJob {
  return {
    ...job,
    receivedAt: new Date(job.receivedAt.getTime()),
    expiresAt: new Date(job.expiresAt.getTime()),
  };
}

function normalizeUpstreamResult(value: RandomXUpstreamSubmissionResult): {
  accepted: boolean;
  errorCode: number | undefined;
  errorMessage: string | undefined;
} {
  if (!value || typeof value.accepted !== 'boolean') {
    throw new Error('RandomX upstream returned a malformed decision');
  }
  if (value.accepted) {
    if (value.errorCode !== undefined || value.errorMessage !== undefined) {
      throw new Error('RandomX upstream acceptance cannot contain rejection details');
    }
    return { accepted: true, errorCode: undefined, errorMessage: undefined };
  }

  const errorCode = value.errorCode;
  if (
    errorCode !== undefined &&
    (!Number.isSafeInteger(errorCode) || errorCode < -2_147_483_648 || errorCode > 2_147_483_647)
  ) {
    throw new Error('RandomX upstream returned an invalid error code');
  }
  const errorMessage = (value.errorMessage?.trim() || 'RandomX upstream rejected share').slice(
    0,
    512,
  );
  return { accepted: false, errorCode, errorMessage };
}

function decisionDigest(input: {
  upstreamPoolId: string;
  upstreamSessionId: string;
  upstreamDispatchFingerprint: string;
  accepted: boolean;
  errorCode: number | undefined;
  errorMessage: string | undefined;
  decidedAt: Date;
}): string {
  return digestParts([
    'randomx-upstream-share-decision-v2',
    input.upstreamPoolId,
    input.upstreamSessionId,
    input.upstreamDispatchFingerprint,
    String(input.accepted),
    input.errorCode === undefined ? '' : String(input.errorCode),
    input.errorMessage ?? '',
    input.decidedAt.toISOString(),
  ]);
}

function replayOutcome(replay: ReplayedRandomXSubmission): RandomXSubmissionOutcome {
  const existing = replay.decision;
  if (!existing) throw new RandomXSubmissionUncertainError(replay.intent.id);
  if (existing.accepted) {
    if (!existing.outboxEventId) {
      throw new RandomXSubmissionUncertainError(
        replay.intent.id,
        'RandomX accepted decision is missing its durable outbox evidence',
      );
    }
    return {
      status: 'ACCEPTED_ENQUEUED',
      intentId: replay.intent.id,
      decisionId: existing.id,
      outboxEventId: existing.outboxEventId,
      replayed: true,
    };
  }
  return {
    status: 'UPSTREAM_REJECTED',
    intentId: replay.intent.id,
    decisionId: existing.id,
    errorCode: existing.errorCode,
    errorMessage: existing.errorMessage ?? 'RandomX upstream rejected share',
    replayed: true,
  };
}

export class RandomXSubmissionCoordinator {
  private readonly repository: RandomXSubmissionRepository;
  private readonly createId: () => string;

  constructor(private readonly options: RandomXSubmissionCoordinatorOptions) {
    this.repository = options.repository ?? new RandomXSubmissionRepository();
    this.createId = options.createId ?? randomUUID;
  }

  async submit(input: RandomXGatewaySubmission): Promise<RandomXSubmissionOutcome> {
    const request = snapshotSubmission(input);
    const authenticatedWorker = await this.options.identityResolver.resolveAuthenticatedWorker(
      request.connectionId,
    );
    if (
      !authenticatedWorker ||
      !isBoundedIdentifier(authenticatedWorker.workerId) ||
      !isBoundedIdentifier(authenticatedWorker.workerName) ||
      !isBoundedIdentifier(authenticatedWorker.miningAccountId)
    ) {
      throw new Error('RandomX authenticated worker principal is invalid');
    }
    if (authenticatedWorker.workerName !== request.submission.workerName) {
      throw new Error('RandomX submission worker does not match the authenticated connection');
    }
    const context = await this.repository.resolveSubmissionContext(
      authenticatedWorker.workerId,
      authenticatedWorker.miningAccountId,
      this.options.upstream.id,
    );
    const durableReplay = await this.repository.findSubmissionReplay({
      upstreamPoolId: context.upstreamPoolId,
      submission: request.submission,
    });
    if (durableReplay) {
      if (durableReplay.intent.miningAccountId !== context.miningAccountId) {
        throw new Error('RandomX upstream proof already belongs to another mining account');
      }
      return replayOutcome(durableReplay);
    }

    const upstreamSessionId = this.options.upstream.activeSessionId;
    if (!upstreamSessionId) throw new Error('RandomX upstream session is not active');
    const validationTime = await this.repository.currentDatabaseTime();
    if (request.submission.submittedAt.getTime() > validationTime.getTime()) {
      throw new Error('RandomX submission timestamp is ahead of authoritative database time');
    }
    const availableJob = this.options.upstream.getJob(request.submission.jobId, validationTime);
    if (!availableJob) {
      return { status: 'JOB_UNAVAILABLE', reason: 'UNKNOWN_OR_STALE_JOB', replayed: false };
    }
    const job = snapshotJob(availableJob);
    const jobFingerprint = randomXJobFingerprint(job);
    if (job.clientId !== upstreamSessionId) {
      throw new Error('RandomX authoritative job is not bound to the active upstream session');
    }
    if (job.receivedAt.getTime() > validationTime.getTime()) {
      return { status: 'JOB_UNAVAILABLE', reason: 'UNKNOWN_OR_STALE_JOB', replayed: false };
    }
    const validation = await this.options.validator.validate(
      snapshotJob(job),
      snapshotSubmission(request).submission,
      new Date(validationTime.getTime()),
    );
    if (!validation.accepted || validation.reason !== 'ACCEPTED') {
      return { status: 'LOCAL_REJECTED', validation, replayed: false };
    }

    const revalidatedWorker = await this.options.identityResolver.resolveAuthenticatedWorker(
      request.connectionId,
    );
    if (
      !revalidatedWorker ||
      revalidatedWorker.workerId !== authenticatedWorker.workerId ||
      revalidatedWorker.workerName !== authenticatedWorker.workerName ||
      revalidatedWorker.miningAccountId !== authenticatedWorker.miningAccountId
    ) {
      throw new Error('RandomX authenticated connection changed during validation');
    }

    const acceptedDifficulty = randomXTargetDifficulty(parseRandomXTarget(job.target));
    const prepared = await this.repository.recordPreparedSubmission({
      authenticatedWorkerId: context.workerId,
      miningAccountId: context.miningAccountId,
      assetId: context.assetId,
      upstreamPoolId: context.upstreamPoolId,
      upstreamSessionId,
      correlationId: request.correlationId,
      acceptedDifficulty,
      job,
      submission: request.submission,
      validation,
    });

    if (!prepared.created) {
      if (prepared.intent.miningAccountId !== context.miningAccountId) {
        throw new Error('RandomX upstream proof already belongs to another mining account');
      }
      const existing = await this.repository.findDecisionByIntent(prepared.intent.id);
      return replayOutcome({ intent: prepared.intent, decision: existing });
    }

    let upstreamResult: RandomXUpstreamSubmissionResult;
    try {
      upstreamResult = await this.options.upstream.submit(
        snapshotSubmission(request).submission,
        upstreamSessionId,
        jobFingerprint,
      );
    } catch (error) {
      throw new RandomXSubmissionUncertainError(
        prepared.intent.id,
        'RandomX upstream transport failed after durable intent; automatic resubmission is blocked',
        { cause: error },
      );
    }

    let decidedAt: Date;
    let normalized: ReturnType<typeof normalizeUpstreamResult>;
    try {
      normalized = normalizeUpstreamResult(upstreamResult);
      decidedAt = await this.repository.currentDatabaseTime();
    } catch (error) {
      throw new RandomXSubmissionUncertainError(
        prepared.intent.id,
        'RandomX upstream response or authoritative decision time is ambiguous; automatic resubmission is blocked',
        { cause: error },
      );
    }
    const sourceDigest = decisionDigest({
      upstreamPoolId: context.upstreamPoolId,
      upstreamSessionId,
      upstreamDispatchFingerprint: prepared.projection.upstreamDispatchFingerprint,
      ...normalized,
      decidedAt,
    });
    const decisionId = this.createId();
    const eventId = normalized.accepted ? this.createId() : undefined;
    const accounting: RandomXAccountingProjectionInput | undefined = normalized.accepted
      ? {
          miningAccountId: context.miningAccountId,
          assetId: context.assetId,
          correlationId: request.correlationId,
          acceptedDifficulty,
          job,
          submission: request.submission,
          validation,
          upstream: {
            accepted: true,
            upstreamPoolId: context.upstreamPoolId,
            upstreamSessionId,
            decidedAt,
            sourceDigest,
          },
        }
      : undefined;

    try {
      const recorded = await this.repository.recordDecision({
        decisionId,
        eventId,
        submissionIntentId: prepared.intent.id,
        accepted: normalized.accepted,
        errorCode: normalized.errorCode,
        errorMessage: normalized.errorMessage,
        sourceDigest,
        decidedAt,
        accounting,
      });
      if (normalized.accepted) {
        if (!recorded.outboxEventId) {
          throw new Error('RandomX accepted decision was not correlated to an outbox event');
        }
        return {
          status: 'ACCEPTED_ENQUEUED',
          intentId: prepared.intent.id,
          decisionId: recorded.decision.id,
          outboxEventId: recorded.outboxEventId,
          replayed: false,
        };
      }
      return {
        status: 'UPSTREAM_REJECTED',
        intentId: prepared.intent.id,
        decisionId: recorded.decision.id,
        errorCode: recorded.decision.errorCode,
        errorMessage: recorded.decision.errorMessage ?? 'RandomX upstream rejected share',
        replayed: false,
      };
    } catch (error) {
      throw new RandomXSubmissionUncertainError(
        prepared.intent.id,
        'RandomX decision persistence failed after upstream response; automatic resubmission is blocked',
        { cause: error },
      );
    }
  }
}
