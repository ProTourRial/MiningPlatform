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

export type PayoutExecutionScope = {
  payoutRouteId: string;
  payoutAddress: {
    payoutRouteId: string;
    status: 'COOLDOWN' | 'ACTIVE' | 'DISABLED';
    active: boolean;
    verified: boolean;
  };
  payoutRoute: {
    id: string;
    status: 'DISABLED' | 'ADDRESS_REGISTRATION' | 'PILOT' | 'ACTIVE';
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    payoutWallet: {
      enabled: boolean;
      signerKeyReference: string | null;
    } | null;
  };
  signingRequest: {
    signerKeyReference: string;
  } | null;
};

export class PayoutScopedAuthorizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PayoutScopedAuthorizationError';
  }
}

export function assertPayoutExecutionScope(scope: PayoutExecutionScope, now = new Date()): void {
  if (
    scope.payoutAddress.status !== 'ACTIVE' ||
    !scope.payoutAddress.active ||
    !scope.payoutAddress.verified
  ) {
    throw new PayoutScopedAuthorizationError(
      'PAYOUT_DESTINATION_REVOKED',
      'Payout destination is no longer active and verified',
    );
  }
  if (
    scope.payoutAddress.payoutRouteId !== scope.payoutRouteId ||
    scope.payoutRoute.id !== scope.payoutRouteId
  ) {
    throw new PayoutScopedAuthorizationError(
      'PAYOUT_ROUTE_BINDING_CHANGED',
      'Payout destination is no longer bound to the approved payout route',
    );
  }
  if (!['PILOT', 'ACTIVE'].includes(scope.payoutRoute.status)) {
    throw new PayoutScopedAuthorizationError(
      'PAYOUT_ROUTE_REVOKED',
      'Payout route is no longer enabled for execution',
    );
  }
  if (
    scope.payoutRoute.effectiveFrom.getTime() > now.getTime() ||
    (scope.payoutRoute.effectiveUntil !== null &&
      scope.payoutRoute.effectiveUntil.getTime() <= now.getTime())
  ) {
    throw new PayoutScopedAuthorizationError(
      'PAYOUT_ROUTE_NOT_EFFECTIVE',
      'Payout route is outside its approved effective window',
    );
  }
  const wallet = scope.payoutRoute.payoutWallet;
  if (!wallet?.enabled || !wallet.signerKeyReference) {
    throw new PayoutScopedAuthorizationError(
      'PAYOUT_WALLET_REVOKED',
      'Payout wallet or isolated signer key is no longer enabled',
    );
  }
  if (
    !scope.signingRequest ||
    scope.signingRequest.signerKeyReference !== wallet.signerKeyReference
  ) {
    throw new PayoutScopedAuthorizationError(
      'PAYOUT_SIGNER_BINDING_CHANGED',
      'Payout signer binding no longer matches the approved wallet',
    );
  }
}

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
