/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import net, { type Socket } from 'node:net';
import test from 'node:test';
import { randomXJobFingerprint, type RandomXJob } from '@mining/randomx';
import {
  normalizeRandomXUpstreamJob,
  parseRandomXUpstreamLine,
  RandomXPoolAdapter,
  RandomXSubmissionNotDispatchedError,
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
const notifiedJob = {
  ...validJob,
  job_id: 'randomx-job-notification',
  height: 3_500_001,
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
  let loginCount = 0;
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
            loginCount += 1;
            const response = `${JSON.stringify({
              id: request.id,
              jsonrpc: '2.0',
              error: null,
              result: { id: `session-${loginCount}`, status: 'OK', job: validJob },
            })}\n`;
            const notification = `${JSON.stringify({
              jsonrpc: '2.0',
              method: 'job',
              params: notifiedJob,
            })}\n`;
            socket.write(loginCount === 1 ? `${response}${notification}` : response);
          } else if (request.method === 'submit') {
            const params = request.params as Record<string, unknown>;
            socket.write(
              `${JSON.stringify({
                id: request.id,
                jsonrpc: '2.0',
                error: null,
                result: params.nonce === 'ffffffff' ? null : { status: 'OK' },
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
  const jobs: RandomXJob[] = [];
  const states: string[] = [];
  let adapterNow = fixedNow;
  let signalDisconnected!: () => void;
  const disconnected = new Promise<void>((resolve) => {
    signalDisconnected = resolve;
  });
  const adapter = new RandomXPoolAdapter(
    'xmr-primary',
    endpoint(port),
    {
      onJob: (job) => jobs.push(job),
      onState: (state) => states.push(state),
      onDisconnect: () => signalDisconnected(),
    },
    { now: () => adapterNow, jobTtlMilliseconds: 60_000 },
  );

  try {
    const firstStart = adapter.start();
    const concurrentStart = adapter.start();
    assert.equal(concurrentStart, firstStart);
    const [login, concurrentLogin] = await Promise.all([firstStart, concurrentStart]);
    assert.deepEqual(concurrentLogin, login);
    assert.equal(loginCount, 1, 'concurrent start calls must share one authorization RPC');
    assert.equal(login.sessionId, 'session-1');
    assert.equal(adapter.getJob(validJob.job_id)?.seedHash, validJob.seed_hash);
    assert.equal(adapter.getJob(notifiedJob.job_id)?.clientId, 'session-1');
    assert.deepEqual(
      jobs.map((job) => job.id),
      ['randomx-job-1', 'randomx-job-notification'],
    );
    assert.deepEqual(states, ['CONNECTING', 'AUTHORIZING', 'ACTIVE']);

    login.job.seedHash = 'aa'.repeat(32);
    login.job.receivedAt.setTime(0);
    const callbackJob = jobs[0];
    assert.ok(callbackJob);
    callbackJob.seedHash = 'bb'.repeat(32);
    callbackJob.expiresAt.setTime(0);
    const retrievedJob = adapter.getJob(validJob.job_id);
    assert.ok(retrievedJob);
    retrievedJob.seedHash = 'cc'.repeat(32);
    retrievedJob.receivedAt.setTime(0);
    const authoritativeJob = adapter.getJob(validJob.job_id);
    assert.ok(authoritativeJob);
    assert.equal(authoritativeJob.seedHash, validJob.seed_hash);
    assert.equal(authoritativeJob.receivedAt.toISOString(), fixedNow.toISOString());
    assert.equal(
      authoritativeJob.expiresAt.toISOString(),
      new Date(fixedNow.getTime() + 60_000).toISOString(),
    );

    const validSubmission = {
      workerName: 'account.cpu-1',
      jobId: validJob.job_id,
      nonce: '78563412',
      result: '22'.repeat(32),
      submittedAt: fixedNow,
    };
    const firstFingerprint = randomXJobFingerprint(authoritativeJob);
    await assert.rejects(
      adapter.submit(validSubmission, 'session-2', firstFingerprint),
      (error: unknown) => {
        assert.ok(error instanceof RandomXSubmissionNotDispatchedError);
        return true;
      },
    );
    assert.equal(received.length, 1);

    await assert.rejects(
      adapter.submit(validSubmission, 'session-1', '00'.repeat(32)),
      (error: unknown) => {
        assert.ok(error instanceof RandomXSubmissionNotDispatchedError);
        return true;
      },
    );
    assert.equal(received.length, 1, 'a changed job fingerprint must not produce an upstream RPC');

    await assert.rejects(
      adapter.submit({ ...validSubmission, nonce: 'invalid' }, 'session-1', firstFingerprint),
      /submission proof is invalid/,
    );
    assert.equal(received.length, 1, 'serialization failure must not produce an upstream RPC');

    const result = await adapter.submit(validSubmission, 'session-1', firstFingerprint);
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

    await assert.rejects(
      adapter.submit({ ...validSubmission, nonce: 'ffffffff' }, 'session-1', firstFingerprint),
      /ambiguous submission result/,
    );
    assert.equal(received.length, 3);

    const reconnected = await adapter.start();
    assert.equal(reconnected.sessionId, 'session-2');
    assert.equal(adapter.activeSessionId, 'session-2');
    const reconnectedJob = adapter.getJob(validJob.job_id);
    assert.ok(reconnectedJob);
    assert.equal(reconnectedJob.clientId, 'session-2');
    const reconnectedFingerprint = randomXJobFingerprint(reconnectedJob);
    await assert.rejects(
      adapter.submit(validSubmission, 'session-1', firstFingerprint),
      (error: unknown) => {
        assert.ok(error instanceof RandomXSubmissionNotDispatchedError);
        return true;
      },
    );
    assert.equal(received.length, 4, 'stale session must not produce an upstream RPC');
    const reconnectedResult = await adapter.submit(
      validSubmission,
      'session-2',
      reconnectedFingerprint,
    );
    assert.deepEqual(reconnectedResult, { accepted: true });
    assert.equal(received.length, 5);
    assert.deepEqual(received[4]?.params, {
      id: 'session-2',
      job_id: 'randomx-job-1',
      nonce: '78563412',
      result: '22'.repeat(32),
    });

    adapterNow = new Date('2026-08-22T10:32:00.000Z');
    await assert.rejects(
      adapter.submit(
        {
          workerName: 'account.cpu-1',
          jobId: validJob.job_id,
          nonce: '00000000',
          result: '00'.repeat(32),
          submittedAt: adapterNow,
        },
        'session-2',
        reconnectedFingerprint,
      ),
      (error: unknown) => {
        assert.ok(error instanceof RandomXSubmissionNotDispatchedError);
        return true;
      },
    );
    assert.equal(received.length, 5);

    for (const socket of sockets) socket.destroy();
    await disconnected;
    assert.equal(adapter.activeSessionId, undefined);
    assert.equal(adapter.getJob(validJob.job_id), undefined);
  } finally {
    adapter.close();
    await closeServer(server, sockets);
  }
});

test('RandomX adapter rejects submission before authorization', async () => {
  const adapter = new RandomXPoolAdapter('xmr-primary', endpoint(1), {}, { now: () => fixedNow });
  await assert.rejects(
    adapter.submit(
      {
        workerName: 'account.cpu-1',
        jobId: 'missing',
        nonce: '00000000',
        result: '00'.repeat(32),
        submittedAt: fixedNow,
      },
      'missing-session',
      '00'.repeat(32),
    ),
    (error: unknown) => {
      assert.ok(error instanceof RandomXSubmissionNotDispatchedError);
      return true;
    },
  );
});
