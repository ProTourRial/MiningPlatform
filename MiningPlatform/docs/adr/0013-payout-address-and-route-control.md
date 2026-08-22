# ADR-0013: Payout Address and Route Control Foundation

**Status:** Accepted
**Date:** 2026-08-22
**Authority:** `PROJECT_VISION.md`

## Context

Payout destinations are financially sensitive even before MiningPlatform can sign or broadcast a transaction. A ticker alone cannot identify a chain, checksum validation does not prove private-key ownership, and an account takeover must not be able to replace a destination and immediately receive funds.

The alpha.7 milestone therefore needs a production-shaped address-control boundary without pretending that custody or payout execution exists.

## Decision

1. `Asset`, `AssetNetwork`, and versioned `PayoutRoute` are separate records. Route economics and safety settings are immutable; a policy change creates a new route version.
2. Route status is an explicit funds gate:
   - `ADDRESS_REGISTRATION` permits destination enrollment only and can never create a payout;
   - `PILOT` permits only controlled payouts entering `REVIEW`, and status-only updates cannot leave review until an approval control is implemented;
   - `ACTIVE` is reserved for a separately approved production path;
   - `DISABLED` permits neither registration nor funds movement.
3. A payout-address write requires the user's current interactive session plus password and TOTP. The resulting authorization is session-bound, scope-bound, stored only as a hash, expires after five minutes, and is consumed atomically once. API keys cannot mutate payout addresses or auto-withdrawal preferences.
4. Successful enrollment, login, factor disablement, and payout step-up share one monotonic TOTP counter. A counter accepted by any one flow cannot be reused by another or by a concurrent request. An enabled factor cannot be replaced until it is disabled with the current password and TOTP.
5. An address is validated against its exact network before persistence. Bitcoin alpha.7 validation covers Base58Check and BIP-173/BIP-350 Bech32/Bech32m checksum and witness-version rules.
6. Checksum validation proves address syntax and network only. It does not prove that the user controls the corresponding private key.
7. Address identity, route binding, validation evidence, and cooldown are database-protected. Activation is allowed only after cooldown; at most one address can be active for a user and route. Replacement disables the former address instead of rewriting it.
8. Normal API reads return a masked address and network-bound SHA-256 fingerprint, never the complete destination. API-key reads require an explicit `profile:read` scope.
9. Every issue, registration, activation, disablement, and failed factor replay is auditable.
10. `PAYOUTS_ENABLED=false` remains the default. Alpha.7 implements no eligibility, reservation, signing, broadcast, confirmation, or real-funds executor.

## Consequences

- A compromised session alone is insufficient to replace a payout destination.
- A compromised session alone cannot replace an already-enabled authentication factor, and login factor proof cannot be replayed as payout step-up proof.
- A destination cannot become immediately active after registration, even when its checksum is valid.
- Route and address history remain reproducible for audit and future payout reconciliation.
- The database rejects payouts linked to disabled/inactive addresses or registration-only routes, providing defense in depth beyond API checks.
- The database re-evaluates route gates on status-only changes; non-active routes may only move to the safe terminal states `FAILED` or `CANCELLED` until an approval-backed state machine exists.
- P0.4 steps 1 and 2 gain an auditable foundation; steps 3 through 7 and all custody approvals remain release blockers.

## Alternatives rejected

- Treating `Asset.symbol` as a network identifier: unsafe for multi-network assets.
- Editing one mutable route row: destroys historical policy evidence.
- Reusable elevated sessions: increases replay and takeover blast radius.
- Activating an address immediately after checksum validation: checksum validity is not ownership proof.
- Enabling a test broadcast in the same milestone: would cross the custody boundary before reservation, approvals, reconciliation, and incident controls exist.
