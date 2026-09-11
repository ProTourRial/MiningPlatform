/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomUUID } from 'node:crypto';
import {
  RandomXPoolAdapter,
  type RandomXPoolAdapterCallbacks,
  type RandomXPoolAdapterOptions,
  type UpstreamEndpoint,
} from '@mining/upstream-stratum';
import { randomXJobFingerprint, type RandomXJob } from '@mining/randomx';
import { projectRandomXMinerJob, type RandomXMinerJobAssignment } from './miner-protocol.js';
import type {
  RandomXMinerPrincipal,
  RandomXMinerSubmissionGateway,
  RandomXMinerWorkProvider,
} from './miner-server.js';
import type { RandomXSubmissionOutcome } from './submission-contract.js';
import type { RandomXGatewayUpstream } from './submission-coordinator.js';

const DEFAULT_MAXIMUM_RETAINED_JOBS = 16;

export interface RandomXDedicatedUpstreamSession extends RandomXGatewayUpstream {
  start(): Promise<{ sessionId: string; job: RandomXJob }>;
  close(): void;
}

export type RandomXDedicatedUpstreamCallbacks = Pick<
  RandomXPoolAdapterCallbacks,
  'onJob' | 'onError' | 'onDisconnect'
>;

export type RandomXDedicatedUpstreamSessionFactory = (input: {
  connectionId: string;
  worker: RandomXMinerPrincipal;
  callbacks: RandomXDedicatedUpstreamCallbacks;
}) => RandomXDedicatedUpstreamSession;

export type RandomXPerSessionSubmissionGatewayFactory = (
  upstream: RandomXGatewayUpstream,
) => RandomXMinerSubmissionGateway;

export type RandomXPoolAdapterSessionFactoryOptions = {
  upstreamPoolId: string;
  endpointFor(input: { connectionId: string; worker: RandomXMinerPrincipal }): UpstreamEndpoint;
  adapterOptions?: RandomXPoolAdapterOptions;
};

export type DedicatedRandomXUpstreamSessionsOptions = {
  maximumRetainedJobsPerConnection?: number;
  createMinerJobId?: () => string;
  onWorkAvailable?: (connectionId: string) => void;
  onError?: (error: Error, connectionId: string) => void;
};

type JobMapping = {
  minerJobId: string;
  upstreamJobId: string;
  upstreamFingerprint: string;
  assignment: RandomXMinerJobAssignment;
};

type ActiveSession = {
  connectionId: string;
  worker: RandomXMinerPrincipal;
  upstream: RandomXDedicatedUpstreamSession;
  submissionGateway: RandomXMinerSubmissionGateway;
  jobs: Map<string, JobMapping>;
  minerJobIdByUpstreamFingerprint: Map<string, string>;
  latestMinerJobId?: string;
  ready: boolean;
  connected: boolean;
  closed: boolean;
};

function boundedIdentifier(value: string, label: string): string {
  if (
    value.length === 0 ||
    value.length > 256 ||
    value !== value.trim() ||
    [...value].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new Error(`RandomX ${label} is invalid`);
  }
  return value;
}

function snapshotWorker(worker: RandomXMinerPrincipal): RandomXMinerPrincipal {
  return {
    workerId: boundedIdentifier(worker.workerId, 'worker id'),
    workerName: boundedIdentifier(worker.workerName, 'worker name'),
    miningAccountId: boundedIdentifier(worker.miningAccountId, 'mining account id'),
  };
}

function sameWorker(left: RandomXMinerPrincipal, right: RandomXMinerPrincipal): boolean {
  return (
    left.workerId === right.workerId &&
    left.workerName === right.workerName &&
    left.miningAccountId === right.miningAccountId
  );
}

function snapshotAssignment(assignment: RandomXMinerJobAssignment): RandomXMinerJobAssignment {
  return { ...assignment, expiresAt: new Date(assignment.expiresAt.getTime()) };
}

function normalizeMaximumRetainedJobs(value: number | undefined): number {
  const normalized = value ?? DEFAULT_MAXIMUM_RETAINED_JOBS;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 256) {
    throw new Error('RandomX per-connection retained job limit is invalid');
  }
  return normalized;
}

export function createRandomXPoolAdapterSessionFactory(
  options: RandomXPoolAdapterSessionFactoryOptions,
): RandomXDedicatedUpstreamSessionFactory {
  const upstreamPoolId = boundedIdentifier(options.upstreamPoolId, 'upstream pool id');
  return ({ connectionId, worker, callbacks }) => {
    const endpoint = options.endpointFor({
      connectionId: boundedIdentifier(connectionId, 'connection id'),
      worker: snapshotWorker(worker),
    });
    return new RandomXPoolAdapter(
      upstreamPoolId,
      { ...endpoint },
      callbacks,
      options.adapterOptions,
    );
  };
}

/**
 * Each authenticated miner gets an independent upstream authorization session.
 * This preserves upstream-issued blob authority and lets pools that personalize
 * work per login provide distinct search spaces. It must be wrapped by
 * UniqueRandomXMinerWorkProvider before a listener is enabled: a dedicated TCP
 * connection alone is not proof that the upstream blob is unique.
 */
export class DedicatedRandomXUpstreamSessions
  implements RandomXMinerWorkProvider, RandomXMinerSubmissionGateway
{
  private readonly maximumRetainedJobs: number;
  private readonly createMinerJobId: () => string;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly operationTails = new Map<string, Promise<void>>();
  private stopped = false;

  constructor(
    private readonly createUpstreamSession: RandomXDedicatedUpstreamSessionFactory,
    private readonly createSubmissionGateway: RandomXPerSessionSubmissionGatewayFactory,
    private readonly options: DedicatedRandomXUpstreamSessionsOptions = {},
  ) {
    this.maximumRetainedJobs = normalizeMaximumRetainedJobs(
      options.maximumRetainedJobsPerConnection,
    );
    this.createMinerJobId = options.createMinerJobId ?? randomUUID;
  }

  async assign(input: {
    connectionId: string;
    worker: RandomXMinerPrincipal;
  }): Promise<RandomXMinerJobAssignment | undefined> {
    const connectionId = boundedIdentifier(input.connectionId, 'connection id');
    const worker = snapshotWorker(input.worker);
    return this.withConnectionLock(connectionId, async () => {
      if (this.stopped) throw new Error('RandomX dedicated upstream sessions are stopped');
      let session = this.sessions.get(connectionId);
      if (session && !sameWorker(session.worker, worker)) {
        throw new Error('RandomX connection cannot replace its authenticated worker');
      }
      if (!session || !session.connected || !session.upstream.activeSessionId) {
        if (session) this.destroySession(session);
        session = await this.openSession(connectionId, worker);
        this.sessions.set(connectionId, session);
      }
      const mapping = this.latestLiveMapping(session);
      return mapping ? snapshotAssignment(mapping.assignment) : undefined;
    });
  }

  async resolve(
    connectionIdValue: string,
    minerJobIdValue: string,
  ): Promise<{ upstreamJobId: string } | undefined> {
    const connectionId = boundedIdentifier(connectionIdValue, 'connection id');
    const minerJobId = boundedIdentifier(minerJobIdValue, 'miner job id');
    return this.withConnectionLock(connectionId, async () => {
      const session = this.sessions.get(connectionId);
      if (!session || !session.connected || !session.upstream.activeSessionId) return undefined;
      const mapping = session.jobs.get(minerJobId);
      if (!mapping || !this.mappingIsLive(session, mapping)) return undefined;
      return { upstreamJobId: mapping.upstreamJobId };
    });
  }

  async submit(input: {
    connectionId: string;
    correlationId: string;
    submission: Parameters<RandomXMinerSubmissionGateway['submit']>[0]['submission'];
  }): Promise<RandomXSubmissionOutcome> {
    const connectionId = boundedIdentifier(input.connectionId, 'connection id');
    return this.withConnectionLock(connectionId, async () => {
      const session = this.sessions.get(connectionId);
      if (!session || !session.connected || !session.upstream.activeSessionId) {
        return { status: 'JOB_UNAVAILABLE', reason: 'UNKNOWN_OR_STALE_JOB', replayed: false };
      }
      return session.submissionGateway.submit(input);
    });
  }

  async release(connectionIdValue: string): Promise<void> {
    const connectionId = boundedIdentifier(connectionIdValue, 'connection id');
    await this.withConnectionLock(connectionId, async () => {
      const session = this.sessions.get(connectionId);
      this.sessions.delete(connectionId);
      if (session) this.destroySession(session);
    });
  }

  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const connectionIds = [...this.sessions.keys()];
    const results = await Promise.allSettled(
      connectionIds.map((connectionId) =>
        this.withConnectionLock(connectionId, async () => {
          const session = this.sessions.get(connectionId);
          this.sessions.delete(connectionId);
          if (session) this.destroySession(session);
        }),
      ),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        'RandomX dedicated upstream sessions did not close cleanly',
      );
    }
  }

  private async openSession(
    connectionId: string,
    worker: RandomXMinerPrincipal,
  ): Promise<ActiveSession> {
    const holder: { session?: ActiveSession } = {};
    const callbacks: RandomXDedicatedUpstreamCallbacks = {
      onJob: (job) => {
        const session = holder.session;
        if (!session || session.closed) return;
        try {
          this.recordJob(session, job);
          if (session.ready) this.options.onWorkAvailable?.(connectionId);
        } catch (error) {
          this.report(error, connectionId);
          session.connected = false;
        }
      },
      onError: (error) => this.report(error, connectionId),
      onDisconnect: (error) => {
        const session = holder.session;
        if (!session || session.closed) return;
        session.connected = false;
        session.jobs.clear();
        session.minerJobIdByUpstreamFingerprint.clear();
        session.latestMinerJobId = undefined;
        this.report(error, connectionId);
      },
    };
    const upstream = this.createUpstreamSession({ connectionId, worker, callbacks });
    let submissionGateway: RandomXMinerSubmissionGateway;
    try {
      submissionGateway = this.createSubmissionGateway(upstream);
    } catch (error) {
      upstream.close();
      throw error;
    }
    const session: ActiveSession = {
      connectionId,
      worker: snapshotWorker(worker),
      upstream,
      submissionGateway,
      jobs: new Map(),
      minerJobIdByUpstreamFingerprint: new Map(),
      ready: false,
      connected: false,
      closed: false,
    };
    holder.session = session;
    try {
      const login = await upstream.start();
      if (this.stopped) throw new Error('RandomX dedicated upstream sessions stopped during login');
      if (!upstream.activeSessionId || upstream.activeSessionId !== login.sessionId) {
        throw new Error('RandomX upstream login did not establish the reported session');
      }
      if (!session.latestMinerJobId) this.recordJob(session, login.job);
      session.connected = true;
      session.ready = true;
      if (!this.latestLiveMapping(session)) {
        throw new Error('RandomX upstream login did not provide live mining work');
      }
      return session;
    } catch (error) {
      this.destroySession(session);
      throw error;
    }
  }

  private recordJob(session: ActiveSession, job: RandomXJob): void {
    if (session.closed) return;
    const activeSessionId = session.upstream.activeSessionId;
    if (activeSessionId && job.clientId !== activeSessionId) {
      throw new Error('RandomX upstream job belongs to a replaced session');
    }
    const upstreamFingerprint = randomXJobFingerprint(job);
    const existingMinerJobId = session.minerJobIdByUpstreamFingerprint.get(upstreamFingerprint);
    if (existingMinerJobId) {
      session.latestMinerJobId = existingMinerJobId;
      return;
    }
    const minerJobId = boundedIdentifier(this.createMinerJobId(), 'private miner job id');
    if (session.jobs.has(minerJobId)) {
      throw new Error('RandomX private miner job id collided within a connection');
    }
    const assignment: RandomXMinerJobAssignment = {
      minerJobId,
      upstreamJobId: boundedIdentifier(job.id, 'upstream job id'),
      algorithm: job.algorithm,
      blob: job.blob,
      target: job.target,
      seedHash: job.seedHash,
      ...(job.height === undefined ? {} : { height: job.height }),
      expiresAt: new Date(job.expiresAt.getTime()),
    };
    projectRandomXMinerJob(assignment);
    session.jobs.set(minerJobId, {
      minerJobId,
      upstreamJobId: assignment.upstreamJobId,
      upstreamFingerprint,
      assignment: snapshotAssignment(assignment),
    });
    session.minerJobIdByUpstreamFingerprint.set(upstreamFingerprint, minerJobId);
    session.latestMinerJobId = minerJobId;
    while (session.jobs.size > this.maximumRetainedJobs) {
      const oldestMinerJobId = session.jobs.keys().next().value as string | undefined;
      if (!oldestMinerJobId) break;
      const oldest = session.jobs.get(oldestMinerJobId);
      session.jobs.delete(oldestMinerJobId);
      if (oldest) {
        session.minerJobIdByUpstreamFingerprint.delete(oldest.upstreamFingerprint);
      }
    }
  }

  private latestLiveMapping(session: ActiveSession): JobMapping | undefined {
    const candidates = [...session.jobs.values()].reverse();
    for (const mapping of candidates) {
      if (this.mappingIsLive(session, mapping)) {
        session.latestMinerJobId = mapping.minerJobId;
        return mapping;
      }
    }
    session.latestMinerJobId = undefined;
    return undefined;
  }

  private mappingIsLive(session: ActiveSession, mapping: JobMapping): boolean {
    const activeSessionId = session.upstream.activeSessionId;
    if (!activeSessionId) return false;
    const authoritative = session.upstream.getJob(mapping.upstreamJobId);
    if (!authoritative || authoritative.clientId !== activeSessionId) return false;
    return randomXJobFingerprint(authoritative) === mapping.upstreamFingerprint;
  }

  private destroySession(session: ActiveSession): void {
    if (session.closed) return;
    session.closed = true;
    session.connected = false;
    session.jobs.clear();
    session.minerJobIdByUpstreamFingerprint.clear();
    session.latestMinerJobId = undefined;
    session.upstream.close();
  }

  private report(error: unknown, connectionId: string): void {
    const normalized = error instanceof Error ? error : new Error('Unknown RandomX upstream error');
    this.options.onError?.(normalized, connectionId);
  }

  private async withConnectionLock<T>(
    connectionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operationTails.get(connectionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.operationTails.set(connectionId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.operationTails.get(connectionId) === tail) {
        this.operationTails.delete(connectionId);
      }
    }
  }
}
