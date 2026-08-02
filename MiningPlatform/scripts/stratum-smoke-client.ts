/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import net from 'node:net';
import { calculateHeaderHash, targetFromDifficulty, type BitcoinMiningJob, type BitcoinShareSubmission } from '@mining/mining-core';

interface Message {
  id: number | null;
  method?: string;
  params?: unknown[];
  result?: unknown;
  error?: unknown;
}

const host = process.env.STRATUM_SMOKE_HOST ?? '127.0.0.1';
const port = Number(process.env.STRATUM_SMOKE_PORT ?? 3333);
const workerName = process.env.STRATUM_DEV_WORKER ?? 'demo.worker1';
const password = process.env.STRATUM_DEV_PASSWORD ?? 'x';

const socket = net.createConnection({ host, port });
socket.setEncoding('utf8');

const inbox: Message[] = [];
const waiters: Array<{ predicate: (message: Message) => boolean; resolve: (message: Message) => void }> = [];
let buffer = '';

socket.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line) as Message;
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      waiter?.resolve(message);
    } else {
      inbox.push(message);
    }
  }
});

function takeMessage(predicate: (message: Message) => boolean): Promise<Message> {
  const messageIndex = inbox.findIndex(predicate);
  if (messageIndex >= 0) {
    const [message] = inbox.splice(messageIndex, 1);
    if (message) return Promise.resolve(message);
  }
  return new Promise((resolve) => waiters.push({ predicate, resolve }));
}

function send(id: number, method: string, params: unknown[]): void {
  socket.write(`${JSON.stringify({ id, method, params })}\n`);
}

function responseFor(id: number): Promise<Message> {
  return takeMessage((message) => message.id === id);
}

function notification(method: string): Promise<Message> {
  return takeMessage((message) => message.id === null && message.method === method);
}

async function main(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  send(1, 'mining.configure', [['version-rolling'], { 'version-rolling.mask': '1fffe000' }]);
  const configure = await responseFor(1);
  if (configure.error) throw new Error(`Configure failed: ${JSON.stringify(configure.error)}`);

  send(2, 'mining.subscribe', ['MiningPlatformSmoke/0.3.0']);
  const subscribe = await responseFor(2);
  if (subscribe.error) throw new Error(`Subscribe failed: ${JSON.stringify(subscribe.error)}`);
  const subscribeResult = subscribe.result as [unknown, string, number];
  let extranonce1 = subscribeResult[1];
  let extranonce2Size = subscribeResult[2];

  send(3, 'mining.authorize', [workerName, password]);
  const authorize = await responseFor(3);
  if (authorize.result !== true) throw new Error(`Authorize failed: ${JSON.stringify(authorize.error)}`);

  const extranonceMessage = await notification('mining.set_extranonce');
  extranonce1 = String(extranonceMessage.params?.[0]);
  extranonce2Size = Number(extranonceMessage.params?.[1]);
  if (!Number.isInteger(extranonce2Size) || extranonce2Size <= 0) throw new Error('Invalid extranonce assignment');

  const difficultyMessage = await notification('mining.set_difficulty');
  const difficulty = String(difficultyMessage.params?.[0]);
  const notifyMessage = await notification('mining.notify');
  const params = notifyMessage.params ?? [];
  const job: BitcoinMiningJob = {
    id: String(params[0]),
    previousBlockHash: String(params[1]),
    coinbase1: String(params[2]),
    coinbase2: String(params[3]),
    merkleBranches: params[4] as string[],
    version: String(params[5]),
    networkBits: String(params[6]),
    networkTime: String(params[7]),
    cleanJobs: Boolean(params[8]),
    extranonce1,
    extranonce2Size,
    assignedDifficulty: difficulty,
    receivedAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
  };

  const target = targetFromDifficulty(difficulty);
  let acceptedSubmission: BitcoinShareSubmission | undefined;
  for (let nonce = 0; nonce < 5_000_000; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName,
      jobId: job.id,
      extranonce2: '01'.padStart(extranonce2Size * 2, '0'),
      networkTime: job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt: new Date(),
    };
    if (calculateHeaderHash(job, submission).numericValue <= target) {
      acceptedSubmission = submission;
      break;
    }
  }
  if (!acceptedSubmission) throw new Error('No valid development share found within search limit');

  send(4, 'mining.submit', [
    acceptedSubmission.workerName,
    acceptedSubmission.jobId,
    acceptedSubmission.extranonce2,
    acceptedSubmission.networkTime,
    acceptedSubmission.nonce,
  ]);
  const submit = await responseFor(4);
  if (submit.result !== true) throw new Error(`Share rejected: ${JSON.stringify(submit.error)}`);

  console.log(JSON.stringify({
    status: 'ok',
    workerName,
    jobId: job.id,
    difficulty,
    nonce: acceptedSubmission.nonce,
  }, null, 2));
  socket.end();
}

void main().catch((error: unknown) => {
  console.error(error);
  socket.destroy();
  process.exitCode = 1;
});
