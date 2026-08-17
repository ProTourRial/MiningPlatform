/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomUUID } from 'node:crypto';
import { getBuildInfo } from '@mining/build-info';
import { prisma } from '@mining/database';
import { RedisStreamEventConsumer } from '@mining/event-bus';
import { createLogger } from '@mining/logger';
import { MiningEvents } from '@mining/shared';
import { AccountingService } from './accounting-service.js';

const logger = createLogger('accounting-worker');
logger.info({ build: getBuildInfo('accounting-worker') }, 'accounting-worker build information');
const abortController = new AbortController();
const ownedEvents = new Set<string>([
  MiningEvents.contributionAccepted,
  MiningEvents.settlementImported,
]);
const consumer = await RedisStreamEventConsumer.connect({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  stream: process.env.EVENT_STREAM ?? 'mining:domain-events',
  group: process.env.ACCOUNTING_EVENT_GROUP ?? 'accounting-worker-v1',
  consumer: process.env.ACCOUNTING_EVENT_CONSUMER ?? `accounting-worker-${randomUUID()}`,
});
const service = new AccountingService();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => abortController.abort());
}

try {
  await consumer.run(async (event) => {
    if (!ownedEvents.has(event.eventName)) return;
    const result = await service.handle(event);
    logger.info(
      { eventId: event.eventId, eventName: event.eventName, result },
      'accounting event handled',
    );
  }, abortController.signal);
} finally {
  await Promise.all([consumer.close(), prisma.$disconnect()]);
}
