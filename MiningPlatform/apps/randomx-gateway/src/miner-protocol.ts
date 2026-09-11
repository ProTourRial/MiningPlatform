/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { applyRandomXNonce, parseRandomXTarget, type RandomXAlgorithm } from '@mining/randomx';

export type RandomXMinerJsonRpcId = number | string | null;

export type RandomXMinerLoginRequest = {
  id: RandomXMinerJsonRpcId;
  method: 'login';
  login: string;
  password: string;
  agent?: string;
};

export type RandomXMinerSubmitRequest = {
  id: RandomXMinerJsonRpcId;
  method: 'submit';
  sessionId: string;
  minerJobId: string;
  nonce: string;
  result: string;
};

export type RandomXMinerKeepaliveRequest = {
  id: RandomXMinerJsonRpcId;
  method: 'keepalived';
  sessionId: string;
};

export type RandomXMinerRequest =
  | RandomXMinerLoginRequest
  | RandomXMinerSubmitRequest
  | RandomXMinerKeepaliveRequest;

export type RandomXMinerJobAssignment = {
  minerJobId: string;
  upstreamJobId: string;
  algorithm: RandomXAlgorithm;
  blob: string;
  target: string;
  seedHash: string;
  height?: bigint;
  expiresAt: Date;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseId(value: unknown): RandomXMinerJsonRpcId {
  if (value === null || typeof value === 'string') {
    if (typeof value === 'string' && value.length > 128) {
      throw new Error('RandomX miner request id is too long');
    }
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new Error('RandomX miner request id is invalid');
}

function requiredString(
  record: JsonRecord,
  key: string,
  maximumLength: number,
  options: { trim?: boolean; allowEmpty?: boolean } = {},
): string {
  const raw = record[key];
  if (typeof raw !== 'string') throw new Error(`RandomX miner field ${key} is invalid`);
  const value = options.trim === false ? raw : raw.trim();
  if ((!options.allowEmpty && value.length === 0) || value.length > maximumLength) {
    throw new Error(`RandomX miner field ${key} is invalid`);
  }
  return value;
}

function parseParams(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error('RandomX miner request params must be an object');
  return value;
}

export function parseRandomXMinerLine(line: string): RandomXMinerRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('RandomX miner sent malformed JSON');
  }
  if (!isRecord(parsed)) throw new Error('RandomX miner request must be an object');
  if (parsed.jsonrpc !== undefined && parsed.jsonrpc !== '2.0') {
    throw new Error('RandomX miner JSON-RPC version is unsupported');
  }

  const id = parseId(parsed.id ?? null);
  const method = requiredString(parsed, 'method', 32);
  const params = parseParams(parsed.params);
  if (method === 'login') {
    const agent =
      params.agent === undefined
        ? undefined
        : requiredString(params, 'agent', 256, { allowEmpty: true });
    return {
      id,
      method,
      login: requiredString(params, 'login', 256),
      password: requiredString(params, 'pass', 512, { trim: false }),
      ...(agent ? { agent } : {}),
    };
  }
  if (method === 'submit') {
    const nonce = requiredString(params, 'nonce', 8).toLowerCase();
    const result = requiredString(params, 'result', 64).toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(result)) {
      throw new Error('RandomX miner submission proof is invalid');
    }
    return {
      id,
      method,
      sessionId: requiredString(params, 'id', 256),
      minerJobId: requiredString(params, 'job_id', 256),
      nonce,
      result,
    };
  }
  if (method === 'keepalived') {
    return {
      id,
      method,
      sessionId: requiredString(params, 'id', 256),
    };
  }
  throw new Error('RandomX miner method is unsupported');
}

export function projectRandomXMinerJob(assignment: RandomXMinerJobAssignment): {
  job_id: string;
  blob: string;
  target: string;
  seed_hash: string;
  algo: RandomXAlgorithm;
  height?: number;
} {
  const minerJobId = assignment.minerJobId.trim();
  const upstreamJobId = assignment.upstreamJobId.trim();
  if (!minerJobId || minerJobId.length > 256 || !upstreamJobId || upstreamJobId.length > 256) {
    throw new Error('RandomX miner job assignment id is invalid');
  }
  if (assignment.algorithm !== 'rx/0') {
    throw new Error('RandomX miner job algorithm is unsupported');
  }
  applyRandomXNonce(assignment.blob, '00000000');
  parseRandomXTarget(assignment.target);
  if (!/^[0-9a-f]{64}$/i.test(assignment.seedHash)) {
    throw new Error('RandomX miner job seed hash is invalid');
  }
  if (!(assignment.expiresAt instanceof Date) || Number.isNaN(assignment.expiresAt.getTime())) {
    throw new Error('RandomX miner job expiry is invalid');
  }
  let height: number | undefined;
  if (assignment.height !== undefined) {
    if (assignment.height < 0n || assignment.height > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('RandomX miner job height cannot be represented safely');
    }
    height = Number(assignment.height);
  }
  return {
    job_id: minerJobId,
    blob: assignment.blob.toLowerCase(),
    target: assignment.target.toLowerCase(),
    seed_hash: assignment.seedHash.toLowerCase(),
    algo: assignment.algorithm,
    ...(height === undefined ? {} : { height }),
  };
}

export function serializeRandomXMinerResult(id: RandomXMinerJsonRpcId, result: unknown): string {
  return `${JSON.stringify({ id, jsonrpc: '2.0', error: null, result })}\n`;
}

export function serializeRandomXMinerError(
  id: RandomXMinerJsonRpcId,
  code: number,
  message: string,
): string {
  if (!Number.isSafeInteger(code)) throw new Error('RandomX miner error code is invalid');
  const safeMessage = message.trim().slice(0, 256) || 'Request failed';
  return `${JSON.stringify({ id, jsonrpc: '2.0', error: { code, message: safeMessage } })}\n`;
}

export function serializeRandomXMinerJobNotification(
  assignment: RandomXMinerJobAssignment,
): string {
  return `${JSON.stringify({
    jsonrpc: '2.0',
    method: 'job',
    params: projectRandomXMinerJob(assignment),
  })}\n`;
}
