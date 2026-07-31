/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { getBuildInfo } from '@mining/build-info';
import { setTimeout as sleep } from 'node:timers/promises';
import { prisma } from '@mining/database';
import { RedisStreamEventBus, type DomainEvent } from '@mining/event-bus';
import { createLogger } from '@mining/logger';

const buildInfo = getBuildInfo('outbox-worker');

const logger = createLogger('outbox-worker');
logger.info({ build: buildInfo }, 'outbox-worker build information');
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const stream = process.env.EVENT_STREAM ?? 'mining:domain-events';
const pollMilliseconds = Number(process.env.OUTBOX_POLL_MS ?? 500);
const batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 100);
const maximumAttempts = Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 10);
const lockTimeoutMilliseconds = Number(process.env.OUTBOX_LOCK_TIMEOUT_MS ?? 60_000);
const workerId = process.env.OUTBOX_WORKER_ID ?? `outbox-${process.pid}`;
const publisher = await RedisStreamEventBus.connect({ url: redisUrl, stream });
const abortController = new AbortController();

function retryDelayMilliseconds(attempts: number): number {
  return Math.min(60_000, 500 * 2 ** Math.max(0, attempts - 1));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => abortController.abort());
}

async function recoverStaleClaims(): Promise<void> {
  const staleBefore = new Date(Date.now() - lockTimeoutMilliseconds);
  await prisma.outboxEvent.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
    data: {
      status: 'FAILED',
      availableAt: new Date(),
      lastError: 'Recovered stale outbox claim',
    },
  });
}

async function dispatchBatch(): Promise<number> {
  const candidates = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      availableAt: { lte: new Date() },
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: batchSize,
  });

  let dispatched = 0;
  for (const candidate of candidates) {
    const claim = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        status: { in: ['PENDING', 'FAILED'] },
        availableAt: { lte: new Date() },
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claim.count !== 1) continue;

    const claimed = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: candidate.id } });
    try {
      const event: DomainEvent = {
        eventId: claimed.eventId,
        eventName: claimed.eventName,
        eventVersion: claimed.eventVersion,
        occurredAt: claimed.occurredAt.toISOString(),
        producer: claimed.producer,
        aggregateType: claimed.aggregateType,
        aggregateId: claimed.aggregateId,
        correlationId: claimed.correlationId,
        ...(claimed.causationId ? { causationId: claimed.causationId } : {}),
        idempotencyKey: claimed.idempotencyKey,
        payload: claimed.payload,
      };
      await publisher.publish(event);
      await prisma.outboxEvent.update({
        where: { id: claimed.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
      });
      dispatched += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown outbox dispatch error';
      const terminal = claimed.attempts >= maximumAttempts;
      await prisma.outboxEvent.update({
        where: { id: claimed.id },
        data: {
          status: terminal ? 'DEAD_LETTER' : 'FAILED',
          availableAt: terminal
            ? new Date('9999-12-31T23:59:59.999Z')
            : new Date(Date.now() + retryDelayMilliseconds(claimed.attempts)),
          lastError: `${workerId}: ${reason}`.slice(0, 2_000),
        },
      });
      logger.error({ eventId: claimed.eventId, attempts: claimed.attempts, terminal, error }, 'outbox dispatch failed');
    }
  }
  return dispatched;
}

logger.info({ stream, workerId }, 'outbox dispatcher started');
try {
  while (!abortController.signal.aborted) {
    await recoverStaleClaims();
    const dispatched = await dispatchBatch();
    if (dispatched === 0) await sleep(pollMilliseconds, undefined, { signal: abortController.signal }).catch(() => undefined);
  }
} finally {
  await publisher.close();
  await prisma.$disconnect();
}
