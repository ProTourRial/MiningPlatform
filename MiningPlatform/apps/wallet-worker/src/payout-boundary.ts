/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const REGTEST_PAYOUT_ACK = 'disposable-regtest-funds-only';

export type PayoutActionControl = {
  paused: boolean;
  requestsEnabled: boolean;
  signingEnabled: boolean;
  broadcastEnabled: boolean;
};

export function assertPayoutActionControl(
  control: PayoutActionControl | null | undefined,
  action: 'prepare' | 'sign' | 'broadcast',
): void {
  if (!control) throw new Error('Database payout control is missing');
  if (control.paused) throw new Error('Database payout control is paused');
  if (!control.requestsEnabled) throw new Error('Database payout requests are disabled');
  if (action === 'prepare' && (!control.signingEnabled || !control.broadcastEnabled)) {
    throw new Error('Database payout controls are not fully enabled for the regtest trace');
  }
  if (action === 'sign' && !control.signingEnabled) {
    throw new Error('Database payout signing is disabled');
  }
  if (action === 'broadcast' && !control.broadcastEnabled) {
    throw new Error('Database payout broadcasting is disabled');
  }
}

export function assertRegtestPayoutBoundary(environment = process.env): void {
  const enabled = [
    'PAYOUTS_ENABLED',
    'PAYOUT_REQUESTS_ENABLED',
    'PAYOUT_SIGNING_ENABLED',
    'PAYOUT_BROADCAST_ENABLED',
  ];
  for (const name of enabled) {
    if (environment[name] !== 'true') throw new Error(`${name} must be true for regtest execution`);
  }
  if (environment.PAYOUT_EXECUTION_NETWORK !== 'regtest') {
    throw new Error('The wallet executor is restricted to PAYOUT_EXECUTION_NETWORK=regtest');
  }
  if (environment.PAYOUT_REGTEST_ACK !== REGTEST_PAYOUT_ACK) {
    throw new Error(`PAYOUT_REGTEST_ACK must equal ${REGTEST_PAYOUT_ACK}`);
  }
  if (environment.PAYOUT_MAINNET_ENABLED === 'true') {
    throw new Error('Mainnet payout execution is not implemented and must remain disabled');
  }
}
