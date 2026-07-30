import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryIdempotencyService } from './index.js';

test('prevents duplicate acquisition and returns completed result', async () => {
  const service = new InMemoryIdempotencyService();
  const first = await service.acquire({ key: 'share-1', owner: 'worker-a', requestHash: 'hash-a', ttlMs: 1_000 });
  assert.equal(first.acquired, true);

  const duplicate = await service.acquire({ key: 'share-1', owner: 'worker-b', requestHash: 'hash-a', ttlMs: 1_000 });
  assert.deepEqual(duplicate.acquired, false);
  if (!duplicate.acquired) assert.equal(duplicate.reason, 'IN_PROGRESS');

  await service.complete({ key: 'share-1', owner: 'worker-a', resultReference: 'db-share-1' });
  const completed = await service.acquire({ key: 'share-1', owner: 'worker-c', requestHash: 'hash-a', ttlMs: 1_000 });
  assert.deepEqual(completed.acquired, false);
  if (!completed.acquired) assert.equal(completed.reason, 'COMPLETED');
});

test('rejects the same key with a different request hash', async () => {
  const service = new InMemoryIdempotencyService();
  await service.acquire({ key: 'payout-1', owner: 'a', requestHash: 'one', ttlMs: 1_000 });
  const result = await service.acquire({ key: 'payout-1', owner: 'b', requestHash: 'two', ttlMs: 1_000 });
  assert.equal(result.acquired, false);
  if (!result.acquired) assert.equal(result.reason, 'CONFLICT');
});
