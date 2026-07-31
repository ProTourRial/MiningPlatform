/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import net, { type Socket } from 'node:net';
import tls from 'node:tls';
import {
  parseMiningNotify,
  parseMiningSetDifficulty,
  parseMiningSetExtranonce,
  parseMiningSubscribeResult,
  parseStratumMessage,
  serializeStratumRequest,
  type MiningSubmitRequest,
  type StratumResponse,
} from '@mining/stratum-protocol';
import { exponentialBackoffMs } from './backoff.js';
import { normalizeUpstreamJob } from './job-normalizer.js';
import { UpstreamJobRegistry } from './job-registry.js';
import { RequestCorrelator } from './request-correlator.js';
import { transitionUpstreamState } from './session-state-machine.js';
import type {
  UpstreamClientCallbacks,
  UpstreamEndpoint,
  UpstreamSessionState,
  UpstreamShareResult,
  UpstreamSubscription,
  UpstreamSubmitInput,
} from './types.js';

export class UpstreamStratumClient {
  readonly jobs = new UpstreamJobRegistry();
  private readonly correlator = new RequestCorrelator();
  private socket?: Socket;
  private buffer = '';
  private state: UpstreamSessionState = 'DISCONNECTED';
  private subscription?: UpstreamSubscription;
  private difficulty = '1';
  private stopped = false;

  constructor(
    private readonly endpoint: UpstreamEndpoint,
    private readonly callbacks: UpstreamClientCallbacks = {},
  ) {}

  get currentState(): UpstreamSessionState {
    return this.state;
  }

  get currentSubscription(): UpstreamSubscription | undefined {
    return this.subscription;
  }

  get currentDifficulty(): string {
    return this.difficulty;
  }

  async connectAndSubscribe(): Promise<UpstreamSubscription> {
    this.stopped = false;
    this.setState('CONNECTING');
    const socket = await this.openSocket();
    this.socket = socket;
    this.bindSocket(socket);
    this.setState('SUBSCRIBING');
    const response = await this.request('mining.subscribe', [this.endpoint.userAgent]);
    if (response.error) throw new Error(`Upstream subscribe rejected: ${response.error[1]}`);
    this.subscription = parseMiningSubscribeResult(response.result);
    this.callbacks.onExtranonce?.(this.subscription);
    this.setState('SUBSCRIBED');
    return this.subscription;
  }

  async authorize(): Promise<void> {
    if (this.state !== 'SUBSCRIBED') throw new Error(`Cannot authorize from ${this.state}`);
    this.setState('AUTHORIZING');
    const response = await this.request('mining.authorize', [this.endpoint.username, this.endpoint.password]);
    if (response.error || response.result !== true) {
      this.setState('DISCONNECTED');
      throw new Error(response.error?.[1] ?? 'Upstream authorization rejected');
    }
    this.setState('ACTIVE');
  }

  async connectAuthorizeWithRetry(maximumAttempts = 5, signal?: AbortSignal): Promise<UpstreamSubscription> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      if (signal?.aborted) throw new Error('Upstream connection aborted');
      try {
        const subscription = await this.connectAndSubscribe();
        await this.authorize();
        return subscription;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.callbacks.onError?.(lastError);
        this.destroySocket(lastError);
        if (attempt + 1 >= maximumAttempts) break;
        if (this.state !== 'RECONNECTING') this.setState('RECONNECTING');
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, exponentialBackoffMs(attempt));
          const abort = () => {
            clearTimeout(timer);
            reject(new Error('Upstream connection aborted'));
          };
          signal?.addEventListener('abort', abort, { once: true });
        });
        this.setState('CONNECTING');
      }
    }
    throw lastError ?? new Error('Upstream connection failed');
  }

  async submit(input: UpstreamSubmitInput): Promise<UpstreamShareResult> {
    if (this.state !== 'ACTIVE') throw new Error(`Cannot submit upstream from ${this.state}`);
    const params: MiningSubmitRequest = {
      workerName: input.workerName ?? this.endpoint.username,
      jobId: input.jobId,
      extranonce2: input.extranonce2,
      networkTime: input.networkTime,
      nonce: input.nonce,
      versionBits: input.versionBits,
    };
    const ordered = [params.workerName, params.jobId, params.extranonce2, params.networkTime, params.nonce];
    if (params.versionBits !== undefined) ordered.push(params.versionBits);
    const response = await this.request('mining.submit', ordered);
    if (response.error || response.result !== true) {
      return {
        accepted: false,
        errorCode: response.error?.[0],
        errorMessage: response.error?.[1] ?? 'Upstream rejected share',
      };
    }
    return { accepted: true };
  }

  close(): void {
    this.stopped = true;
    this.jobs.invalidateAll();
    this.correlator.rejectAll(new Error('Upstream client stopped'));
    this.socket?.destroy();
    this.socket = undefined;
    if (this.state !== 'STOPPED') this.setState('STOPPED');
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
        reject(new Error('Upstream connection timed out'));
      }, this.endpoint.connectTimeoutMs);
      const connectedEvent = this.endpoint.tls ? 'secureConnect' : 'connect';
      socket.once(connectedEvent, () => {
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
    socket.on('data', (chunk: string) => this.consume(chunk));
    socket.on('error', (error) => this.callbacks.onError?.(error));
    socket.on('close', () => {
      const reason = new Error('Upstream connection closed');
      this.jobs.invalidateAll();
      this.correlator.rejectAll(reason);
      if (!this.stopped && this.state !== 'DISCONNECTED' && this.state !== 'RECONNECTING') {
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
        this.destroySocket(new Error('Upstream line exceeded maximum size'));
        return;
      }
      const line = raw.trim();
      if (line) {
        try {
          this.handleMessage(line);
        } catch (error) {
          const parsed = error instanceof Error ? error : new Error(String(error));
          this.callbacks.onError?.(parsed);
          this.destroySocket(parsed);
          return;
        }
      }
      newline = this.buffer.indexOf('\n');
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > this.endpoint.maximumLineBytes) {
      this.destroySocket(new Error('Unfinished upstream line exceeded maximum size'));
    }
  }

  private handleMessage(line: string): void {
    const message = parseStratumMessage(line);
    if (!('method' in message)) {
      this.correlator.resolve(message);
      return;
    }

    switch (message.method) {
      case 'mining.set_difficulty': {
        const parsed = parseMiningSetDifficulty(message.params);
        this.difficulty = parsed.difficulty;
        this.callbacks.onDifficulty?.(this.difficulty);
        return;
      }
      case 'mining.set_extranonce': {
        const parsed = parseMiningSetExtranonce(message.params);
        this.subscription = parsed;
        this.jobs.invalidateAll();
        this.callbacks.onExtranonce?.(parsed);
        return;
      }
      case 'mining.notify': {
        if (!this.subscription) throw new Error('Received mining.notify before extranonce assignment');
        const notification = parseMiningNotify(message.params);
        const job = normalizeUpstreamJob({
          notification,
          extranonce1: this.subscription.extranonce1,
          extranonce2Size: this.subscription.extranonce2Size,
          assignedDifficulty: this.difficulty,
        });
        this.jobs.add(job);
        this.callbacks.onJob?.(job);
        return;
      }
      case 'client.reconnect':
        this.destroySocket(new Error('Upstream requested reconnect'));
        return;
      default:
        return;
    }
  }

  private async request(method: string, params: unknown[]): Promise<StratumResponse> {
    if (!this.socket || this.socket.destroyed) throw new Error('Upstream socket is not connected');
    const pending = this.correlator.create(this.endpoint.responseTimeoutMs);
    this.socket.write(serializeStratumRequest({ id: pending.id, method, params }));
    return pending.response;
  }

  private destroySocket(error: Error): void {
    this.correlator.rejectAll(error);
    this.socket?.destroy();
    this.socket = undefined;
    this.jobs.invalidateAll();
  }

  private setState(next: UpstreamSessionState): void {
    if (this.state === next) return;
    this.state = transitionUpstreamState(this.state, next);
    this.callbacks.onState?.(this.state);
  }
}
