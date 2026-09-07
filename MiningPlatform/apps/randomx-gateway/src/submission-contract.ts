/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { RandomXShareSubmission, RandomXValidationResult } from '@mining/randomx';

export type RandomXGatewaySubmission = {
  connectionId: string;
  correlationId: string;
  submission: RandomXShareSubmission;
};

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
