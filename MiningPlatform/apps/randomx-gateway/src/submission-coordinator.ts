/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import type {
  RandomXAccountingProjectionInput,
  RandomXJob,
  RandomXShareSubmission,
  RandomXValidationResult,
} from '@mining/randomx';
import { RandomXSubmissionRepository } from './submission-repository.js';

const MAXIMUM_SUBMISSION_CLOCK_SKEW_MILLISECONDS = 5_000;

export type RandomXGatewaySubmission = {
  miningAccountId: string;
  assetId: string;
  upstreamPoolId: string;
  correlationId: string;
  acceptedDifficulty: string;
  job: RandomXJob;
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
  readonly activeSessionId: string | undefined;
  submit(submission: RandomXShareSubmission): Promise<RandomXUpstreamSubmissionResult>;
}

export type RandomXSubmissionOutcome =
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
  shareFingerprint: string;
  accepted: boolean;
  errorCode: number | undefined;
  errorMessage: string | undefined;
  decidedAt: Date;
}): string {
  return digestParts([
    'randomx-upstream-share-decision-v1',
    input.upstreamPoolId,
    input.upstreamSessionId,
    input.shareFingerprint,
    String(input.accepted),
    input.errorCode === undefined ? '' : String(input.errorCode),
    input.errorMessage ?? '',
    input.decidedAt.toISOString(),
  ]);
}

export class RandomXSubmissionCoordinator {
  private readonly repository: RandomXSubmissionRepository;
  private readonly createId: () => string;

  constructor(private readonly options: RandomXSubmissionCoordinatorOptions) {
    this.repository = options.repository ?? new RandomXSubmissionRepository();
    this.createId = options.createId ?? randomUUID;
  }

  async submit(input: RandomXGatewaySubmission): Promise<RandomXSubmissionOutcome> {
    const upstreamSessionId = this.options.upstream.activeSessionId;
    if (!upstreamSessionId || upstreamSessionId !== input.job.clientId) {
      throw new Error('RandomX job is not bound to the active upstream session');
    }

    const validationTime = await this.repository.currentDatabaseTime();
    if (
      input.submission.submittedAt.getTime() >
      validationTime.getTime() + MAXIMUM_SUBMISSION_CLOCK_SKEW_MILLISECONDS
    ) {
      throw new Error('RandomX submission timestamp is ahead of authoritative database time');
    }
    const validation = await this.options.validator.validate(
      input.job,
      input.submission,
      validationTime,
    );
    if (!validation.accepted || validation.reason !== 'ACCEPTED') {
      return { status: 'LOCAL_REJECTED', validation, replayed: false };
    }

    const prepared = await this.repository.recordPreparedSubmission({
      miningAccountId: input.miningAccountId,
      assetId: input.assetId,
      upstreamPoolId: input.upstreamPoolId,
      upstreamSessionId,
      correlationId: input.correlationId,
      acceptedDifficulty: input.acceptedDifficulty,
      job: input.job,
      submission: input.submission,
      validation,
    });

    if (!prepared.created) {
      const existing = await this.repository.findDecisionByIntent(prepared.intent.id);
      if (!existing) throw new RandomXSubmissionUncertainError(prepared.intent.id);
      if (existing.accepted) {
        if (!existing.outboxEventId) {
          throw new RandomXSubmissionUncertainError(
            prepared.intent.id,
            'RandomX accepted decision is missing its durable outbox evidence',
          );
        }
        return {
          status: 'ACCEPTED_ENQUEUED',
          intentId: prepared.intent.id,
          decisionId: existing.id,
          outboxEventId: existing.outboxEventId,
          replayed: true,
        };
      }
      return {
        status: 'UPSTREAM_REJECTED',
        intentId: prepared.intent.id,
        decisionId: existing.id,
        errorCode: existing.errorCode,
        errorMessage: existing.errorMessage ?? 'RandomX upstream rejected share',
        replayed: true,
      };
    }

    let upstreamResult: RandomXUpstreamSubmissionResult;
    try {
      upstreamResult = await this.options.upstream.submit(input.submission);
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
      upstreamPoolId: input.upstreamPoolId,
      upstreamSessionId,
      shareFingerprint: prepared.projection.shareFingerprint,
      ...normalized,
      decidedAt,
    });
    const decisionId = this.createId();
    const eventId = normalized.accepted ? this.createId() : undefined;
    const accounting: RandomXAccountingProjectionInput | undefined = normalized.accepted
      ? {
          miningAccountId: input.miningAccountId,
          assetId: input.assetId,
          correlationId: input.correlationId,
          acceptedDifficulty: input.acceptedDifficulty,
          job: input.job,
          submission: input.submission,
          validation,
          upstream: {
            accepted: true,
            upstreamPoolId: input.upstreamPoolId,
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
