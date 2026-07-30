import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateFollowUpstreamReward } from './index.js';

test('allocates reward and preserves all satoshis', () => {
  const allocations = allocateFollowUpstreamReward(1_000n, [
    { miningAccountId: 'a', acceptedDifficulty: 3n },
    { miningAccountId: 'b', acceptedDifficulty: 1n },
  ], 200n);

  assert.equal(allocations.reduce((sum, row) => sum + row.grossSats, 0n), 1_000n);
  assert.equal(allocations[0]?.grossSats, 750n);
  assert.equal(allocations[1]?.grossSats, 250n);
});
