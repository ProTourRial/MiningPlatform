/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPayoutActionControl,
  assertRegtestPayoutBoundary,
  REGTEST_PAYOUT_ACK,
} from './payout-boundary.js';

const valid = {
  PAYOUTS_ENABLED: 'true',
  PAYOUT_REQUESTS_ENABLED: 'true',
  PAYOUT_SIGNING_ENABLED: 'true',
  PAYOUT_BROADCAST_ENABLED: 'true',
  PAYOUT_EXECUTION_NETWORK: 'regtest',
  PAYOUT_REGTEST_ACK: REGTEST_PAYOUT_ACK,
  PAYOUT_MAINNET_ENABLED: 'false',
};

test('payout executor accepts the explicit disposable regtest boundary', () => {
  assert.doesNotThrow(() => assertRegtestPayoutBoundary(valid));
});

test('payout executor rejects mainnet and incomplete financial gates', () => {
  assert.throws(
    () => assertRegtestPayoutBoundary({ ...valid, PAYOUT_EXECUTION_NETWORK: 'mainnet' }),
    /restricted.*regtest/,
  );
  assert.throws(
    () => assertRegtestPayoutBoundary({ ...valid, PAYOUT_MAINNET_ENABLED: 'true' }),
    /Mainnet payout execution is not implemented/,
  );
  assert.throws(
    () => assertRegtestPayoutBoundary({ ...valid, PAYOUT_BROADCAST_ENABLED: 'false' }),
    /PAYOUT_BROADCAST_ENABLED must be true/,
  );
});

test('database emergency controls are rechecked for each irreversible action', () => {
  const enabled = {
    paused: false,
    requestsEnabled: true,
    signingEnabled: true,
    broadcastEnabled: true,
  };
  assert.doesNotThrow(() => assertPayoutActionControl(enabled, 'prepare'));
  assert.doesNotThrow(() => assertPayoutActionControl(enabled, 'sign'));
  assert.doesNotThrow(() => assertPayoutActionControl(enabled, 'broadcast'));
  assert.throws(
    () => assertPayoutActionControl({ ...enabled, paused: true }, 'broadcast'),
    /paused/,
  );
  assert.throws(
    () => assertPayoutActionControl({ ...enabled, signingEnabled: false }, 'sign'),
    /signing is disabled/,
  );
  assert.throws(
    () => assertPayoutActionControl({ ...enabled, broadcastEnabled: false }, 'broadcast'),
    /broadcasting is disabled/,
  );
});
