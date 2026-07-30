/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type StratumRequestId = string | number | null;

export interface StratumRequest {
  id: StratumRequestId;
  method: string;
  params: unknown[];
}

export interface StratumResponse {
  id: StratumRequestId;
  result: unknown;
  error: null | [number, string, unknown?];
}

export interface StratumNotification {
  id: null;
  method: string;
  params: unknown[];
}

export type StratumMessage = StratumRequest | StratumResponse;

export interface MiningConfigureRequest {
  extensions: string[];
  options: Record<string, unknown>;
}

export interface MiningSubscribeRequest {
  userAgent?: string;
  sessionId?: string;
}

export interface MiningAuthorizeRequest {
  workerName: string;
  password: string;
}

export interface MiningSubmitRequest {
  workerName: string;
  jobId: string;
  extranonce2: string;
  networkTime: string;
  nonce: string;
  versionBits?: string;
}

export interface MiningSubscribeResult {
  subscriptions: Array<[string, string]>;
  extranonce1: string;
  extranonce2Size: number;
}

export interface MiningSetDifficultyNotification {
  difficulty: string;
}

export interface MiningSetExtranonceNotification {
  extranonce1: string;
  extranonce2Size: number;
}

export interface MiningNotifyNotification {
  jobId: string;
  previousBlockHash: string;
  coinbase1: string;
  coinbase2: string;
  merkleBranches: string[];
  version: string;
  networkBits: string;
  networkTime: string;
  cleanJobs: boolean;
}

export const StratumErrorCode = {
  other: 20,
  staleShare: 21,
  duplicateShare: 22,
  lowDifficultyShare: 23,
  unauthorizedWorker: 24,
  notSubscribed: 25,
} as const;

function isRequestId(value: unknown): value is StratumRequestId {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

function requireHex(value: unknown, bytes: number | undefined, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hexadecimal string`);
  }
  if (bytes !== undefined && value.length !== bytes * 2) {
    throw new Error(`${label} must contain ${bytes} bytes`);
  }
  return value.toLowerCase();
}

export function parseStratumMessage(line: string): StratumMessage {
  const value = JSON.parse(line) as Record<string, unknown>;
  if (typeof value !== 'object' || value === null || !isRequestId(value.id ?? null)) {
    throw new Error('Invalid Stratum message');
  }

  if (typeof value.method === 'string') {
    if (!Array.isArray(value.params)) throw new Error('Invalid Stratum request parameters');
    return { id: (value.id as StratumRequestId | undefined) ?? null, method: value.method, params: value.params };
  }

  if (!('result' in value) || !('error' in value)) throw new Error('Invalid Stratum response');
  const error = value.error;
  if (
    error !== null &&
    (!Array.isArray(error) || typeof error[0] !== 'number' || typeof error[1] !== 'string')
  ) {
    throw new Error('Invalid Stratum response error');
  }
  return {
    id: (value.id as StratumRequestId | undefined) ?? null,
    result: value.result,
    error: error as StratumResponse['error'],
  };
}

export function parseStratumLine(line: string): StratumRequest {
  const message = parseStratumMessage(line);
  if (!('method' in message)) throw new Error('Expected a Stratum request or notification');
  return message;
}

export function parseMiningConfigure(params: unknown[]): MiningConfigureRequest {
  const extensions = params[0];
  const options = params[1] ?? {};
  if (!Array.isArray(extensions) || extensions.some((extension) => typeof extension !== 'string')) {
    throw new Error('Invalid mining.configure extension list');
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new Error('Invalid mining.configure options');
  }
  return { extensions: [...extensions], options: options as Record<string, unknown> };
}

export function parseMiningSubscribe(params: unknown[]): MiningSubscribeRequest {
  const userAgent = params[0];
  const sessionId = params[1];
  if (userAgent !== undefined && typeof userAgent !== 'string') throw new Error('Invalid miner user agent');
  if (sessionId !== undefined && typeof sessionId !== 'string') throw new Error('Invalid subscription session id');
  return { userAgent, sessionId };
}

export function parseMiningAuthorize(params: unknown[]): MiningAuthorizeRequest {
  const workerName = params[0];
  const password = params[1];
  if (typeof workerName !== 'string' || workerName.trim().length === 0) throw new Error('Worker name is required');
  if (typeof password !== 'string') throw new Error('Worker password is required');
  return { workerName: workerName.trim(), password };
}

export function parseMiningSubmit(params: unknown[]): MiningSubmitRequest {
  const [workerName, jobId, extranonce2, networkTime, nonce, versionBits] = params;
  if (
    typeof workerName !== 'string' ||
    typeof jobId !== 'string' ||
    typeof extranonce2 !== 'string' ||
    typeof networkTime !== 'string' ||
    typeof nonce !== 'string' ||
    (versionBits !== undefined && typeof versionBits !== 'string')
  ) {
    throw new Error('Invalid mining.submit parameters');
  }
  return { workerName, jobId, extranonce2, networkTime, nonce, versionBits };
}

export function parseMiningSubscribeResult(result: unknown): MiningSubscribeResult {
  if (!Array.isArray(result) || result.length < 3) throw new Error('Invalid mining.subscribe result');
  const [rawSubscriptions, rawExtranonce1, rawSize] = result;
  if (!Array.isArray(rawSubscriptions)) throw new Error('Invalid subscription list');
  const subscriptions: Array<[string, string]> = rawSubscriptions.map((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
      throw new Error('Invalid subscription entry');
    }
    return [entry[0], entry[1]];
  });
  if (!Number.isInteger(rawSize) || Number(rawSize) <= 0 || Number(rawSize) > 32) {
    throw new Error('Invalid extranonce2 size');
  }
  return {
    subscriptions,
    extranonce1: requireHex(rawExtranonce1, undefined, 'extranonce1'),
    extranonce2Size: Number(rawSize),
  };
}

export function parseMiningSetDifficulty(params: unknown[]): MiningSetDifficultyNotification {
  const value = params[0];
  if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new Error('Invalid mining.set_difficulty value');
  }
  return { difficulty: String(value) };
}

export function parseMiningSetExtranonce(params: unknown[]): MiningSetExtranonceNotification {
  const [rawExtranonce1, rawSize] = params;
  if (!Number.isInteger(rawSize) || Number(rawSize) <= 0 || Number(rawSize) > 32) {
    throw new Error('Invalid mining.set_extranonce size');
  }
  return {
    extranonce1: requireHex(rawExtranonce1, undefined, 'extranonce1'),
    extranonce2Size: Number(rawSize),
  };
}

export function parseMiningNotify(params: unknown[]): MiningNotifyNotification {
  if (params.length < 9) throw new Error('Invalid mining.notify parameter count');
  const [jobId, prevhash, coinbase1, coinbase2, branches, version, bits, time, cleanJobs] = params;
  if (typeof jobId !== 'string' || jobId.length === 0) throw new Error('Invalid mining.notify job id');
  if (!Array.isArray(branches)) throw new Error('Invalid mining.notify merkle branch list');
  if (typeof cleanJobs !== 'boolean') throw new Error('Invalid mining.notify clean_jobs flag');
  return {
    jobId,
    previousBlockHash: requireHex(prevhash, 32, 'previous block hash'),
    coinbase1: requireHex(coinbase1, undefined, 'coinbase1'),
    coinbase2: requireHex(coinbase2, undefined, 'coinbase2'),
    merkleBranches: branches.map((branch, index) => requireHex(branch, 32, `merkle branch ${index}`)),
    version: requireHex(version, 4, 'version'),
    networkBits: requireHex(bits, 4, 'network bits'),
    networkTime: requireHex(time, 4, 'network time'),
    cleanJobs,
  };
}

export function serializeStratumRequest(request: StratumRequest): string {
  return `${JSON.stringify(request)}\n`;
}

export function serializeStratumResponse(response: StratumResponse): string {
  return `${JSON.stringify(response)}\n`;
}

export function serializeStratumNotification(method: string, params: unknown[]): string {
  const notification: StratumNotification = { id: null, method, params };
  return `${JSON.stringify(notification)}\n`;
}

export function successResponse(id: StratumRequestId, result: unknown): StratumResponse {
  return { id, result, error: null };
}

export function errorResponse(id: StratumRequestId, code: number, message: string, data: unknown = null): StratumResponse {
  return { id, result: false, error: [code, message, data] };
}
