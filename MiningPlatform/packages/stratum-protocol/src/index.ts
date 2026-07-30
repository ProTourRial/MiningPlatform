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

export const StratumErrorCode = {
  other: 20,
  staleShare: 21,
  duplicateShare: 22,
  lowDifficultyShare: 23,
  unauthorizedWorker: 24,
  notSubscribed: 25,
} as const;

export function parseStratumLine(line: string): StratumRequest {
  const value = JSON.parse(line) as Partial<StratumRequest>;
  if (typeof value !== 'object' || value === null || typeof value.method !== 'string' || !Array.isArray(value.params)) {
    throw new Error('Invalid Stratum request');
  }
  const id = value.id;
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') {
    throw new Error('Invalid Stratum request id');
  }
  return { id: id ?? null, method: value.method, params: value.params };
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
