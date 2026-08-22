/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import net, { type Socket } from 'node:net';
import test from 'node:test';
import {
  normalizeRandomXUpstreamJob,
  parseRandomXUpstreamLine,
  RandomXPoolAdapter,
  type UpstreamEndpoint,
} from './index.js';

const fixedNow = new Date('2026-08-22T10:30:00.000Z');
const validJob = {
  blob: '00'.repeat(80),
  job_id: 'randomx-job-1',
  target: 'ffffffffffffffff',
  seed_hash: '11'.repeat(32),
  height: 3_500_000,
};

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server has no TCP port');
  return address.port;
}

async function closeServer(server: net.Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function endpoint(port: number): UpstreamEndpoint {
  return {
    host: '127.0.0.1',
    port,
    userAgent: 'MiningPlatform/randomx-test',
    username: 'xmr-wallet.worker',
    password: 'x',
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 2_000,
    maximumLineBytes: 16_384,
  };
}

test('normalizes only bounded rx/0 jobs with a required seed hash', () => {
  const job = normalizeRandomXUpstreamJob(validJob, 'session-1', fixedNow, 60_000);
  assert.equal(job.algorithm, 'rx/0');
  assert.equal(job.height, 3_500_000n);
  assert.equal(job.expiresAt.toISOString(), '2026-08-22T10:31:00.000Z');
  assert.throws(
    () =>
      normalizeRandomXUpstreamJob(
        { ...validJob, seed_hash: undefined },
        'session-1',
        fixedNow,
        60_000,
      ),
    /seed_hash/,
  );
  assert.throws(
    () => normalizeRandomXUpstreamJob({ ...validJob, target: '00000000' }, 's', fixedNow, 1),
    /non-zero/,
  );
});

test('rejects malformed or unsupported RandomX JSON-RPC messages', () => {
  assert.throws(() => parseRandomXUpstreamLine('{'), /malformed JSON/);
  assert.throws(
    () => parseRandomXUpstreamLine(JSON.stringify({ method: 'mining.notify', params: [] })),
    /unsupported notification/,
  );
  assert.deepEqual(
    parseRandomXUpstreamLine(
      JSON.stringify({ id: 1, error: { code: -1, message: 'rejected' }, result: null }),
    ),
    { id: 1, error: { code: -1, message: 'rejected' }, result: null },
  );
});

test('RandomX adapter performs login, records the seeded job, and submits the bound proof', async () => {
  const sockets = new Set<Socket>();
  const received: Record<string, unknown>[] = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const request = JSON.parse(line) as Record<string, unknown>;
          received.push(request);
          if (request.method === 'login') {
            socket.write(
              `${JSON.stringify({
                id: request.id,
                jsonrpc: '2.0',
                error: null,
                result: { id: 'session-1', status: 'OK', job: validJob },
              })}\n`,
            );
          } else if (request.method === 'submit') {
            socket.write(
              `${JSON.stringify({
                id: request.id,
                jsonrpc: '2.0',
                error: null,
                result: { status: 'OK' },
              })}\n`,
            );
          }
        }
        newline = buffer.indexOf('\n');
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  const jobs: string[] = [];
  const states: string[] = [];
  const adapter = new RandomXPoolAdapter(
    'xmr-primary',
    endpoint(port),
    {
      onJob: (job) => jobs.push(job.id),
      onState: (state) => states.push(state),
    },
    { now: () => fixedNow, jobTtlMilliseconds: 60_000 },
  );

  try {
    const login = await adapter.start();
    assert.equal(login.sessionId, 'session-1');
    assert.equal(adapter.getJob(validJob.job_id)?.seedHash, validJob.seed_hash);
    assert.deepEqual(jobs, ['randomx-job-1']);
    assert.deepEqual(states, ['CONNECTING', 'AUTHORIZING', 'ACTIVE']);

    const result = await adapter.submit({
      workerName: 'account.cpu-1',
      jobId: validJob.job_id,
      nonce: '78563412',
      result: '22'.repeat(32),
      submittedAt: fixedNow,
    });
    assert.deepEqual(result, { accepted: true });
    assert.equal(received[0]?.method, 'login');
    assert.deepEqual(received[0]?.params, {
      login: 'xmr-wallet.worker',
      pass: 'x',
      agent: 'MiningPlatform/randomx-test',
    });
    assert.deepEqual(received[1]?.params, {
      id: 'session-1',
      job_id: 'randomx-job-1',
      nonce: '78563412',
      result: '22'.repeat(32),
    });

    const stale = await adapter.submit({
      workerName: 'account.cpu-1',
      jobId: validJob.job_id,
      nonce: '00000000',
      result: '00'.repeat(32),
      submittedAt: new Date('2026-08-22T10:32:00.000Z'),
    });
    assert.deepEqual(stale, {
      accepted: false,
      errorMessage: 'Stale or unknown RandomX job',
    });
    assert.equal(received.length, 2);
  } finally {
    adapter.close();
    await closeServer(server, sockets);
  }
});

test('RandomX adapter rejects submission before authorization', async () => {
  const adapter = new RandomXPoolAdapter('xmr-primary', endpoint(1), {}, { now: () => fixedNow });
  await assert.rejects(
    adapter.submit({
      workerName: 'account.cpu-1',
      jobId: 'missing',
      nonce: '00000000',
      result: '00'.repeat(32),
      submittedAt: fixedNow,
    }),
    /DISCONNECTED/,
  );
});
