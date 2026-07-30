/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import {
  calculateHeaderHash,
  DIFFICULTY_ONE_TARGET,
  type BitcoinShareSubmission,
} from '@mining/mining-core';
import { parseMiningNotify } from '@mining/stratum-protocol';
import { exponentialBackoffMs } from './backoff.js';
import { referenceStratumV1Fixture } from './fixtures/reference-v1.js';
import { UpstreamStratumClient } from './client.js';
import { normalizeUpstreamJob } from './job-normalizer.js';
import { UpstreamJobRegistry } from './job-registry.js';
import { transitionUpstreamState } from './session-state-machine.js';
import { UpstreamStratumSimulator } from './simulator.js';

function referenceNotification() {
  return parseMiningNotify([...referenceStratumV1Fixture.notifyParams]);
}


function findAcceptedSubmission(job: Parameters<typeof calculateHeaderHash>[0]): BitcoinShareSubmission {
  for (let nonce = 0; nonce < 2_000_000; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName: 'upstream.account',
      jobId: job.id,
      extranonce2: '00000001',
      networkTime: job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt: new Date(),
    };
    if (calculateHeaderHash(job, submission).numericValue <= DIFFICULTY_ONE_TARGET * 1_000_000n) return submission;
  }
  throw new Error('Could not find simulator share');
}

test('normalizes reference Stratum V1 fixture without reversing prevhash', () => {
  const job = normalizeUpstreamJob({
    notification: referenceNotification(),
    extranonce1: String(referenceStratumV1Fixture.subscribeResult[1]),
    extranonce2Size: Number(referenceStratumV1Fixture.subscribeResult[2]),
    assignedDifficulty: referenceStratumV1Fixture.difficulty,
    receivedAt: new Date('2012-09-10T00:00:00.000Z'),
  });
  assert.equal(job.previousBlockHash, referenceNotification().previousBlockHash);
  const hash = calculateHeaderHash(job, {
    ...referenceStratumV1Fixture.submission,
    submittedAt: job.receivedAt,
  });
  assert.equal(hash.displayHash, referenceStratumV1Fixture.expected.displayHash);
});

test('clean_jobs supersedes earlier jobs while non-clean jobs coexist', () => {
  const now = new Date('2026-07-31T00:00:00.000Z');
  const registry = new UpstreamJobRegistry(() => now);
  const base = normalizeUpstreamJob({
    notification: referenceNotification(),
    extranonce1: 'e9695791',
    extranonce2Size: 4,
    assignedDifficulty: '1',
    receivedAt: now,
  });
  registry.add({ ...base, id: 'job-1', cleanJobs: true });
  registry.add({ ...base, id: 'job-2', cleanJobs: false });
  assert.equal(registry.activeJobs().length, 2);
  registry.add({ ...base, id: 'job-3', cleanJobs: true });
  assert.equal(registry.get('job-1')?.status, 'SUPERSEDED');
  assert.equal(registry.get('job-2')?.status, 'SUPERSEDED');
  assert.deepEqual(registry.activeJobs().map((job) => job.id), ['job-3']);
});

test('rejects illegal upstream session transitions', () => {
  assert.equal(transitionUpstreamState('DISCONNECTED', 'CONNECTING'), 'CONNECTING');
  assert.throws(() => transitionUpstreamState('DISCONNECTED', 'ACTIVE'));
});

test('calculates deterministic exponential backoff', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map((attempt) => exponentialBackoffMs(attempt, 100, 800)), [100, 200, 400, 800, 800]);
});

test('connects, receives a normalized job, and correlates an accepted share', async () => {
  const simulator = new UpstreamStratumSimulator();
  await simulator.listen();
  let receivedJob = simulator.job;
  const client = new UpstreamStratumClient(
    {
      host: '127.0.0.1',
      port: simulator.port,
      userAgent: 'MiningPlatform-test/0.2.0-alpha.4',
      username: 'upstream.account',
      password: 'x',
      connectTimeoutMs: 2_000,
      responseTimeoutMs: 2_000,
      maximumLineBytes: 65_536,
    },
    { onJob: (job) => { receivedJob = job; } },
  );
  try {
    const subscription = await client.connectAndSubscribe();
    assert.equal(subscription.extranonce1, 'e9695791');
    await client.authorize();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(client.currentState, 'ACTIVE');
    assert.equal(receivedJob.id, 'sim-job-1');
    const submission = findAcceptedSubmission(receivedJob);
    const result = await client.submit(submission);
    assert.equal(result.accepted, true);
    assert.equal(simulator.submissions.length, 1);
  } finally {
    client.close();
    await simulator.close();
  }
});


test('correlates an upstream rejection without throwing', async () => {
  const simulator = new UpstreamStratumSimulator({ rejectShares: true });
  await simulator.listen();
  let receivedJob = simulator.job;
  const client = new UpstreamStratumClient(
    {
      host: '127.0.0.1',
      port: simulator.port,
      userAgent: 'MiningPlatform-test/0.2.0-alpha.4',
      username: 'upstream.account',
      password: 'x',
      connectTimeoutMs: 2_000,
      responseTimeoutMs: 2_000,
      maximumLineBytes: 65_536,
    },
    { onJob: (job) => { receivedJob = job; } },
  );
  try {
    await client.connectAndSubscribe();
    await client.authorize();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const result = await client.submit(findAcceptedSubmission(receivedJob));
    assert.equal(result.accepted, false);
    assert.equal(result.errorCode, 21);
  } finally {
    client.close();
    await simulator.close();
  }
});


test('retries an initial connection failure with exponential backoff', async () => {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve simulator port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));

  const simulator = new UpstreamStratumSimulator({ port });
  const states: string[] = [];
  const client = new UpstreamStratumClient(
    {
      host: '127.0.0.1',
      port,
      userAgent: 'MiningPlatform-retry-test/0.2.0-alpha.4',
      username: 'upstream.account',
      password: 'x',
      connectTimeoutMs: 200,
      responseTimeoutMs: 1_000,
      maximumLineBytes: 65_536,
    },
    { onState: (state) => states.push(state) },
  );
  const delayedStart = setTimeout(() => void simulator.listen(), 100);
  try {
    await client.connectAuthorizeWithRetry(3);
    assert.equal(client.currentState, 'ACTIVE');
    assert.ok(states.includes('RECONNECTING'));
  } finally {
    clearTimeout(delayedStart);
    client.close();
    if (simulator.port !== 0) await simulator.close();
  }
});
