/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type PendingPayoutRequestIdentity = {
  fingerprint: string;
  idempotencyKey: string;
};

export function payoutRequestIdentity(
  current: PendingPayoutRequestIdentity | undefined,
  miningAccountId: string,
  amountAtomic: string,
  createUuid: () => string,
): PendingPayoutRequestIdentity {
  const fingerprint = JSON.stringify({ miningAccountId, amountAtomic });
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, idempotencyKey: `web:${createUuid()}` };
}

export function payoutRequestOutcomeIsAmbiguous(status?: number): boolean {
  return (
    status === undefined ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}
