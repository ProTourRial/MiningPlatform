/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  MiningEvents,
  RandomXEventProducers,
  type DomainEvent,
  type RandomXAcceptedSharePayload,
} from '@mining/shared';
import {
  projectRandomXAcceptedContribution,
  type RandomXAccountingProjectionInput,
} from './accounting-projection.js';
import { applyRandomXNonce } from './validator.js';

const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

function boundedEnvelopeIdentifier(value: string, label: string): string {
  if (
    value.length === 0 ||
    value.length > 256 ||
    value !== value.trim() ||
    [...value].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new Error(`RandomX accepted-share event ${label} is invalid`);
  }
  return value;
}

export type CreateRandomXAcceptedShareEventInput = {
  eventId: string;
  causationId?: string;
  accounting: RandomXAccountingProjectionInput;
};

/**
 * Produces the only accepted-share envelope understood by mining-worker. This is
 * deliberately side-effect free: durable pre-RPC intent and outbox publication
 * remain responsibilities of the future authenticated RandomX gateway.
 */
export function createRandomXAcceptedShareEvent(
  input: CreateRandomXAcceptedShareEventInput,
): DomainEvent<RandomXAcceptedSharePayload> {
  const eventId = boundedEnvelopeIdentifier(input.eventId, 'event id');
  const causationId =
    input.causationId === undefined
      ? undefined
      : boundedEnvelopeIdentifier(input.causationId, 'causation id');
  const height = input.accounting.job.height;
  if (height === undefined || height < 0n || height > MAX_UINT64) {
    throw new Error('RandomX accepted-share event requires a uint64 job height');
  }
  applyRandomXNonce(input.accounting.job.blob, '00000000');

  const evidence = projectRandomXAcceptedContribution(input.accounting);
  const payload = Object.freeze<RandomXAcceptedSharePayload>({
    miningAccountId: evidence.miningAccountId,
    assetId: evidence.assetId,
    algorithm: evidence.algorithm,
    upstreamPoolId: evidence.upstreamPoolId,
    upstreamSessionId: evidence.upstreamSessionId,
    upstreamJobId: evidence.upstreamJobId,
    upstreamClientId: evidence.upstreamClientId,
    workerName: evidence.workerName,
    jobBlob: input.accounting.job.blob.toLowerCase(),
    seedHash: evidence.seedHash,
    targetHex: evidence.targetHex,
    jobHeight: height.toString(),
    jobReceivedAt: evidence.jobReceivedAt,
    jobExpiresAt: evidence.jobExpiresAt,
    nonce: evidence.nonce,
    submittedResult: evidence.submittedResult,
    submittedAt: evidence.submittedAt,
    localAccepted: true,
    localReason: 'ACCEPTED',
    localFingerprint: evidence.shareFingerprint,
    computedResult: evidence.computedResult,
    localTarget: evidence.target,
    acceptedDifficulty: evidence.acceptedDifficulty,
    upstreamAccepted: true,
    upstreamDecidedAt: evidence.acceptedAt,
    upstreamDecisionDigest: evidence.upstreamDecisionDigest,
  });

  return Object.freeze({
    eventId,
    eventName: MiningEvents.randomXShareAccepted,
    eventVersion: 1,
    occurredAt: evidence.acceptedAt,
    producer: RandomXEventProducers.acceptedShare,
    aggregateType: 'MiningAccount',
    aggregateId: evidence.miningAccountId,
    correlationId: evidence.correlationId,
    ...(causationId ? { causationId } : {}),
    idempotencyKey: `randomx-share:${evidence.shareFingerprint}`,
    payload,
  });
}
