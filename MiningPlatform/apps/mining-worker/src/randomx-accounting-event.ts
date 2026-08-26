/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus';
import type { RandomXAccountingProjectionInput } from '@mining/randomx';
import { MiningEvents, type RandomXAcceptedSharePayload } from '@mining/shared';
import { PrismaTransactionalIdempotencyService } from './prisma-idempotency.js';
import { RandomXAccountingEvidenceRepository } from './randomx-accounting-evidence.js';

export const RANDOMX_ACCOUNTING_EVENT_PRODUCER = 'randomx-mining-gateway';
const RANDOMX_ACCOUNTING_OWNER = 'randomx-accounting-evidence-v1';
const IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

export type RandomXAccountingEventResult =
  | { processed: true; evidenceId: string }
  | { processed: false; evidenceId: string };

function requiredString(value: unknown, label: string, maximumLength = 256): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(`RandomX accounting event ${label} is invalid`);
  }
  if (value !== value.trim() || [...value].some((character) => character.charCodeAt(0) < 0x20)) {
    throw new Error(`RandomX accounting event ${label} is invalid`);
  }
  return value;
}

function exactIsoDate(value: unknown, label: string): string {
  const text = requiredString(value, label, 32);
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== text) {
    throw new Error(`RandomX accounting event ${label} is invalid`);
  }
  return text;
}

function lowerHex(value: unknown, label: string, pattern: RegExp, maximumLength = 814): string {
  const text = requiredString(value, label, maximumLength);
  if (!pattern.test(text)) throw new Error(`RandomX accounting event ${label} is invalid`);
  return text.toLowerCase();
}

function uint64Decimal(value: unknown, label: string, allowZero: boolean): string {
  const text = requiredString(value, label, 20);
  if (!/^(?:0|[1-9]\d{0,19})$/.test(text)) {
    throw new Error(`RandomX accounting event ${label} is invalid`);
  }
  const parsed = BigInt(text);
  if (parsed > MAX_UINT64 || (!allowZero && parsed === 0n)) {
    throw new Error(`RandomX accounting event ${label} is invalid`);
  }
  return text;
}

function canonicalDifficulty(value: unknown): string {
  const text = requiredString(value, 'accepted difficulty', 128);
  const match = /^(?:0|[1-9]\d*)(?:\.(\d{1,12}))?$/.exec(text);
  if (!match || match[1]?.endsWith('0')) {
    throw new Error('RandomX accounting event accepted difficulty is invalid');
  }
  const [whole = '', fraction = ''] = text.split('.');
  if (BigInt(`${whole}${fraction.padEnd(12, '0')}`) === 0n) {
    throw new Error('RandomX accounting event accepted difficulty is invalid');
  }
  return text;
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('RandomX accounting event payload is invalid');
  }
  return value as Record<string, unknown>;
}

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

function parsePayload(value: unknown): RandomXAcceptedSharePayload {
  const source = payloadRecord(value);
  const expectedKeys = new Set([
    'miningAccountId',
    'assetId',
    'algorithm',
    'upstreamPoolId',
    'upstreamSessionId',
    'upstreamJobId',
    'upstreamClientId',
    'workerName',
    'jobBlob',
    'seedHash',
    'targetHex',
    'jobHeight',
    'jobReceivedAt',
    'jobExpiresAt',
    'nonce',
    'submittedResult',
    'submittedAt',
    'localAccepted',
    'localReason',
    'localFingerprint',
    'computedResult',
    'localTarget',
    'acceptedDifficulty',
    'upstreamAccepted',
    'upstreamDecidedAt',
    'upstreamDecisionDigest',
  ]);
  const keys = Object.keys(source);
  if (keys.length !== expectedKeys.size || keys.some((key) => !expectedKeys.has(key))) {
    throw new Error('RandomX accounting event payload shape is invalid');
  }
  if (source.algorithm !== 'rx/0') {
    throw new Error('RandomX accounting event algorithm is unsupported');
  }
  if (source.localAccepted !== true || source.localReason !== 'ACCEPTED') {
    throw new Error('RandomX accounting event requires local acceptance');
  }
  if (source.upstreamAccepted !== true) {
    throw new Error('RandomX accounting event requires upstream acceptance');
  }

  const jobBlob = lowerHex(source.jobBlob, 'job blob', /^[0-9a-f]{86,814}$/i);
  if (jobBlob.length % 2 !== 0) {
    throw new Error('RandomX accounting event job blob is invalid');
  }

  return {
    miningAccountId: requiredString(source.miningAccountId, 'mining account'),
    assetId: requiredString(source.assetId, 'asset'),
    algorithm: 'rx/0',
    upstreamPoolId: requiredString(source.upstreamPoolId, 'upstream pool'),
    upstreamSessionId: requiredString(source.upstreamSessionId, 'upstream session'),
    upstreamJobId: requiredString(source.upstreamJobId, 'upstream job'),
    upstreamClientId: requiredString(source.upstreamClientId, 'upstream client'),
    workerName: requiredString(source.workerName, 'worker name'),
    jobBlob,
    seedHash: lowerHex(source.seedHash, 'seed hash', /^[0-9a-f]{64}$/i, 64),
    targetHex: lowerHex(source.targetHex, 'target', /^(?:[0-9a-f]{8}|[0-9a-f]{16})$/i, 16),
    jobHeight: uint64Decimal(source.jobHeight, 'job height', true),
    jobReceivedAt: exactIsoDate(source.jobReceivedAt, 'job received time'),
    jobExpiresAt: exactIsoDate(source.jobExpiresAt, 'job expiry time'),
    nonce: lowerHex(source.nonce, 'nonce', /^[0-9a-f]{8}$/i, 8),
    submittedResult: lowerHex(source.submittedResult, 'submitted result', /^[0-9a-f]{64}$/i, 64),
    submittedAt: exactIsoDate(source.submittedAt, 'submission time'),
    localAccepted: true,
    localReason: 'ACCEPTED',
    localFingerprint: lowerHex(source.localFingerprint, 'local fingerprint', /^[0-9a-f]{64}$/i, 64),
    computedResult: lowerHex(source.computedResult, 'computed result', /^[0-9a-f]{64}$/i, 64),
    localTarget: uint64Decimal(source.localTarget, 'local target', false),
    acceptedDifficulty: canonicalDifficulty(source.acceptedDifficulty),
    upstreamAccepted: true,
    upstreamDecidedAt: exactIsoDate(source.upstreamDecidedAt, 'upstream decision time'),
    upstreamDecisionDigest: lowerHex(
      source.upstreamDecisionDigest,
      'upstream decision digest',
      /^[0-9a-f]{64}$/i,
      64,
    ),
  };
}

type ParsedRandomXAccountingEvent = {
  input: RandomXAccountingProjectionInput;
  idempotencyKey: string;
  requestHash: string;
};

export function parseRandomXAccountingEvent(
  event: DomainEvent<unknown>,
): ParsedRandomXAccountingEvent {
  const eventId = requiredString(event.eventId, 'event id');
  const aggregateId = requiredString(event.aggregateId, 'aggregate id');
  const correlationId = requiredString(event.correlationId, 'correlation id');
  const causationId =
    event.causationId === undefined ? '' : requiredString(event.causationId, 'causation id');
  if (event.eventName !== MiningEvents.randomXShareAccepted || event.eventVersion !== 1) {
    throw new Error('RandomX accounting event name or version is unsupported');
  }
  if (event.producer !== RANDOMX_ACCOUNTING_EVENT_PRODUCER) {
    throw new Error('RandomX accounting event producer is unsupported');
  }
  if (event.aggregateType !== 'MiningAccount') {
    throw new Error('RandomX accounting event aggregate type is invalid');
  }

  const occurredAt = exactIsoDate(event.occurredAt, 'occurred time');
  const payload = parsePayload(event.payload);
  if (aggregateId !== payload.miningAccountId) {
    throw new Error('RandomX accounting event aggregate does not match the mining account');
  }
  if (occurredAt !== payload.upstreamDecidedAt) {
    throw new Error('RandomX accounting event occurrence does not match upstream acceptance');
  }
  const sourceIdempotencyKey = requiredString(event.idempotencyKey, 'idempotency key', 350);
  const expectedIdempotencyKey = `randomx-share:${payload.localFingerprint}`;
  if (sourceIdempotencyKey !== expectedIdempotencyKey) {
    throw new Error('RandomX accounting event idempotency key is not canonical');
  }

  const requestHash = digestParts([
    'randomx-accounting-event-v1',
    eventId,
    event.eventName,
    String(event.eventVersion),
    occurredAt,
    event.producer,
    event.aggregateType,
    aggregateId,
    correlationId,
    causationId,
    sourceIdempotencyKey,
    payload.miningAccountId,
    payload.assetId,
    payload.algorithm,
    payload.upstreamPoolId,
    payload.upstreamSessionId,
    payload.upstreamJobId,
    payload.upstreamClientId,
    payload.workerName,
    payload.jobBlob,
    payload.seedHash,
    payload.targetHex,
    payload.jobHeight,
    payload.jobReceivedAt,
    payload.jobExpiresAt,
    payload.nonce,
    payload.submittedResult,
    payload.submittedAt,
    String(payload.localAccepted),
    payload.localReason,
    payload.localFingerprint,
    payload.computedResult,
    payload.localTarget,
    payload.acceptedDifficulty,
    String(payload.upstreamAccepted),
    payload.upstreamDecidedAt,
    payload.upstreamDecisionDigest,
  ]);

  return {
    idempotencyKey: `${RANDOMX_ACCOUNTING_OWNER}:${sourceIdempotencyKey}`,
    requestHash,
    input: {
      miningAccountId: payload.miningAccountId,
      assetId: payload.assetId,
      correlationId,
      acceptedDifficulty: payload.acceptedDifficulty,
      job: {
        id: payload.upstreamJobId,
        clientId: payload.upstreamClientId,
        algorithm: payload.algorithm,
        blob: payload.jobBlob,
        target: payload.targetHex,
        seedHash: payload.seedHash,
        height: BigInt(payload.jobHeight),
        receivedAt: new Date(payload.jobReceivedAt),
        expiresAt: new Date(payload.jobExpiresAt),
      },
      submission: {
        workerName: payload.workerName,
        jobId: payload.upstreamJobId,
        nonce: payload.nonce,
        result: payload.submittedResult,
        submittedAt: new Date(payload.submittedAt),
      },
      validation: {
        accepted: true,
        reason: 'ACCEPTED',
        fingerprint: payload.localFingerprint,
        hash: payload.computedResult,
        target: BigInt(payload.localTarget),
      },
      upstream: {
        accepted: true,
        upstreamPoolId: payload.upstreamPoolId,
        upstreamSessionId: payload.upstreamSessionId,
        decidedAt: new Date(payload.upstreamDecidedAt),
        sourceDigest: payload.upstreamDecisionDigest,
      },
    },
  };
}

export class RandomXAccountingEventConsumer {
  private readonly idempotency = new PrismaTransactionalIdempotencyService();
  private readonly repository = new RandomXAccountingEvidenceRepository();

  async handle(event: DomainEvent<unknown>): Promise<RandomXAccountingEventResult> {
    const parsed = parseRandomXAccountingEvent(event);
    return prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.idempotencyKey}, 0))`;
      const acquired = await this.idempotency.acquire(transaction, {
        key: parsed.idempotencyKey,
        owner: RANDOMX_ACCOUNTING_OWNER,
        requestHash: parsed.requestHash,
        ttlMs: IDEMPOTENCY_TTL_MS,
      });
      if (!acquired.acquired) {
        if (acquired.reason === 'COMPLETED' && acquired.record.resultReference) {
          return { processed: false, evidenceId: acquired.record.resultReference };
        }
        throw new Error(`RandomX accounting event idempotency ${acquired.reason.toLowerCase()}`);
      }

      const evidence = await this.repository.recordAcceptedShare(parsed.input, transaction);
      await this.idempotency.complete(transaction, {
        key: parsed.idempotencyKey,
        owner: RANDOMX_ACCOUNTING_OWNER,
        resultReference: evidence.id,
      });
      return { processed: true, evidenceId: evidence.id };
    });
  }
}
