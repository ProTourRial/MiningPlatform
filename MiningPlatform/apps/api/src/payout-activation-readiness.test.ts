/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluatePayoutActivationReadiness,
  type PayoutActivationReadinessFacts,
} from './modules/payouts/payout-activation-readiness.js';

function readyFacts(): PayoutActivationReadinessFacts {
  const nowMs = Date.parse('2026-09-12T00:00:00.000Z');
  return {
    environment: {
      payoutsEnabled: true,
      requestsEnabled: true,
      signingEnabled: true,
      broadcastEnabled: true,
      executionNetwork: 'regtest',
      runtimeSupportsTarget: true,
    },
    asset: { configured: true, enabled: true },
    databaseControl: {
      configured: true,
      paused: false,
      requestsEnabled: true,
      signingEnabled: true,
      broadcastEnabled: true,
    },
    route: { configured: true, active: true },
    wallet: {
      configured: true,
      enabled: true,
      rpcWalletConfigured: true,
      signerConfigured: true,
      singlePayoutLimitConfigured: true,
      dailyPayoutLimitConfigured: true,
      reserveConfigured: true,
      recordReconciledAtMs: nowMs - 30_000,
      latestReconciliationStatus: 'MATCHED',
      latestReconciliationAtMs: nowMs - 30_000,
      latestReconciliationVarianceAtomic: 0n,
    },
    eligibleMfaOperatorCount: 2,
    unresolvedQuarantineCount: 0,
    unknownBroadcastCount: 0,
    nowMs,
    walletHealthMaximumAgeMs: 300_000,
  };
}

test('payout activation readiness passes only a completely healthy supported boundary', () => {
  assert.deepEqual(evaluatePayoutActivationReadiness(readyFacts()), {
    eligible: true,
    blockers: [],
  });
});

test('payout activation readiness reports every independent execution gate', () => {
  const facts = readyFacts();
  facts.environment = {
    payoutsEnabled: false,
    requestsEnabled: false,
    signingEnabled: false,
    broadcastEnabled: false,
    executionNetwork: 'signet',
    runtimeSupportsTarget: false,
  };
  facts.databaseControl = {
    configured: false,
    paused: true,
    requestsEnabled: false,
    signingEnabled: false,
    broadcastEnabled: false,
  };
  facts.asset = { configured: false, enabled: false };
  facts.route = { configured: false, active: false };
  facts.wallet = {
    configured: false,
    enabled: false,
    rpcWalletConfigured: false,
    signerConfigured: false,
    singlePayoutLimitConfigured: false,
    dailyPayoutLimitConfigured: false,
    reserveConfigured: false,
    recordReconciledAtMs: null,
    latestReconciliationStatus: null,
    latestReconciliationAtMs: null,
    latestReconciliationVarianceAtomic: null,
  };
  facts.eligibleMfaOperatorCount = 1;
  facts.unresolvedQuarantineCount = 2;
  facts.unknownBroadcastCount = 1;

  const result = evaluatePayoutActivationReadiness(facts);
  assert.equal(result.eligible, false);
  for (const blocker of [
    'PAYOUT_ENVIRONMENT_GATE_DISABLED',
    'PAYOUT_EXECUTION_RUNTIME_UNSUPPORTED',
    'PAYOUT_ASSET_NOT_CONFIGURED',
    'PAYOUT_CONTROL_NOT_CONFIGURED',
    'HOT_WALLET_NOT_RECENTLY_RECONCILED',
    'TWO_PERSON_MFA_OPERATOR_COVERAGE_REQUIRED',
    'UNRESOLVED_PAYOUT_QUARANTINE',
    'UNKNOWN_BROADCAST_ATTEMPT',
  ]) {
    assert.ok(result.blockers.includes(blocker), blocker);
  }
});

test('future-dated or stale wallet reconciliation cannot satisfy activation readiness', () => {
  const future = readyFacts();
  future.wallet.latestReconciliationAtMs = future.nowMs + 1;
  assert.ok(
    evaluatePayoutActivationReadiness(future).blockers.includes(
      'HOT_WALLET_NOT_RECENTLY_RECONCILED',
    ),
  );

  const stale = readyFacts();
  stale.wallet.latestReconciliationAtMs = stale.nowMs - stale.walletHealthMaximumAgeMs - 1;
  assert.ok(
    evaluatePayoutActivationReadiness(stale).blockers.includes(
      'HOT_WALLET_NOT_RECENTLY_RECONCILED',
    ),
  );
});

test('non-zero wallet variance or inconsistent wallet timestamp blocks activation', () => {
  const variance = readyFacts();
  variance.wallet.latestReconciliationVarianceAtomic = 1n;
  assert.ok(
    evaluatePayoutActivationReadiness(variance).blockers.includes(
      'HOT_WALLET_NOT_RECENTLY_RECONCILED',
    ),
  );

  const staleRecord = readyFacts();
  staleRecord.wallet.recordReconciledAtMs =
    staleRecord.nowMs - staleRecord.walletHealthMaximumAgeMs - 1;
  assert.ok(
    evaluatePayoutActivationReadiness(staleRecord).blockers.includes(
      'HOT_WALLET_NOT_RECENTLY_RECONCILED',
    ),
  );
});

test('one unresolved post-signer quarantine independently blocks activation', () => {
  const facts = readyFacts();
  facts.unresolvedQuarantineCount = 1;
  assert.deepEqual(evaluatePayoutActivationReadiness(facts), {
    eligible: false,
    blockers: ['UNRESOLVED_PAYOUT_QUARANTINE'],
  });
});
