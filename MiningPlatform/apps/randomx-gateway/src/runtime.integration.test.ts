/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import net, { type Server, type Socket } from 'node:net';
import test from 'node:test';
import { prisma } from '@mining/database';
import { generateWorkerCredential } from '@mining/security';
import type { EnabledRandomXGatewayConfig } from './config.js';
import { createRandomXGatewayRuntime } from './runtime.js';

const acceptedResult = `${'00'.repeat(24)}0100000000000000`;

type JsonLineResponse = {
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
        waiter.reject(new Error('Socket closed before a response was received'));
      }
    });
  }

  send(value: unknown): void {
    this.socket.write(`${JSON.stringify(value)}\n`);
  }

  async read(): Promise<JsonLineResponse> {
    const line = this.lines.shift() ?? (await this.waitForLine());
    return JSON.parse(line) as JsonLineResponse;
  }

  async close(): Promise<void> {
    if (this.socket.destroyed) return;
    const closed = new Promise<void>((resolve) => this.socket.once('close', resolve));
    this.socket.end();
    await closed;
  }

  private waitForLine(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('Timed out waiting for a RandomX runtime response'));
      }, 5_000);
      this.waiters.push({ resolve, reject, timer });
    });
  }
}

async function listen(server: Server | http.Server): Promise<number> {
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

async function closeServer(server: Server | http.Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function connect(port: number): Promise<JsonLineClient> {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return new JsonLineClient(socket);
}

test('runs authenticated miner traffic through validation, upstream, and durable accounting', async () => {
  const redisUrl = process.env.REDIS_INTEGRATION_URL;
  assert.ok(redisUrl, 'REDIS_INTEGRATION_URL is required');
  const suffix = randomUUID();
  const shortSuffix = suffix.replaceAll('-', '').slice(0, 12);
  const assetId = `randomx-runtime-asset-${suffix}`;
  const userId = `randomx-runtime-user-${suffix}`;
  const miningAccountId = `randomx-runtime-account-${suffix}`;
  const workerId = `randomx-runtime-worker-${suffix}`;
  const upstreamPoolId = `randomx-runtime-pool-${suffix}`;
  const username = `rx_runtime_${shortSuffix}`;
  const upstreamJobId = `runtime-job-${suffix}`;
  const upstreamSessionId = `runtime-session-${suffix}`;
  const credential = await generateWorkerCredential();
  const feePolicy = await prisma.miningFeePolicy.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  assert.ok(feePolicy, 'an active fee policy is required by the migration baseline');

  await prisma.asset.create({
    data: {
      id: assetId,
      symbol: `RXRT${shortSuffix.toUpperCase()}`,
      name: 'RandomX runtime integration fixture',
      algorithm: 'rx/0',
      decimals: 12,
      enabled: true,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `randomx-runtime-${suffix}@local.invalid`,
      passwordHash: 'RANDOMX_RUNTIME_TEST_ONLY',
      displayName: 'RandomX Runtime Test',
      role: 'USER',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.miningAccount.create({
    data: {
      id: miningAccountId,
      userId,
      assetId,
      feePolicyId: feePolicy.id,
      username,
      rewardMethod: 'FOLLOW_UPSTREAM',
      platformFeePercent: '0.5',
    },
  });
  await prisma.worker.create({
    data: {
      id: workerId,
      userId,
      miningAccountId,
      name: 'cpu-1',
      passwordHash: 'WORKER_CREDENTIAL_V1',
      status: 'OFFLINE',
      credentials: {
        create: { credentialId: credential.credentialId, secretHash: credential.secretHash },
      },
    },
  });
  await prisma.upstreamPool.create({
    data: {
      id: upstreamPoolId,
      assetId,
      poolKey: `runtime-${shortSuffix}`,
      name: 'RandomX Runtime Test Pool',
      host: '127.0.0.1',
      port: 1,
      tls: false,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'SETUP',
    },
  });

  const upstreamSockets = new Set<Socket>();
  const upstreamRequests: Record<string, unknown>[] = [];
  const upstreamServer = net.createServer((socket) => {
    upstreamSockets.add(socket);
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
          upstreamRequests.push(request);
          if (request.method === 'login') {
            socket.write(
              `${JSON.stringify({
                id: request.id,
                jsonrpc: '2.0',
                error: null,
                result: {
                  id: upstreamSessionId,
                  status: 'OK',
                  job: {
                    blob: '00'.repeat(80),
                    job_id: upstreamJobId,
                    target: '0200000000000000',
                    seed_hash: '11'.repeat(32),
                    height: 3_500_100,
                  },
                },
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
    socket.on('close', () => upstreamSockets.delete(socket));
  });
  const upstreamPort = await listen(upstreamServer);

  const sidecarSockets = new Set<Socket>();
  const sidecarRequests: Array<{ seed: string | undefined; blob: string }> = [];
  const sidecarServer = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      sidecarRequests.push({
        seed: request.headers['randomx-seed'] as string | undefined,
        blob: body,
      });
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(acceptedResult);
    });
  });
  sidecarServer.on('connection', (socket) => {
    sidecarSockets.add(socket);
    socket.on('close', () => sidecarSockets.delete(socket));
  });
  const sidecarPort = await listen(sidecarServer);

  const config: EnabledRandomXGatewayConfig = {
    enabled: true,
    mode: 'lab',
    miner: {
      host: '127.0.0.1',
      port: 0,
      ipHashKey: 'randomx-runtime-integration-ip-key-at-least-32-bytes',
      maximumConnections: 4,
      maximumLineBytes: 4_096,
      maximumPendingMessages: 8,
      maximumSubmissionsPerMinute: 10,
      socketTimeoutMs: 10_000,
    },
    redisUrl,
    workLeaseKeyPrefix: `mining:randomx:runtime-test:${suffix}:`,
    workerAuthMaximumFailures: 5,
    workerAuthWindowMs: 60_000,
    workerAuthLockMs: 900_000,
    upstreamPoolId,
    upstream: {
      host: '127.0.0.1',
      port: upstreamPort,
      userAgent: 'MiningPlatform/randomx-runtime-test',
      username: 'upstream-wallet.worker',
      password: 'upstream-test-secret',
      connectTimeoutMs: 2_000,
      responseTimeoutMs: 2_000,
      maximumLineBytes: 16_384,
    },
    upstreamJobTtlMs: 60_000,
    upstreamMaximumRetainedJobs: 4,
    jobRefreshIntervalMs: 60_000,
    randomXServiceUrl: `http://127.0.0.1:${sidecarPort}`,
    randomXServiceTimeoutMs: 2_000,
  };

  const runtime = await createRandomXGatewayRuntime(config);
  let miner: JsonLineClient | undefined;
  try {
    await runtime.listen();
    miner = await connect(runtime.listeningPort);
    miner.send({
      id: 1,
      jsonrpc: '2.0',
      method: 'login',
      params: {
        login: `${username}.cpu-1`,
        pass: credential.secret,
        agent: 'xmrig/runtime-integration',
      },
    });
    const login = await miner.read();
    assert.equal(login.error, null);
    assert.equal(login.result?.status, 'OK');
    const minerSessionId = String(login.result?.id);
    const minerJob = login.result?.job as Record<string, unknown>;
    const privateJobId = String(minerJob.job_id);
    assert.notEqual(privateJobId, upstreamJobId);

    miner.send({
      id: 2,
      jsonrpc: '2.0',
      method: 'submit',
      params: {
        id: minerSessionId,
        job_id: privateJobId,
        nonce: '78563412',
        result: acceptedResult,
      },
    });
    const submitted = await miner.read();
    assert.equal(submitted.error, null);
    assert.deepEqual(submitted.result, { status: 'OK' });

    const intent = await prisma.randomXShareSubmissionIntent.findFirst({
      where: { miningAccountId, jobEvidence: { upstreamJobId } },
      include: { decision: { include: { outboxEvent: true } } },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(intent);
    assert.equal(intent.workerName, `${username}.cpu-1`);
    assert.equal(intent.decision?.accepted, true);
    assert.ok(intent.decision?.outboxEventId);
    assert.equal(intent.decision?.outboxEvent?.eventName, 'mining.randomx.share.accepted.v1');
    assert.equal(sidecarRequests.length, 1);
    assert.equal(sidecarRequests[0]?.seed, '11'.repeat(32));
    assert.equal(sidecarRequests[0]?.blob.slice(78, 86), '78563412');
    const upstreamSubmit = upstreamRequests.find((request) => request.method === 'submit');
    assert.ok(upstreamSubmit);
    assert.deepEqual(upstreamSubmit.params, {
      id: upstreamSessionId,
      job_id: upstreamJobId,
      nonce: '78563412',
      result: acceptedResult,
    });
  } finally {
    await miner?.close();
    await runtime.close();
    await closeServer(upstreamServer, upstreamSockets);
    await closeServer(sidecarServer, sidecarSockets);
  }
});
