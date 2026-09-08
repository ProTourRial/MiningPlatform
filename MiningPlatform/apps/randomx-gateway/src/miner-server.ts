/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHmac, randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import type { RandomXShareSubmission } from '@mining/randomx';
import {
  RandomXSubmissionUncertainError,
  type RandomXSubmissionOutcome,
} from './submission-contract.js';
import type { RandomXGatewayIdentityResolver } from './submission-coordinator.js';
import {
  parseRandomXMinerLine,
  projectRandomXMinerJob,
  serializeRandomXMinerError,
  serializeRandomXMinerJobNotification,
  serializeRandomXMinerResult,
  type RandomXMinerJobAssignment,
  type RandomXMinerJsonRpcId,
} from './miner-protocol.js';

const INVALID_REQUEST = -32600;
const UNAUTHORIZED = -32000;
const STALE_JOB = -32001;
const SHARE_REJECTED = -32002;
const OUTCOME_UNCERTAIN = -32003;
const RATE_LIMITED = -32004;
const WORK_UNAVAILABLE = -32005;
const INTERNAL_ERROR = -32603;

export type RandomXMinerPrincipal = {
  workerId: string;
  workerName: string;
  miningAccountId: string;
};

export type RandomXMinerAuthenticationContext = {
  connectionId: string;
  remoteIpHash: string;
  agent?: string;
};

export type RandomXMinerAuthenticationResult =
  | { authenticated: true; worker: RandomXMinerPrincipal }
  | { authenticated: false; code: string };

export interface RandomXMinerAuthenticator {
  authenticate(
    login: string,
    password: string,
    context: RandomXMinerAuthenticationContext,
  ): Promise<RandomXMinerAuthenticationResult>;
  close?(): Promise<void>;
}

export interface RandomXMinerWorkProvider {
  assign(input: {
    connectionId: string;
    worker: RandomXMinerPrincipal;
  }): Promise<RandomXMinerJobAssignment | undefined>;
  resolve(connectionId: string, minerJobId: string): Promise<{ upstreamJobId: string } | undefined>;
  release(connectionId: string): Promise<void>;
  close?(): Promise<void>;
}

export interface RandomXMinerSubmissionGateway {
  submit(input: {
    connectionId: string;
    correlationId: string;
    submission: RandomXShareSubmission;
  }): Promise<RandomXSubmissionOutcome>;
}

export type RandomXMinerServerConfig = {
  host: string;
  port: number;
  ipHashKey: string;
  maximumConnections: number;
  maximumLineBytes: number;
  maximumPendingMessages: number;
  maximumSubmissionsPerMinute: number;
  socketTimeoutMs: number;
};

export type RandomXMinerServerDependencies = {
  authenticator: RandomXMinerAuthenticator;
  workProvider: RandomXMinerWorkProvider;
  submissionGateway: RandomXMinerSubmissionGateway;
  registry?: RandomXConnectionRegistry;
  now?: () => Date;
  createId?: () => string;
  onError?: (error: Error, connectionId: string) => void;
};

type RandomXMinerSession = {
  id: string;
  socket: Socket;
  remoteIpHash: string;
  state: 'CONNECTED' | 'ACTIVE' | 'CLOSED';
  worker?: RandomXMinerPrincipal;
  agent?: string;
  processing: Promise<void>;
  pendingMessages: number;
  submissionWindowStartedAt: number;
  submissionsInWindow: number;
  cleanedUp: boolean;
};

function boundedIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    ![...value].some((character) => character.charCodeAt(0) < 0x20)
  );
}

function validatePrincipal(value: RandomXMinerPrincipal): RandomXMinerPrincipal {
  if (
    !value ||
    !boundedIdentifier(value.workerId) ||
    !boundedIdentifier(value.workerName) ||
    !boundedIdentifier(value.miningAccountId)
  ) {
    throw new Error('RandomX authenticator returned an invalid worker principal');
  }
  return { ...value };
}

function validateConfig(config: RandomXMinerServerConfig): void {
  if (!config.host.trim()) throw new Error('RandomX miner listener host is required');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65_535) {
    throw new Error('RandomX miner listener port is invalid');
  }
  if (Buffer.byteLength(config.ipHashKey, 'utf8') < 32) {
    throw new Error('RandomX miner IP hash key must contain at least 32 bytes');
  }
  for (const [name, value] of [
    ['maximumConnections', config.maximumConnections],
    ['maximumLineBytes', config.maximumLineBytes],
    ['maximumPendingMessages', config.maximumPendingMessages],
    ['maximumSubmissionsPerMinute', config.maximumSubmissionsPerMinute],
    ['socketTimeoutMs', config.socketTimeoutMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`RandomX miner ${name} must be a positive integer`);
    }
  }
}

function hashRemoteAddress(address: string | undefined, key: string): string {
  return createHmac('sha256', key)
    .update((address ?? 'unknown').replace(/^::ffff:/, ''))
    .digest('hex');
}

export class RandomXConnectionRegistry implements RandomXGatewayIdentityResolver {
  private readonly connections = new Map<string, RandomXMinerPrincipal>();

  authorize(connectionId: string, worker: RandomXMinerPrincipal): void {
    if (!boundedIdentifier(connectionId)) throw new Error('RandomX connection id is invalid');
    if (this.connections.has(connectionId)) {
      throw new Error('RandomX connection is already authenticated');
    }
    this.connections.set(connectionId, validatePrincipal(worker));
  }

  revoke(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  async resolveAuthenticatedWorker(connectionId: string): Promise<RandomXMinerPrincipal> {
    const worker = this.connections.get(connectionId);
    if (!worker) throw new Error('RandomX connection is not authenticated');
    return { ...worker };
  }
}

export class RandomXMinerServer {
  private readonly server: net.Server;
  private readonly registry: RandomXConnectionRegistry;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly sessions = new Map<string, RandomXMinerSession>();
  private listening = false;

  constructor(
    private readonly config: RandomXMinerServerConfig,
    private readonly dependencies: RandomXMinerServerDependencies,
  ) {
    validateConfig(config);
    this.registry = dependencies.registry ?? new RandomXConnectionRegistry();
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? randomUUID;
    this.server = net.createServer((socket) => this.acceptConnection(socket));
  }

  get identityResolver(): RandomXConnectionRegistry {
    return this.registry;
  }

  get listeningPort(): number {
    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('RandomX miner listener is not active');
    }
    return address.port;
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject);
        this.listening = true;
        resolve();
      });
    });
  }

  async publishNextJobs(): Promise<number> {
    let published = 0;
    for (const session of this.sessions.values()) {
      if (session.state !== 'ACTIVE' || !session.worker) continue;
      try {
        const assignment = await this.dependencies.workProvider.assign({
          connectionId: session.id,
          worker: session.worker,
        });
        if (this.sessions.get(session.id) !== session || session.socket.destroyed) {
          await this.dependencies.workProvider.release(session.id);
          continue;
        }
        if (!assignment || assignment.expiresAt.getTime() <= this.now().getTime()) continue;
        projectRandomXMinerJob(assignment);
        this.write(session, serializeRandomXMinerJobNotification(assignment));
        published += 1;
      } catch (error) {
        this.report(error, session.id);
        session.socket.destroy();
      }
    }
    return published;
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.values()];
    for (const session of sessions) session.socket.destroy();
    await Promise.allSettled(sessions.map((session) => session.processing));
    await Promise.allSettled(sessions.map((session) => this.cleanupSession(session)));
    if (this.listening) {
      await new Promise<void>((resolve, reject) =>
        this.server.close((error) => (error ? reject(error) : resolve())),
      );
      this.listening = false;
    }
    const dependencyClosures = await Promise.allSettled([
      Promise.resolve(this.dependencies.authenticator.close?.()),
      Promise.resolve(this.dependencies.workProvider.close?.()),
    ]);
    const closeFailures = dependencyClosures.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (closeFailures.length > 0) {
      throw new AggregateError(
        closeFailures.map((failure) => failure.reason),
        'RandomX miner dependencies did not close cleanly',
      );
    }
  }

  private acceptConnection(socket: Socket): void {
    if (this.sessions.size >= this.config.maximumConnections) {
      socket.end(serializeRandomXMinerError(null, RATE_LIMITED, 'Connection limit reached'));
      socket.destroySoon();
      return;
    }
    const session: RandomXMinerSession = {
      id: this.createId(),
      socket,
      remoteIpHash: hashRemoteAddress(socket.remoteAddress, this.config.ipHashKey),
      state: 'CONNECTED',
      processing: Promise.resolve(),
      pendingMessages: 0,
      submissionWindowStartedAt: this.now().getTime(),
      submissionsInWindow: 0,
      cleanedUp: false,
    };
    if (!boundedIdentifier(session.id)) {
      socket.destroy();
      return;
    }
    this.sessions.set(session.id, session);
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);
    socket.setTimeout(this.config.socketTimeoutMs);

    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (Buffer.byteLength(rawLine, 'utf8') > this.config.maximumLineBytes) {
          socket.destroy();
          return;
        }
        const line = rawLine.trim();
        if (line && !this.enqueue(session, line)) return;
        newlineIndex = buffer.indexOf('\n');
      }
      if (Buffer.byteLength(buffer, 'utf8') > this.config.maximumLineBytes) socket.destroy();
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', (error) => this.report(error, session.id));
    socket.on('close', () => {
      void this.cleanupSession(session).catch((error) => this.report(error, session.id));
    });
  }

  private enqueue(session: RandomXMinerSession, line: string): boolean {
    session.pendingMessages += 1;
    if (session.pendingMessages > this.config.maximumPendingMessages) {
      session.socket.destroy();
      return false;
    }
    session.processing = session.processing
      .then(() => this.handleLine(session, line))
      .catch((error) => {
        this.report(error, session.id);
        this.write(session, serializeRandomXMinerError(null, INTERNAL_ERROR, 'Request failed'));
      })
      .finally(() => {
        session.pendingMessages -= 1;
      });
    return true;
  }

  private async handleLine(session: RandomXMinerSession, line: string): Promise<void> {
    let request;
    try {
      request = parseRandomXMinerLine(line);
    } catch {
      this.write(session, serializeRandomXMinerError(null, INVALID_REQUEST, 'Invalid request'));
      return;
    }
    if (request.method === 'login') {
      await this.handleLogin(session, request.id, request.login, request.password, request.agent);
      return;
    }
    if (request.method === 'keepalived') {
      if (session.state !== 'ACTIVE' || request.sessionId !== session.id) {
        this.write(session, serializeRandomXMinerError(request.id, UNAUTHORIZED, 'Unauthorized'));
        return;
      }
      this.write(session, serializeRandomXMinerResult(request.id, { status: 'KEEPALIVED' }));
      return;
    }
    await this.handleSubmit(session, request.id, {
      sessionId: request.sessionId,
      minerJobId: request.minerJobId,
      nonce: request.nonce,
      result: request.result,
    });
  }

  private async handleLogin(
    session: RandomXMinerSession,
    requestId: RandomXMinerJsonRpcId,
    login: string,
    password: string,
    agent: string | undefined,
  ): Promise<void> {
    if (session.state !== 'CONNECTED') {
      this.write(
        session,
        serializeRandomXMinerError(requestId, INVALID_REQUEST, 'Already logged in'),
      );
      return;
    }
    const authentication = await this.dependencies.authenticator.authenticate(login, password, {
      connectionId: session.id,
      remoteIpHash: session.remoteIpHash,
      ...(agent ? { agent } : {}),
    });
    if (this.sessions.get(session.id) !== session || session.socket.destroyed) return;
    if (!authentication.authenticated) {
      this.write(session, serializeRandomXMinerError(requestId, UNAUTHORIZED, 'Login failed'));
      return;
    }
    const worker = validatePrincipal(authentication.worker);
    this.registry.authorize(session.id, worker);
    try {
      const assignment = await this.dependencies.workProvider.assign({
        connectionId: session.id,
        worker,
      });
      if (this.sessions.get(session.id) !== session || session.socket.destroyed) {
        await this.dependencies.workProvider.release(session.id);
        return;
      }
      if (!assignment || assignment.expiresAt.getTime() <= this.now().getTime()) {
        throw new Error('RandomX work is unavailable');
      }
      const job = projectRandomXMinerJob(assignment);
      if (this.sessions.get(session.id) !== session || session.socket.destroyed) return;
      session.worker = worker;
      session.agent = agent;
      session.state = 'ACTIVE';
      this.write(
        session,
        serializeRandomXMinerResult(requestId, { id: session.id, job, status: 'OK' }),
      );
    } catch (error) {
      this.registry.revoke(session.id);
      await this.dependencies.workProvider.release(session.id);
      this.report(error, session.id);
      this.write(
        session,
        serializeRandomXMinerError(requestId, WORK_UNAVAILABLE, 'Mining work is unavailable'),
      );
    }
  }

  private async handleSubmit(
    session: RandomXMinerSession,
    requestId: RandomXMinerJsonRpcId,
    proof: { sessionId: string; minerJobId: string; nonce: string; result: string },
  ): Promise<void> {
    if (session.state !== 'ACTIVE' || !session.worker || proof.sessionId !== session.id) {
      this.write(session, serializeRandomXMinerError(requestId, UNAUTHORIZED, 'Unauthorized'));
      return;
    }
    const now = this.now();
    if (now.getTime() - session.submissionWindowStartedAt >= 60_000) {
      session.submissionWindowStartedAt = now.getTime();
      session.submissionsInWindow = 0;
    }
    session.submissionsInWindow += 1;
    if (session.submissionsInWindow > this.config.maximumSubmissionsPerMinute) {
      this.write(
        session,
        serializeRandomXMinerError(requestId, RATE_LIMITED, 'Rate limit exceeded'),
      );
      return;
    }
    const resolved = await this.dependencies.workProvider.resolve(session.id, proof.minerJobId);
    if (!resolved || !boundedIdentifier(resolved.upstreamJobId)) {
      this.write(session, serializeRandomXMinerError(requestId, STALE_JOB, 'Unknown or stale job'));
      return;
    }
    try {
      const outcome = await this.dependencies.submissionGateway.submit({
        connectionId: session.id,
        correlationId: this.createId(),
        submission: {
          workerName: session.worker.workerName,
          jobId: resolved.upstreamJobId,
          nonce: proof.nonce,
          result: proof.result,
          submittedAt: now,
        },
      });
      if (outcome.status === 'ACCEPTED_ENQUEUED') {
        this.write(session, serializeRandomXMinerResult(requestId, { status: 'OK' }));
        return;
      }
      if (outcome.status === 'JOB_UNAVAILABLE') {
        this.write(
          session,
          serializeRandomXMinerError(requestId, STALE_JOB, 'Unknown or stale job'),
        );
        return;
      }
      this.write(session, serializeRandomXMinerError(requestId, SHARE_REJECTED, 'Share rejected'));
    } catch (error) {
      this.report(error, session.id);
      if (error instanceof RandomXSubmissionUncertainError) {
        this.write(
          session,
          serializeRandomXMinerError(
            requestId,
            OUTCOME_UNCERTAIN,
            'Share outcome is uncertain; do not retry automatically',
          ),
        );
        return;
      }
      this.write(session, serializeRandomXMinerError(requestId, INTERNAL_ERROR, 'Request failed'));
    }
  }

  private write(session: RandomXMinerSession, payload: string): void {
    if (session.state === 'CLOSED' || session.socket.destroyed) return;
    if (!session.socket.write(payload)) {
      session.socket.pause();
      session.socket.once('drain', () => session.socket.resume());
    }
  }

  private async cleanupSession(session: RandomXMinerSession): Promise<void> {
    if (session.cleanedUp) return;
    session.cleanedUp = true;
    session.state = 'CLOSED';
    this.sessions.delete(session.id);
    this.registry.revoke(session.id);
    await this.dependencies.workProvider.release(session.id);
  }

  private report(error: unknown, connectionId: string): void {
    const normalized = error instanceof Error ? error : new Error('Unknown RandomX miner error');
    this.dependencies.onError?.(normalized, connectionId);
  }
}
