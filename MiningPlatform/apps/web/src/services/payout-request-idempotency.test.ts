/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  payoutRequestIdentity,
  payoutRequestOutcomeIsAmbiguous,
} from './payout-request-idempotency.js';

test('payout request identity survives an ambiguous retry of the exact intent', () => {
  let generated = 0;
  const createUuid = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;
  const first = payoutRequestIdentity(undefined, 'account-a', '100000', createUuid);
  const retry = payoutRequestIdentity(first, 'account-a', '100000', createUuid);
  assert.equal(retry, first);
  assert.equal(generated, 1);
});

test('payout request identity rotates when account or amount changes', () => {
  let generated = 0;
  const createUuid = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;
  const first = payoutRequestIdentity(undefined, 'account-a', '100000', createUuid);
  const changedAmount = payoutRequestIdentity(first, 'account-a', '200000', createUuid);
  const changedAccount = payoutRequestIdentity(changedAmount, 'account-b', '200000', createUuid);
  assert.notEqual(changedAmount.idempotencyKey, first.idempotencyKey);
  assert.notEqual(changedAccount.idempotencyKey, changedAmount.idempotencyKey);
});

test('only transport and retryable HTTP outcomes retain payout request identity', () => {
  assert.equal(payoutRequestOutcomeIsAmbiguous(), true);
  for (const status of [408, 409, 425, 429, 500, 503]) {
    assert.equal(payoutRequestOutcomeIsAmbiguous(status), true);
  }
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(payoutRequestOutcomeIsAmbiguous(status), false);
  }
});
