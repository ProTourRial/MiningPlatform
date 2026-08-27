/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockStateMachine,
  FinancialTransitionError,
  payoutStateMachine,
  rewardStateMachine,
} from './financial-state-machines.js';

test('payout follows the approved happy path', () => {
  const steps = [
    ['REQUESTED', 'ELIGIBLE', 'PAYOUT_ELIGIBLE'],
    ['ELIGIBLE', 'RESERVED', 'PAYOUT_RESERVED'],
    ['RESERVED', 'APPROVED', 'PAYOUT_APPROVED'],
    ['APPROVED', 'SIGNING', 'PAYOUT_SIGNING_STARTED'],
    ['SIGNING', 'BROADCAST', 'PAYOUT_BROADCAST'],
    ['BROADCAST', 'CONFIRMING', 'PAYOUT_CONFIRMING'],
    ['CONFIRMING', 'COMPLETED', 'PAYOUT_COMPLETED'],
  ] as const;

  for (const [index, [from, to, event]] of steps.entries()) {
    const result = payoutStateMachine.transition({
      entityId: 'payout-happy-001',
      from,
      to,
      event,
      idempotencyKey: `payout-happy-${index}`,
    });
    assert.equal(result.status, 'APPLIED');
    assert.equal(result.to, to);
  }
});

test('payout rejects illegal skips and terminal transitions', () => {
  assert.throws(
    () =>
      payoutStateMachine.transition({
        entityId: 'payout-illegal-001',
        from: 'REQUESTED',
        to: 'COMPLETED',
        event: 'PAYOUT_COMPLETED',
        idempotencyKey: 'payout-illegal-skip',
      }),
    (error: unknown) =>
      error instanceof FinancialTransitionError && error.code === 'ILLEGAL_TRANSITION',
  );

  assert.throws(
    () =>
      payoutStateMachine.transition({
        entityId: 'payout-terminal-001',
        from: 'COMPLETED',
        to: 'FAILED',
        event: 'PAYOUT_FAILED',
        idempotencyKey: 'payout-terminal',
      }),
    (error: unknown) =>
      error instanceof FinancialTransitionError && error.code === 'ILLEGAL_TRANSITION',
  );
});

test('payout failure is legal only from signing, broadcast, or confirming', () => {
  for (const [from, key] of [
    ['SIGNING', 'payout-failed-signing'],
    ['BROADCAST', 'payout-failed-broadcast'],
    ['CONFIRMING', 'payout-failed-confirming'],
  ] as const) {
    const result = payoutStateMachine.transition({
      entityId: `payout-${key}`,
      from,
      to: 'FAILED',
      event: 'PAYOUT_FAILED',
      idempotencyKey: key,
    });
    assert.equal(result.status, 'APPLIED');
  }
});

test('transition event must match the declared transition', () => {
  assert.throws(
    () =>
      rewardStateMachine.transition({
        entityId: 'reward-event-mismatch-001',
        from: 'IMMATURE',
        to: 'MATURE',
        event: 'REWARD_ALLOCATED',
        idempotencyKey: 'reward-event-mismatch',
      }),
    (error: unknown) =>
      error instanceof FinancialTransitionError && error.code === 'EVENT_MISMATCH',
  );
});

test('same payout transition replays idempotently', () => {
  const input = {
    entityId: 'payout-replay-001' as const,
    from: 'REQUESTED' as const,
    to: 'ELIGIBLE' as const,
    event: 'PAYOUT_ELIGIBLE' as const,
    idempotencyKey: 'payout-replay-key',
  };
  const first = payoutStateMachine.transition(input);
  const replay = payoutStateMachine.transition(input);
  assert.equal(first.status, 'APPLIED');
  assert.equal(replay.status, 'IDEMPOTENT_REPLAY');
  assert.equal(replay.entityId, first.entityId);
});

test('same idempotency key with a different transition is rejected', () => {
  const key = 'shared-idempotency-conflict';
  payoutStateMachine.transition({
    entityId: 'payout-conflict-001',
    from: 'REQUESTED',
    to: 'ELIGIBLE',
    event: 'PAYOUT_ELIGIBLE',
    idempotencyKey: key,
  });
  assert.throws(
    () =>
      payoutStateMachine.transition({
        entityId: 'payout-conflict-002',
        from: 'REQUESTED',
        to: 'ELIGIBLE',
        event: 'PAYOUT_ELIGIBLE',
        idempotencyKey: key,
      }),
    (error: unknown) =>
      error instanceof FinancialTransitionError && error.code === 'IDEMPOTENCY_CONFLICT',
  );
});

test('reward and block machines enforce their separate lifecycles', () => {
  const reward = rewardStateMachine.transition({
    entityId: 'reward-lifecycle-001',
    from: 'IMMATURE',
    to: 'MATURE',
    event: 'REWARD_MATURED',
    idempotencyKey: 'reward-lifecycle-mature',
  });
  assert.equal(reward.to, 'MATURE');

  const block = blockStateMachine.transition({
    entityId: 'block-lifecycle-001',
    from: 'CONFIRMED',
    to: 'REORGED',
    event: 'BLOCK_REORGED',
    idempotencyKey: 'block-lifecycle-reorg',
  });
  assert.equal(block.to, 'REORGED');

  assert.throws(
    () =>
      rewardStateMachine.transition({
        entityId: 'reward-lifecycle-001',
        from: 'MATURE',
        to: 'IMMATURE',
        event: 'REWARD_IMMATURE',
        idempotencyKey: 'reward-lifecycle-backward',
      }),
    (error: unknown) =>
      error instanceof FinancialTransitionError && error.code === 'ILLEGAL_TRANSITION',
  );
});
