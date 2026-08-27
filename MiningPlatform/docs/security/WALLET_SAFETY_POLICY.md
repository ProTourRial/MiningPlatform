# Wallet Safety Policy

- **Status:** Documentation-only safety policy
- **Branch:** `feat/wallet-safety-policy`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Address validation, network mismatch, wallet change cooldown, 2FA, payout lock, manual approval, emergency pause, hot/cold separation, dan signer isolation
- **Out of scope:** Wallet/payout implementation, schema, migration, RandomX, `upstream-stratum`, accounting backend, dan `CHANGELOG.md`

> **Policy boundary:** Valid address syntax tidak membuktikan ownership. User payout destination tidak boleh diganti oleh konfigurasi global, treasury, atau wallet donasi.

## 1. Address validation

Setiap destination harus menyimpan `accountId`, `assetId`, `networkId`, `routeId`, address fingerprint, status, policy version, dan audit reference.

| Route | Required validation | Reject |
|---|---|---|
| BTC native | Bitcoin mainnet parser, supported format, checksum, network/version, route compatibility | BEP20/EVM address, testnet address, malformed string |
| BEP20 | BNB Smart Chain chain ID, EVM checksum/normalization policy, token contract/decimals, route compatibility | BTC address, unsupported chain/token, invalid checksum |
| Future deposit | Explicit deposit route and custody policy | Reuse of user payout/treasury/donation route |

No address may reach signer or broadcast until syntax, network, asset, ownership/risk, cooldown, lock, route, and approval checks pass.

## 2. 2FA and step-up

- Register, activate, disable, or change payout destination requires authenticated interactive session and step-up verification.
- Step-up token is short-lived, single-use, session-bound, action-scoped, hashed at rest, and replay-resistant.
- Failed attempts are rate-limited and audited; recovery must not silently bypass cooldown or lock.
- API key-only context cannot perform high-risk wallet or payout mutation.
- Step-up success does not override sanctions/risk, network mismatch, ownership, or global payout gate.

## 3. Cooldown and payout lock

New/changed destination enters `COOLDOWN` or `OWNERSHIP_PENDING`; initial proposed cooldown is 24 hours pending approval. During cooldown:

- manual and automatic payout for affected account/route are locked;
- existing reservations are paused/re-evaluated, never silently redirected;
- auto-withdrawal `effective=false`;
- user sees expiry, reason, next action, and support path;
- address history remains immutable.

Repeated change, suspicious change, ownership failure, or incident may extend lock or require manual review. Lock release requires policy checks and audit; it does not automatically trigger payout.

## 4. Manual approval and maker-checker

Payout approval must bind to an immutable intent: amount, asset, network, destination fingerprint, policy version, expiry, and purpose. Maker and checker must be different actors for material movement. Approval is rejected when stale, replayed, revoked, out of scope, or inconsistent with the current destination/version.

Signer approval is not user approval; both identity and treasury controls must pass. Every approval/rejection records actor, role, reason, request ID, correlation ID, audit ID, and incident reference where relevant.

## 5. Wallet topology

| Class | Purpose | Exposure | Rule |
|---|---|---:|---|
| Hot wallet | Limited operational payout liquidity | Highest | Strict cap, allowlist, velocity limit, maker-checker, emergency stop |
| Warm wallet | Replenishment/settlement buffer | Medium | Offline or restricted signing, scheduled review, dual control |
| Cold wallet | Reserve custody | Lowest | Offline/key ceremony, no automated user payout path |
| Pool treasury | Platform clearing/fee/reserve | Controlled | Never exposed as user fallback destination |
| Site donation wallet | MP05 beneficiary/donation | Separate | Explicit beneficiary policy; never user payout fallback |

## 6. Signer isolation

- Web/API/frontend never receives or stores private keys or seed phrases.
- Signer accepts typed, approved intent and revalidates asset/network, destination fingerprint, amount, policy, expiry, and limits.
- Signer runs under separate identity/network boundary with KMS/HSM policy and minimal database access.
- Signing audit stores key reference, not key material; logs contain no raw transaction secret.
- Rotation requires ceremony, dual control, test/reconciliation, retirement of old key, and incident review.
- Signer failure leaves payout recoverable/pending; API must not fall back to ad hoc signing.

## 7. Emergency pause

Security, treasury, or incident commander may pause wallet registration, activation, payout, signing, or broadcast globally or by asset/network/route/account. Pause must be versioned, audited, visible to operators/users, and reversible only through approved resume procedure.

A pause is not permission to use another address. There is **no automatic fallback wallet**. Provider fallback may change transport/provider but never changes user destination.

## 8. Required audit events

`PAYOUT_DESTINATION_REGISTERED`, `PAYOUT_DESTINATION_VALIDATION_FAILED`, `PAYOUT_DESTINATION_NETWORK_MISMATCH`, `PAYOUT_DESTINATION_VERIFIED`, `PAYOUT_DESTINATION_COOLDOWN_STARTED`, `PAYOUT_DESTINATION_CHANGED`, `WITHDRAWAL_LOCK_APPLIED`, `WITHDRAWAL_LOCK_RELEASED`, `PAYOUT_APPROVED`, `PAYOUT_PAUSED`, `PAYOUT_RESUMED`, `SIGNER_REQUESTED`, `SIGNER_DENIED`, `KEY_ROTATED`, dan `FALLBACK_DESTINATION_DENIED`.

Events include safe fingerprints and IDs, never full address, private key, seed, token, worker secret, or raw IP.

## 9. Acceptance criteria

- [ ] BTC and BEP20 routes reject wrong-network address before persistence.
- [ ] Checksum pass cannot bypass ownership/risk/cooldown/lock.
- [ ] 2FA/step-up is required for sensitive destination changes.
- [ ] User destination is account-scoped and cannot be global-auto-replaced.
- [ ] Cooldown applies withdrawal lock to manual and automatic payout.
- [ ] MP05 remains donation/referral beneficiary, never fallback wallet.
- [ ] Manual approval is maker-checker and intent-bound.
- [ ] Hot/warm/cold and treasury/donation separation is explicit.
- [ ] Signer is isolated, non-exporting, and revalidates intent.
- [ ] Emergency pause fails closed and has resume evidence.
- [ ] Audit events are immutable, searchable, and redacted.

No wallet safety implementation change is authorized by this documentation-only branch.
