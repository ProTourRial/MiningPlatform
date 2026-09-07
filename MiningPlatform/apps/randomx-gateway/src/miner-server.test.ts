/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import net, { type Socket } from 'node:net';
import test from 'node:test';
import type { RandomXMinerJobAssignment } from './miner-protocol.js';
import {
  RandomXConnectionRegistry,
  RandomXMinerServer,
  type RandomXMinerAuthenticator,
  type RandomXMinerServerConfig,
  type RandomXMinerSubmissionGateway,
  type RandomXMinerWorkProvider,
} from './miner-server.js';
import { RandomXSubmissionUncertainError } from './submission-contract.js';

const now = new Date('2026-09-08T00:00:00.000Z');
const assignment: RandomXMinerJobAssignment = {
  minerJobId: 'miner-job-1',
  upstreamJobId: 'upstream-job-7',
  algorithm: 'rx/0',
  blob: '00'.repeat(80),
  target: 'ffffffff',
  seedHash: '11'.repeat(32),
  height: 3_456_789n,
  expiresAt: new Date(now.getTime() + 60_000),
};

const config: RandomXMinerServerConfig = {
  host: '127.0.0.1',
  port: 0,
  ipHashKey: 'randomx-miner-test-ip-key-with-32-bytes',
  maximumConnections: 8,
  maximumLineBytes: 2_048,
  maximumPendingMessages: 8,
  maximumSubmissionsPerMinute: 4,
  socketTimeoutMs: 5_000,
};

type JsonResponse = {
  id?: number | string | null;
  error?: { code: number; message: string } | null;
  result?: Record<string, unknown>;
};

class JsonLineClient {
  private buffer = '';
  private readonly lines: string[] = [];
  private readonly waiters: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(readonly socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let newline = this.buffer.indexOf('\n');
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        const waiter = this.waiters.shift();
        if (waiter) {
          clearTimeout(waiter.timer);
          waiter.resolve(line);
        } else {
          this.lines.push(line);
        }
        newline = this.buffer.indexOf('\n');
      }
    });
    socket.on('close', () => {
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Socket closed before a line was received'));
      }
    });
  }

  send(value: unknown): void {
    this.socket.write(`${JSON.stringify(value)}\n`);
  }

  async read(): Promise<JsonResponse> {
    const line = this.lines.shift() ?? (await this.waitForLine());
    return JSON.parse(line) as JsonResponse;
  }

  async close(): Promise<void> {
    if (this.socket.destroyed) return;
    const closed = new Promise<void>((resolve) => this.socket.once('close', () => resolve()));
    this.socket.end();
    await closed;
  }

  private waitForLine(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('Timed out waiting for RandomX miner response'));
      }, 2_000);
      this.waiters.push({ resolve, reject, timer });
    });
  }
}

async function connect(port: number): Promise<JsonLineClient> {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return new JsonLineClient(socket);
}

function fixtures(
  overrides: {
    authenticator?: RandomXMinerAuthenticator;
    workProvider?: RandomXMinerWorkProvider;
    submissionGateway?: RandomXMinerSubmissionGateway;
  } = {},
) {
  const assigned = new Map<string, RandomXMinerJobAssignment>();
  const releases: string[] = [];
  const submissions: Parameters<RandomXMinerSubmissionGateway['submit']>[0][] = [];
  const authenticator: RandomXMinerAuthenticator = overrides.authenticator ?? {
    async authenticate(login, password) {
      if (login !== 'account.worker' || password !== 'secret') {
        return { authenticated: false as const, code: 'INVALID_CREDENTIALS' };
      }
      return {
        authenticated: true as const,
        worker: {
          workerId: 'worker-1',
          workerName: 'account.worker',
          miningAccountId: 'account-1',
        },
      };
    },
  };
  const workProvider: RandomXMinerWorkProvider = overrides.workProvider ?? {
    async assign({ connectionId }) {
      const value = { ...assignment, expiresAt: new Date(assignment.expiresAt) };
      assigned.set(connectionId, value);
      return value;
    },
    async resolve(connectionId, minerJobId) {
      const value = assigned.get(connectionId);
      return value?.minerJobId === minerJobId ? { upstreamJobId: value.upstreamJobId } : undefined;
    },
    async release(connectionId) {
      assigned.delete(connectionId);
      releases.push(connectionId);
    },
  };
  const submissionGateway: RandomXMinerSubmissionGateway = overrides.submissionGateway ?? {
    async submit(input) {
      submissions.push(input);
      return {
        status: 'ACCEPTED_ENQUEUED' as const,
        intentId: 'intent-1',
        decisionId: 'decision-1',
        outboxEventId: 'event-1',
        replayed: false,
      };
    },
  };
  return { authenticator, workProvider, submissionGateway, releases, submissions };
}

function loginRequest(id = 1) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'login',
    params: { login: 'account.worker', pass: 'secret', agent: 'xmrig/6.test' },
  };
}

function submitRequest(sessionId: string, id = 2) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'submit',
    params: {
      id: sessionId,
      job_id: assignment.minerJobId,
      nonce: '01020304',
      result: '22'.repeat(32),
    },
  };
}

test('authenticates a miner, hides the upstream job id, and dispatches through the durable gateway', async () => {
  const dependencies = fixtures();
  const registry = new RandomXConnectionRegistry();
  const ids = ['connection-1', 'correlation-1'];
  const server = new RandomXMinerServer(config, {
    ...dependencies,
    registry,
    now: () => new Date(now),
    createId: () => ids.shift() ?? 'fallback-id',
  });
  await server.listen();
  const client = await connect(server.listeningPort);
  try {
    client.send(loginRequest());
    const login = await client.read();
    assert.equal(login.error, null);
    assert.equal(login.result?.status, 'OK');
    assert.equal(login.result?.id, 'connection-1');
    const job = login.result?.job as Record<string, unknown>;
    assert.equal(job.job_id, assignment.minerJobId);
    assert.equal(job.upstreamJobId, undefined);
    assert.deepEqual(await registry.resolveAuthenticatedWorker('connection-1'), {
      workerId: 'worker-1',
      workerName: 'account.worker',
      miningAccountId: 'account-1',
    });

    client.send(submitRequest('connection-1'));
    const submitted = await client.read();
    assert.equal(submitted.error, null);
    assert.deepEqual(submitted.result, { status: 'OK' });
    assert.equal(dependencies.submissions.length, 1);
    assert.equal(dependencies.submissions[0]?.connectionId, 'connection-1');
    assert.equal(dependencies.submissions[0]?.correlationId, 'correlation-1');
    assert.deepEqual(dependencies.submissions[0]?.submission, {
      workerName: 'account.worker',
      jobId: assignment.upstreamJobId,
      nonce: '01020304',
      result: '22'.repeat(32),
      submittedAt: now,
    });
  } finally {
    await client.close();
    await server.close();
  }
  await assert.rejects(registry.resolveAuthenticatedWorker('connection-1'), /not authenticated/);
  assert.deepEqual(dependencies.releases, ['connection-1']);
});

test('rejects unauthorized submissions and mismatched session ids without invoking the gateway', async () => {
  const dependencies = fixtures();
  const server = new RandomXMinerServer(config, {
    ...dependencies,
    now: () => new Date(now),
    createId: () => 'connection-2',
  });
  await server.listen();
  const client = await connect(server.listeningPort);
  try {
    client.send(submitRequest('connection-2'));
    assert.equal((await client.read()).error?.code, -32000);
    client.send(loginRequest());
    assert.equal((await client.read()).result?.status, 'OK');
    client.send(submitRequest('another-session'));
    assert.equal((await client.read()).error?.code, -32000);
    assert.equal(dependencies.submissions.length, 0);
  } finally {
    await client.close();
    await server.close();
  }
});

test('applies per-session submission rate limits before gateway side effects', async () => {
  const dependencies = fixtures();
  const server = new RandomXMinerServer(
    { ...config, maximumSubmissionsPerMinute: 1 },
    {
      ...dependencies,
      now: () => new Date(now),
      createId: (() => {
        let counter = 0;
        return () => `id-${++counter}`;
      })(),
    },
  );
  await server.listen();
  const client = await connect(server.listeningPort);
  try {
    client.send(loginRequest());
    const sessionId = String((await client.read()).result?.id);
    client.send(submitRequest(sessionId, 2));
    assert.equal((await client.read()).error, null);
    client.send(submitRequest(sessionId, 3));
    assert.equal((await client.read()).error?.code, -32004);
    assert.equal(dependencies.submissions.length, 1);
  } finally {
    await client.close();
    await server.close();
  }
});

test('fails closed when unique work is unavailable and never registers an active identity', async () => {
  const dependencies = fixtures({
    workProvider: {
      async assign() {
        return undefined;
      },
      async resolve() {
        return undefined;
      },
      async release() {},
    },
  });
  const registry = new RandomXConnectionRegistry();
  const server = new RandomXMinerServer(config, {
    ...dependencies,
    registry,
    now: () => new Date(now),
    createId: () => 'connection-no-work',
  });
  await server.listen();
  const client = await connect(server.listeningPort);
  try {
    client.send(loginRequest());
    assert.equal((await client.read()).error?.code, -32005);
    await assert.rejects(
      registry.resolveAuthenticatedWorker('connection-no-work'),
      /not authenticated/,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test('maps ambiguous post-intent outcomes without encouraging an automatic retry', async () => {
  const dependencies = fixtures({
    submissionGateway: {
      async submit() {
        throw new RandomXSubmissionUncertainError('intent-uncertain');
      },
    },
  });
  const server = new RandomXMinerServer(config, {
    ...dependencies,
    now: () => new Date(now),
    createId: (() => {
      let counter = 0;
      return () => `uncertain-${++counter}`;
    })(),
  });
  await server.listen();
  const client = await connect(server.listeningPort);
  try {
    client.send(loginRequest());
    const sessionId = String((await client.read()).result?.id);
    client.send(submitRequest(sessionId));
    const response = await client.read();
    assert.equal(response.error?.code, -32003);
    assert.match(response.error?.message ?? '', /do not retry automatically/);
  } finally {
    await client.close();
    await server.close();
  }
});

test('releases work assigned after a miner disconnects during authentication', async () => {
  let finishAssignment: ((value: RandomXMinerJobAssignment) => void) | undefined;
  let assignmentStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    assignmentStarted = resolve;
  });
  const activeAssignments = new Set<string>();
  const dependencies = fixtures({
    workProvider: {
      async assign({ connectionId }) {
        assignmentStarted?.();
        const value = await new Promise<RandomXMinerJobAssignment>((resolve) => {
          finishAssignment = resolve;
        });
        activeAssignments.add(connectionId);
        return value;
      },
      async resolve() {
        return undefined;
      },
      async release(connectionId) {
        activeAssignments.delete(connectionId);
      },
    },
  });
  const registry = new RandomXConnectionRegistry();
  const server = new RandomXMinerServer(config, {
    ...dependencies,
    registry,
    now: () => new Date(now),
    createId: () => 'disconnect-race',
  });
  await server.listen();
  const client = await connect(server.listeningPort);
  client.send(loginRequest());
  await started;
  await client.close();
  finishAssignment?.({ ...assignment, expiresAt: new Date(assignment.expiresAt) });
  await server.close();
  assert.equal(activeAssignments.size, 0);
  await assert.rejects(registry.resolveAuthenticatedWorker('disconnect-race'), /not authenticated/);
});

test('closes a connection whose unfinished line exceeds the configured byte limit', async () => {
  const dependencies = fixtures();
  const server = new RandomXMinerServer(
    { ...config, maximumLineBytes: 64 },
    { ...dependencies, now: () => new Date(now), createId: () => 'bounded-connection' },
  );
  await server.listen();
  const client = await connect(server.listeningPort);
  try {
    const closed = new Promise<void>((resolve) => client.socket.once('close', () => resolve()));
    client.socket.write('x'.repeat(65));
    await closed;
    assert.equal(dependencies.submissions.length, 0);
  } finally {
    await server.close();
  }
});

test('rejects connections beyond the configured global listener limit', async () => {
  const dependencies = fixtures();
  const server = new RandomXMinerServer(
    { ...config, maximumConnections: 1 },
    { ...dependencies, now: () => new Date(now), createId: () => 'only-connection' },
  );
  await server.listen();
  const first = await connect(server.listeningPort);
  const second = await connect(server.listeningPort);
  try {
    const response = await second.read();
    assert.equal(response.error?.code, -32004);
    assert.match(response.error?.message ?? '', /connection limit/i);
    assert.equal(dependencies.submissions.length, 0);
  } finally {
    await second.close();
    await first.close();
    await server.close();
  }
});
