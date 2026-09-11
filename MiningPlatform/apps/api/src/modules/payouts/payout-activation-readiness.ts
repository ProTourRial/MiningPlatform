/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type PayoutActivationReadinessFacts = {
  environment: {
    payoutsEnabled: boolean;
    requestsEnabled: boolean;
    signingEnabled: boolean;
    broadcastEnabled: boolean;
    executionNetwork: string | null;
    runtimeSupportsTarget: boolean;
  };
  asset: {
    configured: boolean;
    enabled: boolean;
  };
  databaseControl: {
    configured: boolean;
    paused: boolean;
    requestsEnabled: boolean;
    signingEnabled: boolean;
    broadcastEnabled: boolean;
  };
  route: {
    configured: boolean;
    active: boolean;
  };
  wallet: {
    configured: boolean;
    enabled: boolean;
    rpcWalletConfigured: boolean;
    signerConfigured: boolean;
    singlePayoutLimitConfigured: boolean;
    dailyPayoutLimitConfigured: boolean;
    reserveConfigured: boolean;
    recordReconciledAtMs: number | null;
    latestReconciliationStatus: string | null;
    latestReconciliationAtMs: number | null;
    latestReconciliationVarianceAtomic: bigint | null;
  };
  eligibleMfaOperatorCount: number;
  unresolvedQuarantineCount: number;
  unknownBroadcastCount: number;
  nowMs: number;
  walletHealthMaximumAgeMs: number;
};

export type PayoutActivationReadiness = {
  eligible: boolean;
  blockers: string[];
};

export function evaluatePayoutActivationReadiness(
  facts: PayoutActivationReadinessFacts,
): PayoutActivationReadiness {
  const blockers: string[] = [];
  if (!facts.environment.payoutsEnabled) blockers.push('PAYOUT_ENVIRONMENT_GATE_DISABLED');
  if (!facts.environment.requestsEnabled) blockers.push('PAYOUT_REQUEST_ENVIRONMENT_GATE_DISABLED');
  if (!facts.environment.signingEnabled) blockers.push('PAYOUT_SIGNING_ENVIRONMENT_GATE_DISABLED');
  if (!facts.environment.broadcastEnabled)
    blockers.push('PAYOUT_BROADCAST_ENVIRONMENT_GATE_DISABLED');
  if (!facts.environment.executionNetwork) blockers.push('PAYOUT_EXECUTION_NETWORK_UNSET');
  if (facts.environment.executionNetwork && !facts.environment.runtimeSupportsTarget)
    blockers.push('PAYOUT_EXECUTION_RUNTIME_UNSUPPORTED');
  if (!facts.asset.configured) blockers.push('PAYOUT_ASSET_NOT_CONFIGURED');
  else if (!facts.asset.enabled) blockers.push('PAYOUT_ASSET_DISABLED');

  if (!facts.databaseControl.configured) blockers.push('PAYOUT_CONTROL_NOT_CONFIGURED');
  if (facts.databaseControl.paused) blockers.push('PAYOUT_CONTROL_PAUSED');
  if (!facts.databaseControl.requestsEnabled) blockers.push('PAYOUT_REQUEST_CONTROL_DISABLED');
  if (!facts.databaseControl.signingEnabled) blockers.push('PAYOUT_SIGNING_CONTROL_DISABLED');
  if (!facts.databaseControl.broadcastEnabled) blockers.push('PAYOUT_BROADCAST_CONTROL_DISABLED');

  if (!facts.route.configured) blockers.push('PAYOUT_ROUTE_NOT_CONFIGURED');
  if (!facts.route.active) blockers.push('PAYOUT_ROUTE_NOT_ACTIVE');
  if (!facts.wallet.configured) blockers.push('PAYOUT_WALLET_NOT_CONFIGURED');
  if (!facts.wallet.enabled) blockers.push('PAYOUT_WALLET_DISABLED');
  if (!facts.wallet.rpcWalletConfigured) blockers.push('WATCH_ONLY_RPC_WALLET_NOT_CONFIGURED');
  if (!facts.wallet.signerConfigured) blockers.push('ISOLATED_SIGNER_KEY_NOT_CONFIGURED');
  if (!facts.wallet.singlePayoutLimitConfigured)
    blockers.push('SINGLE_PAYOUT_LIMIT_NOT_CONFIGURED');
  if (!facts.wallet.dailyPayoutLimitConfigured) blockers.push('DAILY_PAYOUT_LIMIT_NOT_CONFIGURED');
  if (!facts.wallet.reserveConfigured) blockers.push('HOT_WALLET_RESERVE_NOT_CONFIGURED');

  if (
    !Number.isSafeInteger(facts.walletHealthMaximumAgeMs) ||
    facts.walletHealthMaximumAgeMs <= 0
  ) {
    blockers.push('WALLET_HEALTH_WINDOW_INVALID');
  }
  const reconciliationIsFresh =
    facts.wallet.latestReconciliationStatus === 'MATCHED' &&
    facts.wallet.latestReconciliationVarianceAtomic === 0n &&
    facts.wallet.recordReconciledAtMs !== null &&
    facts.wallet.latestReconciliationAtMs !== null &&
    facts.wallet.recordReconciledAtMs <= facts.nowMs &&
    facts.wallet.latestReconciliationAtMs <= facts.nowMs &&
    facts.nowMs - facts.wallet.recordReconciledAtMs <= facts.walletHealthMaximumAgeMs &&
    facts.nowMs - facts.wallet.latestReconciliationAtMs <= facts.walletHealthMaximumAgeMs;
  if (!reconciliationIsFresh) blockers.push('HOT_WALLET_NOT_RECENTLY_RECONCILED');
  if (facts.eligibleMfaOperatorCount < 2)
    blockers.push('TWO_PERSON_MFA_OPERATOR_COVERAGE_REQUIRED');
  if (facts.unresolvedQuarantineCount > 0) blockers.push('UNRESOLVED_PAYOUT_QUARANTINE');
  if (facts.unknownBroadcastCount > 0) blockers.push('UNKNOWN_BROADCAST_ATTEMPT');

  return { eligible: blockers.length === 0, blockers };
}
