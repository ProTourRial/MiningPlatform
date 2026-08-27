# Payout Acceptance Matrix

**Status:** P0 acceptance contract; payout remains gated and no real broadcast is authorized.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/payout-acceptance`

## 1. Preconditions

A payout test requires a disposable environment, synthetic account, validated account-scoped destination, approved asset/network policy, sufficient synthetic balance, a known reward/ledger source, and a deterministic idempotency key. Test data must not contain private keys, seed phrases, or production addresses.

## 2. Acceptance matrix

| Scenario | Preconditions | Expected API/UI | Expected audit/evidence | Result |
|---|---|---|---|---|
| Below minimum | Balance below approved threshold | Eligibility denied; clear reason; no reservation | Eligibility event with policy ID and threshold | Pass when no funds move |
| Immature reward | Source block below maturity | Payout remains gated/held | Block height, required depth, current depth | Pass when no reservation is released |
| Invalid wallet | Checksum/network validation fails | Destination rejected before eligibility/reservation | Validation code and account ID; no address in metric labels | Pass when no signing path runs |
| Eligible payout | Mature reward, valid destination, threshold met | `eligible`; user sees amount/asset/network | Eligibility evidence and policy references | Pass |
| Reservation | Eligible request with fresh idempotency key | `reserved`; duplicate request returns same result | Reservation ID, liability snapshot, concurrency version | Pass without double reserve |
| Approval required | Reservation ready for maker-checker | Pending approval; no signer call | Approver role, approval event, timestamp | Pass |
| Signing | Approved synthetic batch | Signing state only in dummy signer mode | Signer request ID and policy checks | Pass without private key in repo |
| Broadcast | Synthetic provider accepts transaction | Broadcast/confirming state | Provider response, tx ID, fee, source | Pass only in simulation |
| Provider timeout | Broadcast response ambiguous | Payout paused; no blind retry | Ambiguous result, incident/audit ID | Pass |
| Confirmation | Synthetic confirmation depth met | Completed and liability closed | Confirmation evidence and reconciliation result | Pass |
| Broadcast rejection | Provider explicitly rejects | Failed state with recoverable reason | Rejection code and retry policy | Pass; no duplicate settlement |
| Reconciliation mismatch | Wallet/source differs from internal ledger | Payout paused; incident shown to operator | Delta, source snapshot, sign-off requirement | Pass |
| Wallet change lock | Destination recently changed | Payout locked until cooldown/step-up complete | Wallet change and lock events | Pass |

## 3. Normative payout gates

The order is mandatory: `requested → eligible → reserved → approved → signing → broadcast → confirming → completed/failed`. A request cannot skip a state. A failure after reservation requires an explicit release/reversal path; it must not silently make the balance spendable twice.

Eligibility requires account-scoped destination, asset/network match, checksum validation, ownership confirmation policy, maturity, minimum payout, no payout lock, no reserve breach, no reconciliation incident, and a current approved fee policy. Global support/donation addresses, including MP05's beneficiary destination, are never substituted for a missing or invalid user destination.

## 4. Acceptance evidence schema

Each scenario must capture `scenarioId`, `accountId`, payout request ID, idempotency key, asset, network, destination fingerprint rather than raw address, source reward IDs, policy IDs, state events, expected/actual result, correlation ID, audit ID, operator/tester, timestamp, and cleanup result. Raw private credentials and production transaction signing material are forbidden.

## 5. Exit criteria

The payout workstream is ready for implementation only when every scenario has an automated or executable manual test, a deterministic expected result, a failure/retry policy, and an evidence owner. Production payout remains blocked until signer isolation, node/provider reconciliation, backup/DR, security approval, legal/compliance approval, and release go/no-go are complete.
