/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import net, { type Socket } from 'node:net';
import tls from 'node:tls';
import {
  randomXJobFingerprint,
  type RandomXJob,
  type RandomXShareSubmission,
} from '@mining/randomx';
import {
  normalizeRandomXUpstreamJob,
  parseRandomXLoginResult,
  parseRandomXUpstreamLine,
  randomXSubmitWasAccepted,
  serializeRandomXLogin,
  serializeRandomXSubmit,
  type RandomXJsonRpcResponse,
  type RandomXLoginResult,
} from './randomx-protocol.js';
import type { UpstreamEndpoint, UpstreamShareResult } from './types.js';

export type RandomXUpstreamState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHORIZING'
  | 'ACTIVE'
  | 'STOPPED';

export type RandomXPoolAdapterCallbacks = {
  onState?: (state: RandomXUpstreamState) => void;
  onJob?: (job: RandomXJob) => void;
  onError?: (error: Error) => void;
  onDisconnect?: (reason: Error) => void;
};

export type RandomXPoolAdapterOptions = {
  jobTtlMilliseconds?: number;
  maximumRetainedJobs?: number;
  now?: () => Date;
};

type PendingRequest = {
  resolve: (response: RandomXJsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class RandomXSubmissionNotDispatchedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RandomXSubmissionNotDispatchedError';
  }
}

function safeUpstreamError(response: RandomXJsonRpcResponse, fallback: string): string {
  return response.error ? `${fallback} (${response.error.code})` : fallback;
}

function cloneJob(job: RandomXJob): RandomXJob {
  return {
    ...job,
    receivedAt: new Date(job.receivedAt.getTime()),
    expiresAt: new Date(job.expiresAt.getTime()),
  };
}

export class RandomXPoolAdapter {
  readonly capabilities = Object.freeze({
    protocol: 'CRYPTONOTE_JSON_RPC' as const,
    algorithm: 'rx/0' as const,
    supportsTls: true,
    requiresSeedHash: true,
  });

  private readonly pending = new Map<string, PendingRequest>();
  private readonly jobs = new Map<string, RandomXJob>();
  private readonly deferredJobNotifications: unknown[] = [];
  private readonly jobTtlMilliseconds: number;
  private readonly maximumRetainedJobs: number;
  private readonly now: () => Date;
  private nextRequestId = 1;
  private socket?: Socket;
  private buffer = '';
  private adapterState: RandomXUpstreamState = 'DISCONNECTED';
  private sessionId?: string;
  private stopped = false;
  private startOperation?: Promise<RandomXLoginResult>;
  private lifecycleGeneration = 0;

  constructor(
    readonly id: string,
    readonly endpoint: UpstreamEndpoint,
    private readonly callbacks: RandomXPoolAdapterCallbacks = {},
    options: RandomXPoolAdapterOptions = {},
  ) {
    if (!id.trim()) throw new Error('RandomX pool adapter id is required');
    if (
      !endpoint.host.trim() ||
      !Number.isInteger(endpoint.port) ||
      endpoint.port < 1 ||
      endpoint.port > 65_535
    ) {
      throw new Error('RandomX upstream endpoint is invalid');
    }
    if (
      !Number.isSafeInteger(endpoint.maximumLineBytes) ||
      endpoint.maximumLineBytes < 256 ||
      endpoint.maximumLineBytes > 1_048_576
    ) {
      throw new Error('RandomX upstream maximum line size is invalid');
    }
    this.jobTtlMilliseconds = options.jobTtlMilliseconds ?? 120_000;
    this.maximumRetainedJobs = options.maximumRetainedJobs ?? 16;
    this.now = options.now ?? (() => new Date());
    if (!Number.isSafeInteger(this.jobTtlMilliseconds) || this.jobTtlMilliseconds <= 0) {
      throw new Error('RandomX job TTL must be a positive integer');
    }
    if (!Number.isSafeInteger(this.maximumRetainedJobs) || this.maximumRetainedJobs < 1) {
      throw new Error('RandomX retained job limit must be a positive integer');
    }
  }

  get state(): RandomXUpstreamState {
    return this.adapterState;
  }

  get activeSessionId(): string | undefined {
    return this.state === 'ACTIVE' ? this.sessionId : undefined;
  }

  start(): Promise<RandomXLoginResult> {
    if (this.startOperation) return this.startOperation;
    const operation = this.startSession();
    const settled: Promise<RandomXLoginResult> = operation.finally(() => {
      if (this.startOperation === settled) this.startOperation = undefined;
    });
    this.startOperation = settled;
    return settled;
  }

  private async startSession(): Promise<RandomXLoginResult> {
    const generation = ++this.lifecycleGeneration;
    this.closeSocket(new Error('RandomX upstream session replaced'), false);
    this.jobs.clear();
    this.sessionId = undefined;
    this.stopped = false;
    this.setState('CONNECTING');
    try {
      const socket = await this.openSocket();
      if (generation !== this.lifecycleGeneration || this.stopped) {
        socket.destroy();
        throw new Error('RandomX upstream start was superseded');
      }
      this.socket = socket;
      this.bindSocket(socket);
      this.setState('AUTHORIZING');
      const response = await this.request((requestId) =>
        serializeRandomXLogin(
          requestId,
          this.endpoint.username,
          this.endpoint.password,
          this.endpoint.userAgent,
        ),
      );
      if (response.error)
        throw new Error(safeUpstreamError(response, 'RandomX upstream login rejected'));
      const login = parseRandomXLoginResult(response.result, this.now(), this.jobTtlMilliseconds);
      this.sessionId = login.sessionId;
      this.recordJob(login.job);
      this.flushDeferredJobNotifications();
      this.setState('ACTIVE');
      return login;
    } catch (error) {
      const parsed = error instanceof Error ? error : new Error(String(error));
      if (generation === this.lifecycleGeneration) {
        this.closeSocket(parsed, false);
        this.jobs.clear();
        this.sessionId = undefined;
        if (!this.stopped) this.setState('DISCONNECTED');
      }
      throw parsed;
    }
  }

  getJob(jobId: string, at = this.now()): RandomXJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (job.expiresAt.getTime() < at.getTime()) {
      this.jobs.delete(jobId);
      return undefined;
    }
    return cloneJob(job);
  }

  async submit(
    submission: RandomXShareSubmission,
    expectedSessionId: string,
    expectedJobFingerprint: string,
  ): Promise<UpstreamShareResult> {
    if (this.state !== 'ACTIVE' || !this.sessionId || this.sessionId !== expectedSessionId) {
      throw new RandomXSubmissionNotDispatchedError(
        'RandomX upstream session changed before dispatch',
      );
    }
    const job = this.getJob(submission.jobId, this.now());
    if (
      !job ||
      job.clientId !== expectedSessionId ||
      randomXJobFingerprint(job) !== expectedJobFingerprint
    ) {
      throw new RandomXSubmissionNotDispatchedError(
        'RandomX upstream job became unavailable before dispatch',
      );
    }
    if (!this.socket || this.socket.destroyed) {
      throw new RandomXSubmissionNotDispatchedError(
        'RandomX upstream socket closed before dispatch',
      );
    }
    const response = await this.request((requestId) =>
      serializeRandomXSubmit(requestId, expectedSessionId, submission),
    );
    if (response.error) {
      return {
        accepted: false,
        errorCode: response.error.code,
        errorMessage: safeUpstreamError(response, 'RandomX upstream rejected share'),
      };
    }
    if (!randomXSubmitWasAccepted(response.result)) {
      throw new Error('RandomX upstream returned an ambiguous submission result');
    }
    return { accepted: true };
  }

  close(): void {
    this.stopped = true;
    this.lifecycleGeneration += 1;
    this.closeSocket(new Error('RandomX upstream client stopped'), false);
    this.jobs.clear();
    this.sessionId = undefined;
    this.setState('STOPPED');
  }

  private async openSocket(): Promise<Socket> {
    return new Promise<Socket>((resolve, reject) => {
      const socket: Socket = this.endpoint.tls
        ? tls.connect({
            host: this.endpoint.host,
            port: this.endpoint.port,
            servername: this.endpoint.serverName ?? this.endpoint.host,
            rejectUnauthorized: true,
          })
        : net.createConnection({ host: this.endpoint.host, port: this.endpoint.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('RandomX upstream connection timed out'));
      }, this.endpoint.connectTimeoutMs);
      const event = this.endpoint.tls ? 'secureConnect' : 'connect';
      socket.once(event, () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private bindSocket(socket: Socket): void {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      if (this.socket !== socket) return;
      this.consume(chunk);
    });
    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      this.callbacks.onError?.(error);
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      const reason = new Error('RandomX upstream connection closed');
      this.socket = undefined;
      this.rejectPending(reason);
      this.deferredJobNotifications.length = 0;
      this.jobs.clear();
      this.sessionId = undefined;
      if (!this.stopped) {
        this.setState('DISCONNECTED');
        this.callbacks.onDisconnect?.(reason);
      }
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const raw = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(raw, 'utf8') > this.endpoint.maximumLineBytes) {
        this.failConnection(new Error('RandomX upstream line exceeded maximum size'));
        return;
      }
      const line = raw.trim();
      if (line) {
        try {
          this.handleMessage(line);
        } catch (error) {
          this.failConnection(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      }
      newline = this.buffer.indexOf('\n');
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > this.endpoint.maximumLineBytes) {
      this.failConnection(new Error('Unfinished RandomX upstream line exceeded maximum size'));
    }
  }

  private handleMessage(line: string): void {
    const message = parseRandomXUpstreamLine(line);
    if ('method' in message) {
      if (!this.sessionId) {
        if (
          this.state !== 'AUTHORIZING' ||
          this.deferredJobNotifications.length >= this.maximumRetainedJobs
        ) {
          throw new Error('RandomX job arrived before authorization');
        }
        this.deferredJobNotifications.push(message.params);
        return;
      }
      const job = normalizeRandomXUpstreamJob(
        message.params,
        this.sessionId,
        this.now(),
        this.jobTtlMilliseconds,
      );
      this.recordJob(job);
      return;
    }
    const pending = this.pending.get(String(message.id));
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(String(message.id));
    pending.resolve(message);
  }

  private flushDeferredJobNotifications(): void {
    if (!this.sessionId) throw new Error('RandomX deferred jobs require an authorized session');
    for (const params of this.deferredJobNotifications.splice(0)) {
      this.recordJob(
        normalizeRandomXUpstreamJob(params, this.sessionId, this.now(), this.jobTtlMilliseconds),
      );
    }
  }

  private recordJob(job: RandomXJob): void {
    const storedJob = cloneJob(job);
    this.jobs.set(storedJob.id, storedJob);
    while (this.jobs.size > this.maximumRetainedJobs) {
      const oldest = this.jobs.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.jobs.delete(oldest);
    }
    this.callbacks.onJob?.(cloneJob(storedJob));
  }

  private request(serializer: (requestId: number) => string): Promise<RandomXJsonRpcResponse> {
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      return Promise.reject(new Error('RandomX upstream socket is not connected'));
    }
    const requestId = this.nextRequestId++;
    let serialized: string;
    try {
      serialized = serializer(requestId);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return new Promise<RandomXJsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(requestId));
        reject(new Error(`RandomX upstream request ${requestId} timed out`));
      }, this.endpoint.responseTimeoutMs);
      timer.unref?.();
      this.pending.set(String(requestId), { resolve, reject, timer });
      const rejectWrite = (error: Error): void => {
        const pending = this.pending.get(String(requestId));
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(String(requestId));
        pending.reject(error);
      };
      try {
        socket.write(serialized, (error) => {
          if (error) rejectWrite(error);
        });
      } catch (error) {
        rejectWrite(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private failConnection(error: Error): void {
    this.callbacks.onError?.(error);
    this.closeSocket(error, true);
  }

  private closeSocket(reason: Error, notifyDisconnect: boolean): void {
    const socket = this.socket;
    this.socket = undefined;
    this.buffer = '';
    this.rejectPending(reason);
    this.deferredJobNotifications.length = 0;
    this.jobs.clear();
    this.sessionId = undefined;
    socket?.destroy();
    if (notifyDisconnect && !this.stopped) {
      this.setState('DISCONNECTED');
      this.callbacks.onDisconnect?.(reason);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setState(state: RandomXUpstreamState): void {
    if (this.adapterState === state) return;
    this.adapterState = state;
    this.callbacks.onState?.(state);
  }
}
