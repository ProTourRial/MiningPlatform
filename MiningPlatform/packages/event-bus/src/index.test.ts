import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryEventBus, type DomainEvent } from './index.js';

test('publishes an event to a subscribed handler', async () => {
  const bus = new InMemoryEventBus();
  const received: DomainEvent[] = [];
  bus.subscribe('mining.share.local-accepted.v1', async (event) => {
    received.push(event);
  });

  await bus.publish({
    eventId: 'evt-1',
    eventName: 'mining.share.local-accepted.v1',
    eventVersion: 1,
    occurredAt: new Date(0).toISOString(),
    producer: 'test',
    aggregateType: 'share',
    aggregateId: 'share-1',
    correlationId: 'session-1',
    idempotencyKey: 'share-1',
    payload: {},
  });

  assert.equal(received.length, 1);
});
