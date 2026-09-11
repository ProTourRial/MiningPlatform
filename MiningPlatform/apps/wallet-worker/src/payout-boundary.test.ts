/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPayoutActionControl,
  assertPayoutExecutionScope,
  assertRegtestPayoutBoundary,
  PayoutScopedAuthorizationError,
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

test('scoped payout authorization remains current at irreversible actions', () => {
  const now = new Date('2026-09-10T00:00:00.000Z');
  const scope = {
    payoutRouteId: 'route-1',
    payoutAddress: {
      payoutRouteId: 'route-1',
      status: 'ACTIVE' as const,
      active: true,
      verified: true,
    },
    payoutRoute: {
      id: 'route-1',
      status: 'PILOT' as const,
      effectiveFrom: new Date('2026-09-09T00:00:00.000Z'),
      effectiveUntil: new Date('2026-09-11T00:00:00.000Z'),
      payoutWallet: { enabled: true, signerKeyReference: 'signer-key-1' },
    },
    signingRequest: { signerKeyReference: 'signer-key-1' },
  };

  assert.doesNotThrow(() => assertPayoutExecutionScope(scope, now));

  const rejected = [
    {
      value: {
        ...scope,
        payoutAddress: { ...scope.payoutAddress, status: 'DISABLED' as const, active: false },
      },
      code: 'PAYOUT_DESTINATION_REVOKED',
    },
    {
      value: { ...scope, payoutRoute: { ...scope.payoutRoute, status: 'DISABLED' as const } },
      code: 'PAYOUT_ROUTE_REVOKED',
    },
    {
      value: {
        ...scope,
        payoutRoute: {
          ...scope.payoutRoute,
          effectiveUntil: new Date('2026-09-10T00:00:00.000Z'),
        },
      },
      code: 'PAYOUT_ROUTE_NOT_EFFECTIVE',
    },
    {
      value: {
        ...scope,
        payoutRoute: {
          ...scope.payoutRoute,
          payoutWallet: { enabled: false, signerKeyReference: 'signer-key-1' },
        },
      },
      code: 'PAYOUT_WALLET_REVOKED',
    },
    {
      value: { ...scope, signingRequest: { signerKeyReference: 'another-key' } },
      code: 'PAYOUT_SIGNER_BINDING_CHANGED',
    },
  ];

  for (const entry of rejected) {
    assert.throws(
      () => assertPayoutExecutionScope(entry.value, now),
      (error: unknown) =>
        error instanceof PayoutScopedAuthorizationError && error.code === entry.code,
    );
  }
});
