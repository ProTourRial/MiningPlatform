/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import net, { type Socket } from 'node:net';
import test from 'node:test';
import { InMemoryEventBus, type DomainEvent } from '@mining/event-bus/core';
import {
  calculateHeaderHash,
  DIFFICULTY_ONE_TARGET,
  InMemoryDuplicateShareStore,
  type BitcoinShareSubmission,
} from '@mining/mining-core';
import { MiningEvents } from '@mining/shared';
import {
  parseMiningNotify,
  parseMiningSetDifficulty,
  parseMiningSetExtranonce,
  parseStratumMessage,
  serializeStratumRequest,
  type StratumMessage,
  type StratumResponse,
} from '@mining/stratum-protocol';
import { normalizeUpstreamJob, UpstreamStratumSimulator } from '@mining/upstream-stratum';
import type { StratumServerConfig } from './config.js';
import type { MiningEventStore } from './event-store.js';
import { StratumServer } from './server.js';

class CollectingEventStore implements MiningEventStore {
  readonly events: DomainEvent[] = [];

  async append(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
}

class LineClient {
  private readonly socket: Socket;
  private readonly messages: StratumMessage[] = [];
  private readonly waiters: Array<() => void> = [];
  private buffer = '';

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let newline = this.buffer.indexOf('\n');
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (line) this.messages.push(parseStratumMessage(line));
        for (const wake of this.waiters.splice(0)) wake();
        newline = this.buffer.indexOf('\n');
      }
    });
  }

  static async connect(port: number): Promise<LineClient> {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    return new LineClient(socket);
  }

  send(id: number, method: string, params: unknown[]): void {
    this.socket.write(serializeStratumRequest({ id, method, params }));
  }

  async response(id: number, timeoutMs = 5_000): Promise<StratumResponse> {
    const message = await this.take((candidate) => !('method' in candidate) && candidate.id === id, timeoutMs);
    return message as StratumResponse;
  }

  async notification(method: string, timeoutMs = 5_000): Promise<Extract<StratumMessage, { method: string }>> {
    const message = await this.take((candidate) => 'method' in candidate && candidate.method === method, timeoutMs);
    return message as Extract<StratumMessage, { method: string }>;
  }

  close(): void {
    this.socket.destroy();
  }

  private async take(predicate: (message: StratumMessage) => boolean, timeoutMs: number): Promise<StratumMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0]!;
      await new Promise<void>((resolve, reject) => {
        const remaining = Math.max(1, deadline - Date.now());
        const timer = setTimeout(() => reject(new Error('Timed out waiting for Stratum message')), remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    throw new Error('Timed out waiting for Stratum message');
  }
}

function findShare(job: Parameters<typeof calculateHeaderHash>[0]): BitcoinShareSubmission {
  for (let nonce = 0; nonce < 2_000_000; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName: 'demo.worker1',
      jobId: job.id,
      extranonce2: '00000001',
      networkTime: job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt: new Date(),
    };
    if (calculateHeaderHash(job, submission).numericValue <= DIFFICULTY_ONE_TARGET * 1_000_000n) return submission;
  }
  throw new Error('Could not find a low-difficulty share');
}

test('relays a downstream share and waits for upstream acceptance', async () => {
  const simulator = new UpstreamStratumSimulator();
  await simulator.listen();
  const eventStore = new CollectingEventStore();
  const config: StratumServerConfig = {
    host: '127.0.0.1',
    port: 0,
    developmentMode: true,
    developmentWorker: 'demo.worker1',
    developmentPassword: 'x',
    developmentDifficulty: '0.000001',
    socketTimeoutMs: 30_000,
    maximumLineBytes: 65_536,
    maximumSubmissionsPerSecond: 20,
    developmentDataDirectory: './data/test',
    eventBusDriver: 'memory',
    eventStoreDriver: 'jsonl',
    redisUrl: 'redis://127.0.0.1:6379',
    eventStream: 'test-events',
    versionRollingMask: '1fffe000',
    ipHashKey: 'test-ip-hash-key-1234567890',
    upstreamDriver: 'tcp',
    upstreamHost: '127.0.0.1',
    upstreamPort: simulator.port,
    upstreamTls: false,
    upstreamUsername: 'upstream.account',
    upstreamPassword: 'x',
    upstreamUserAgent: 'MiningPlatform-gateway-test/0.2.0-alpha.4',
    upstreamConnectTimeoutMs: 2_000,
    upstreamResponseTimeoutMs: 2_000,
    upstreamMaximumAttempts: 2,
  };
  const server = new StratumServer(config, {
    authenticator: {
      authenticate: async (workerName, password) =>
        workerName === 'demo.worker1' && password === 'x'
          ? { workerId: 'worker-test-1', workerName }
          : null,
    },
    eventBus: new InMemoryEventBus(),
    eventStore,
    duplicateStore: new InMemoryDuplicateShareStore(),
  });

  await server.listen();
  const miner = await LineClient.connect(server.listeningPort);
  try {
    miner.send(1, 'mining.subscribe', ['GatewayTestMiner/1.0']);
    assert.equal((await miner.response(1)).error, null);
    miner.send(2, 'mining.authorize', ['demo.worker1', 'x']);
    assert.equal((await miner.response(2)).result, true);

    const extranonce = parseMiningSetExtranonce((await miner.notification('mining.set_extranonce')).params);
    const difficulty = parseMiningSetDifficulty((await miner.notification('mining.set_difficulty')).params);
    const notify = parseMiningNotify((await miner.notification('mining.notify')).params);
    const job = normalizeUpstreamJob({
      notification: notify,
      extranonce1: extranonce.extranonce1,
      extranonce2Size: extranonce.extranonce2Size,
      assignedDifficulty: difficulty.difficulty,
    });
    const share = findShare(job);
    miner.send(3, 'mining.submit', [share.workerName, share.jobId, share.extranonce2, share.networkTime, share.nonce]);
    const response = await miner.response(3);
    assert.equal(response.result, true);
    assert.equal(response.error, null);
    assert.equal(simulator.submissions.length, 1);
    assert.ok(eventStore.events.some((event) => event.eventName === MiningEvents.shareLocalAccepted));
    assert.ok(eventStore.events.some((event) => event.eventName === MiningEvents.shareUpstreamPending));
    assert.ok(eventStore.events.some((event) => event.eventName === MiningEvents.shareUpstreamAccepted));
  } finally {
    miner.close();
    await server.close();
    await simulator.close();
  }
});
