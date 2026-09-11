/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import net, { type Server, type Socket } from 'node:net';
import test from 'node:test';
import type { RandomXJob } from '@mining/randomx';
import {
  DedicatedRandomXUpstreamSessions,
  createRandomXPoolAdapterSessionFactory,
  type RandomXDedicatedUpstreamCallbacks,
  type RandomXDedicatedUpstreamSession,
} from './dedicated-upstream-sessions.js';
import type { RandomXMinerPrincipal, RandomXMinerSubmissionGateway } from './miner-server.js';
import type { RandomXGatewayUpstream } from './submission-coordinator.js';
import {
  UniqueRandomXMinerWorkProvider,
  type RandomXWorkLeaseReceipt,
  type RandomXWorkLeaseStore,
} from './work-isolation.js';

const now = new Date('2026-09-08T03:00:00.000Z');
const worker: RandomXMinerPrincipal = {
  workerId: 'worker-randomx-1',
  workerName: 'account.cpu-1',
  miningAccountId: 'account-randomx-1',
};

function job(sessionId: string, id: string, marker: string): RandomXJob {
  return {
    id,
    clientId: sessionId,
    algorithm: 'rx/0',
    blob: marker.repeat(80),
    target: 'ffffffff',
    seedHash: '11'.repeat(32),
    height: 3_456_789n,
    receivedAt: new Date(now),
    expiresAt: new Date(now.getTime() + 60_000),
  };
}

class FakeUpstreamSession implements RandomXDedicatedUpstreamSession {
  readonly id = 'randomx-pool-1';
  private sessionId?: string;
  private readonly jobs = new Map<string, RandomXJob>();
  closed = false;

  constructor(
    readonly expectedSessionId: string,
    initialJob: RandomXJob,
    private readonly callbacks: RandomXDedicatedUpstreamCallbacks,
  ) {
    this.jobs.set(initialJob.id, initialJob);
  }

  get activeSessionId(): string | undefined {
    return this.sessionId;
  }

  async start(): Promise<{ sessionId: string; job: RandomXJob }> {
    const initial = [...this.jobs.values()][0];
    assert.ok(initial);
    this.sessionId = this.expectedSessionId;
    this.callbacks.onJob?.(initial);
    return { sessionId: this.expectedSessionId, job: initial };
  }

  getJob(jobId: string): RandomXJob | undefined {
    const value = this.jobs.get(jobId);
    return value
      ? {
          ...value,
          receivedAt: new Date(value.receivedAt),
          expiresAt: new Date(value.expiresAt),
        }
      : undefined;
  }

  async submit(): Promise<{ accepted: boolean }> {
    return { accepted: true };
  }

  emit(nextJob: RandomXJob): void {
    this.jobs.set(nextJob.id, nextJob);
    this.callbacks.onJob?.(nextJob);
  }

  disconnect(): void {
    this.sessionId = undefined;
    this.jobs.clear();
    this.callbacks.onDisconnect?.(new Error('test disconnect'));
  }

  close(): void {
    this.closed = true;
    this.sessionId = undefined;
    this.jobs.clear();
  }
}

function acceptedGateway(
  submissions: Array<{ upstream: RandomXGatewayUpstream; connectionId: string }>,
): (upstream: RandomXGatewayUpstream) => RandomXMinerSubmissionGateway {
  return (upstream) => ({
    async submit(input) {
      submissions.push({ upstream, connectionId: input.connectionId });
      return {
        status: 'ACCEPTED_ENQUEUED',
        intentId: `intent-${input.connectionId}`,
        decisionId: `decision-${input.connectionId}`,
        outboxEventId: `event-${input.connectionId}`,
        replayed: false,
      };
    },
  });
}

test('dedicates upstream sessions, hides upstream ids, and routes each submission to its owner', async () => {
  const sessions: FakeUpstreamSession[] = [];
  const submissions: Array<{ upstream: RandomXGatewayUpstream; connectionId: string }> = [];
  const privateIds = ['private-job-a', 'private-job-b'];
  const provider = new DedicatedRandomXUpstreamSessions(
    ({ callbacks }) => {
      const ordinal = sessions.length + 1;
      const sessionId = `upstream-session-${ordinal}`;
      const session = new FakeUpstreamSession(
        sessionId,
        job(sessionId, `upstream-job-${ordinal}`, ordinal === 1 ? '00' : '22'),
        callbacks,
      );
      sessions.push(session);
      return session;
    },
    acceptedGateway(submissions),
    { createMinerJobId: () => privateIds.shift() ?? 'unexpected-private-job' },
  );

  const first = await provider.assign({ connectionId: 'connection-1', worker });
  const second = await provider.assign({ connectionId: 'connection-2', worker });
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.minerJobId, 'private-job-a');
  assert.equal(first.upstreamJobId, 'upstream-job-1');
  assert.equal(second.minerJobId, 'private-job-b');
  assert.notEqual(first.blob, second.blob);
  assert.deepEqual(await provider.resolve('connection-1', first.minerJobId), {
    upstreamJobId: 'upstream-job-1',
  });
  assert.equal(await provider.resolve('connection-2', first.minerJobId), undefined);

  const outcome = await provider.submit({
    connectionId: 'connection-1',
    correlationId: 'correlation-1',
    submission: {
      workerName: worker.workerName,
      jobId: first.upstreamJobId,
      nonce: '01020304',
      result: '33'.repeat(32),
      submittedAt: new Date(now),
    },
  });
  assert.equal(outcome.status, 'ACCEPTED_ENQUEUED');
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0]?.upstream, sessions[0]);

  await provider.release('connection-1');
  assert.equal(sessions[0]?.closed, true);
  assert.equal(sessions[1]?.closed, false);
  await provider.close();
  assert.equal(sessions[1]?.closed, true);
});

test('publishes fresh private jobs, evicts stale mappings, and replaces disconnected sessions', async () => {
  const sessions: FakeUpstreamSession[] = [];
  const workAvailable: string[] = [];
  const errors: string[] = [];
  const privateIds = ['private-job-1', 'private-job-2', 'private-job-3'];
  const provider = new DedicatedRandomXUpstreamSessions(
    ({ callbacks }) => {
      const ordinal = sessions.length + 1;
      const sessionId = `upstream-session-${ordinal}`;
      const session = new FakeUpstreamSession(
        sessionId,
        job(sessionId, `upstream-job-${ordinal}-a`, ordinal === 1 ? '00' : '44'),
        callbacks,
      );
      sessions.push(session);
      return session;
    },
    acceptedGateway([]),
    {
      maximumRetainedJobsPerConnection: 1,
      createMinerJobId: () => privateIds.shift() ?? 'unexpected-private-job',
      onWorkAvailable: (connectionId) => workAvailable.push(connectionId),
      onError: (error) => errors.push(error.message),
    },
  );

  const initial = await provider.assign({ connectionId: 'connection-1', worker });
  assert.ok(initial);
  const firstSession = sessions[0];
  assert.ok(firstSession);
  const notification = job(firstSession.expectedSessionId, 'upstream-job-1-b', '22');
  firstSession.emit(notification);
  assert.deepEqual(workAvailable, ['connection-1']);

  const refreshed = await provider.assign({ connectionId: 'connection-1', worker });
  assert.ok(refreshed);
  assert.equal(refreshed.minerJobId, 'private-job-2');
  assert.equal(refreshed.upstreamJobId, 'upstream-job-1-b');
  assert.equal(await provider.resolve('connection-1', initial.minerJobId), undefined);
  assert.deepEqual(await provider.resolve('connection-1', refreshed.minerJobId), {
    upstreamJobId: refreshed.upstreamJobId,
  });

  firstSession.disconnect();
  const replacement = await provider.assign({ connectionId: 'connection-1', worker });
  assert.ok(replacement);
  assert.equal(sessions.length, 2);
  assert.equal(firstSession.closed, true);
  assert.equal(replacement.minerJobId, 'private-job-3');
  assert.deepEqual(errors, ['test disconnect']);
  await provider.close();
});

test('refuses authenticated worker replacement on an existing connection', async () => {
  const sessionId = 'upstream-session-1';
  const provider = new DedicatedRandomXUpstreamSessions(
    ({ callbacks }) =>
      new FakeUpstreamSession(sessionId, job(sessionId, 'upstream-job-1', '00'), callbacks),
    acceptedGateway([]),
    { createMinerJobId: () => 'private-job-1' },
  );
  await provider.assign({ connectionId: 'connection-1', worker });
  await assert.rejects(
    provider.assign({
      connectionId: 'connection-1',
      worker: { ...worker, workerId: 'worker-randomx-2' },
    }),
    /cannot replace its authenticated worker/,
  );
  await provider.close();
});

test('closes a newly created upstream session when gateway composition fails', async () => {
  const sessionId = 'upstream-session-1';
  let upstream: FakeUpstreamSession | undefined;
  const provider = new DedicatedRandomXUpstreamSessions(
    ({ callbacks }) => {
      upstream = new FakeUpstreamSession(
        sessionId,
        job(sessionId, 'upstream-job-1', '00'),
        callbacks,
      );
      return upstream;
    },
    () => {
      throw new Error('gateway composition rejected');
    },
    { createMinerJobId: () => 'private-job-1' },
  );

  await assert.rejects(
    provider.assign({ connectionId: 'connection-1', worker }),
    /gateway composition rejected/,
  );
  assert.equal(upstream?.closed, true);
  await provider.close();
});

class MemoryLeaseStore implements RandomXWorkLeaseStore {
  private readonly owners = new Map<string, string>();

  async acquire(input: {
    fingerprint: string;
    owner: string;
    expiresAt: Date;
  }): Promise<RandomXWorkLeaseReceipt | undefined> {
    const owner = this.owners.get(input.fingerprint);
    if (owner && owner !== input.owner) return undefined;
    this.owners.set(input.fingerprint, input.owner);
    return {
      status: owner ? 'RENEWED' : 'ACQUIRED',
      fingerprint: input.fingerprint,
      acquiredAt: new Date(now),
      expiresAt: new Date(input.expiresAt),
    };
  }

  async owns(fingerprint: string, owner: string): Promise<boolean> {
    return this.owners.get(fingerprint) === owner;
  }

  async release(fingerprint: string, owner: string): Promise<void> {
    if (this.owners.get(fingerprint) === owner) this.owners.delete(fingerprint);
  }
}

test('dedicated sessions still fail closed when upstream issues an identical search space', async () => {
  const sessions: FakeUpstreamSession[] = [];
  const privateIds = ['private-job-a', 'private-job-b', 'private-job-c'];
  const source = new DedicatedRandomXUpstreamSessions(
    ({ callbacks }) => {
      const ordinal = sessions.length + 1;
      const sessionId = `upstream-session-${ordinal}`;
      const session = new FakeUpstreamSession(
        sessionId,
        job(sessionId, `upstream-job-${ordinal}`, '00'),
        callbacks,
      );
      sessions.push(session);
      return session;
    },
    acceptedGateway([]),
    { createMinerJobId: () => privateIds.shift() ?? 'unexpected-private-job' },
  );
  const owners = ['lease-owner-connection-0001', 'lease-owner-connection-0002'];
  const provider = new UniqueRandomXMinerWorkProvider(source, new MemoryLeaseStore(), {
    createOwner: () => owners.shift() ?? 'lease-owner-connection-9999',
  });

  const first = await provider.assign({ connectionId: 'connection-1', worker });
  assert.ok(first);
  await assert.rejects(
    provider.assign({ connectionId: 'connection-2', worker }),
    /already leased to another active miner/,
  );
  assert.equal(sessions[0]?.closed, false);
  assert.equal(sessions[1]?.closed, true, 'colliding dedicated session must be torn down');

  await provider.release('connection-1');
  const reassigned = await provider.assign({ connectionId: 'connection-2', worker });
  assert.ok(reassigned, 'released work may be issued through a fresh upstream session');
  assert.equal(sessions.length, 3);
  await provider.close();
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test upstream did not bind');
  return address.port;
}

async function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test('concrete factory authorizes a real RandomXPoolAdapter session with worker-scoped credentials', async () => {
  const sockets = new Set<Socket>();
  const received: Array<Record<string, unknown>> = [];
  const upstreamJob = {
    job_id: 'real-upstream-job-1',
    blob: '00'.repeat(80),
    target: 'ffffffff',
    seed_hash: '11'.repeat(32),
    algo: 'rx/0',
    height: 3_456_789,
  };
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const request = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
        received.push(request);
        buffer = buffer.slice(newline + 1);
        socket.write(
          `${JSON.stringify({
            id: request.id,
            jsonrpc: '2.0',
            error: null,
            result: { id: 'real-upstream-session-1', status: 'OK', job: upstreamJob },
          })}\n`,
        );
        newline = buffer.indexOf('\n');
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  const factory = createRandomXPoolAdapterSessionFactory({
    upstreamPoolId: 'randomx-pool-1',
    endpointFor: ({ worker: authenticatedWorker }) => ({
      host: '127.0.0.1',
      port,
      userAgent: 'MiningPlatform/randomx-gateway-test',
      username: authenticatedWorker.workerName,
      password: 'upstream-password',
      connectTimeoutMs: 2_000,
      responseTimeoutMs: 2_000,
      maximumLineBytes: 4_096,
    }),
    adapterOptions: { now: () => new Date(now), jobTtlMilliseconds: 60_000 },
  });
  const provider = new DedicatedRandomXUpstreamSessions(factory, acceptedGateway([]), {
    createMinerJobId: () => 'private-real-job-1',
  });

  try {
    const assignment = await provider.assign({ connectionId: 'connection-real-1', worker });
    assert.ok(assignment);
    assert.equal(assignment.minerJobId, 'private-real-job-1');
    assert.equal(assignment.upstreamJobId, 'real-upstream-job-1');
    const login = received[0];
    assert.equal(login?.method, 'login');
    assert.deepEqual(login?.params, {
      login: worker.workerName,
      pass: 'upstream-password',
      agent: 'MiningPlatform/randomx-gateway-test',
    });
  } finally {
    await provider.close();
    await closeServer(server, sockets);
  }
});
