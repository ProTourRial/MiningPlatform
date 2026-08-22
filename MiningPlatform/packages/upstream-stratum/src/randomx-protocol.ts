/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  applyRandomXNonce,
  parseRandomXTarget,
  type RandomXJob,
  type RandomXShareSubmission,
} from '@mining/randomx';

export type RandomXJsonRpcId = number | string | null;

export type RandomXJsonRpcError = {
  code: number;
  message: string;
};

export type RandomXJsonRpcResponse = {
  id: RandomXJsonRpcId;
  error: RandomXJsonRpcError | null;
  result?: unknown;
};

export type RandomXJobNotification = {
  method: 'job';
  params: unknown;
};

export type RandomXLoginResult = {
  sessionId: string;
  job: RandomXJob;
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: RecordValue, key: string, maximumLength: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(`RandomX upstream field ${key} is invalid`);
  }
  return value;
}

export function parseRandomXUpstreamLine(
  line: string,
): RandomXJsonRpcResponse | RandomXJobNotification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('RandomX upstream sent malformed JSON');
  }
  if (!isRecord(parsed)) throw new Error('RandomX upstream message must be an object');

  if (parsed.method !== undefined) {
    if (parsed.method !== 'job' || !('params' in parsed)) {
      throw new Error('RandomX upstream sent an unsupported notification');
    }
    return { method: 'job', params: parsed.params };
  }

  const id = parsed.id;
  if (id !== null && typeof id !== 'number' && typeof id !== 'string') {
    throw new Error('RandomX upstream response id is invalid');
  }
  let error: RandomXJsonRpcError | null = null;
  if (parsed.error !== null && parsed.error !== undefined) {
    if (
      !isRecord(parsed.error) ||
      typeof parsed.error.code !== 'number' ||
      !Number.isSafeInteger(parsed.error.code) ||
      typeof parsed.error.message !== 'string'
    ) {
      throw new Error('RandomX upstream error envelope is invalid');
    }
    error = {
      code: parsed.error.code,
      message: parsed.error.message.slice(0, 512),
    };
  }
  return { id: id ?? null, error, result: parsed.result };
}

export function normalizeRandomXUpstreamJob(
  input: unknown,
  clientId: string,
  receivedAt: Date,
  ttlMilliseconds: number,
): RandomXJob {
  if (!isRecord(input)) throw new Error('RandomX upstream job must be an object');
  const blob = requiredString(input, 'blob', 814);
  const id = requiredString(input, 'job_id', 256);
  const target = requiredString(input, 'target', 16);
  const seedHash = requiredString(input, 'seed_hash', 64);
  applyRandomXNonce(blob, '00000000');
  parseRandomXTarget(target);
  if (!/^[0-9a-f]{64}$/i.test(seedHash)) {
    throw new Error('RandomX upstream seed_hash must be exactly 32 bytes');
  }

  let height: bigint | undefined;
  if (input.height !== undefined) {
    if (
      typeof input.height !== 'number' ||
      !Number.isSafeInteger(input.height) ||
      input.height < 0
    ) {
      throw new Error('RandomX upstream height is invalid');
    }
    height = BigInt(input.height);
  }
  return {
    id,
    clientId,
    algorithm: 'rx/0',
    blob: blob.toLowerCase(),
    target: target.toLowerCase(),
    seedHash: seedHash.toLowerCase(),
    ...(height === undefined ? {} : { height }),
    receivedAt,
    expiresAt: new Date(receivedAt.getTime() + ttlMilliseconds),
  };
}

export function parseRandomXLoginResult(
  result: unknown,
  receivedAt: Date,
  ttlMilliseconds: number,
): RandomXLoginResult {
  if (!isRecord(result)) throw new Error('RandomX upstream login result is invalid');
  const sessionId = requiredString(result, 'id', 256);
  if (result.status !== 'OK') throw new Error('RandomX upstream login status is not OK');
  return {
    sessionId,
    job: normalizeRandomXUpstreamJob(result.job, sessionId, receivedAt, ttlMilliseconds),
  };
}

export function serializeRandomXLogin(
  id: number,
  login: string,
  password: string,
  agent: string,
): string {
  return `${JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'login',
    params: { login, pass: password, agent },
  })}\n`;
}

export function serializeRandomXSubmit(
  id: number,
  sessionId: string,
  submission: RandomXShareSubmission,
): string {
  if (!/^[0-9a-f]{8}$/i.test(submission.nonce) || !/^[0-9a-f]{64}$/i.test(submission.result)) {
    throw new Error('RandomX upstream submission proof is invalid');
  }
  return `${JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'submit',
    params: {
      id: sessionId,
      job_id: submission.jobId,
      nonce: submission.nonce.toLowerCase(),
      result: submission.result.toLowerCase(),
    },
  })}\n`;
}

export function randomXSubmitWasAccepted(result: unknown): boolean {
  return isRecord(result) && result.status === 'OK';
}
