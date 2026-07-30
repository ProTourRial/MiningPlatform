import { randomUUID } from 'node:crypto';
import { prisma } from '@mining/database';
import { RedisStreamEventBus, RedisStreamEventConsumer, type DomainEvent } from '@mining/event-bus';
import { createLogger } from '@mining/logger';
import { MiningEvents, type HashrateUpdatedPayload, type ShareAcceptedPayload } from '@mining/shared';
import { MiningProjection } from './projection.js';

const logger = createLogger('mining-worker');
const abortController = new AbortController();
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const eventStream = process.env.EVENT_STREAM ?? 'mining:domain-events';
const consumer = await RedisStreamEventConsumer.connect({
  url: redisUrl,
  stream: eventStream,
  group: process.env.MINING_EVENT_GROUP ?? 'mining-projection-v1',
  consumer: process.env.MINING_EVENT_CONSUMER ?? `mining-worker-${randomUUID()}`,
});
const publisher = await RedisStreamEventBus.connect({ url: redisUrl, stream: eventStream });
const projection = new MiningProjection();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => abortController.abort());
}

async function publishHashrate(event: DomainEvent<ShareAcceptedPayload>): Promise<void> {
  const snapshot = await prisma.hashrateSnapshot.findFirst({
    where: { workerId: event.payload.workerId, windowSeconds: 300 },
    orderBy: { recordedAt: 'desc' },
  });
  if (!snapshot) return;
  const payload: HashrateUpdatedPayload = {
    workerId: snapshot.workerId,
    windowSeconds: snapshot.windowSeconds,
    hashesPerSecond: snapshot.hashrate.toString(),
    acceptedShares: snapshot.acceptedShares,
    rejectedShares: snapshot.rejectedShares,
    invalidShares: snapshot.invalidShares,
    recordedAt: snapshot.recordedAt.toISOString(),
  };
  await publisher.publish({
    eventId: randomUUID(),
    eventName: MiningEvents.hashrateUpdated,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: 'mining-worker',
    aggregateType: 'Worker',
    aggregateId: payload.workerId,
    correlationId: event.correlationId,
    causationId: event.eventId,
    idempotencyKey: `hashrate:${event.eventId}:300`,
    payload,
  });
}

logger.info({ stream: eventStream }, 'mining projection started');
try {
  await consumer.run(async (event) => {
    const result = await projection.handle(event);
    if (result.processed && event.eventName === MiningEvents.shareLocalAccepted) {
      await publishHashrate(event as DomainEvent<ShareAcceptedPayload>);
    }
    logger.debug(
      { eventId: event.eventId, eventName: event.eventName, processed: result.processed },
      result.processed ? 'mining event projected' : 'duplicate mining event skipped',
    );
  }, abortController.signal);
} finally {
  await Promise.all([consumer.close(), publisher.close(), prisma.$disconnect()]);
}
