# Payout Operations and Maker-Checker

**Status:** Operational process contract; no real signing or broadcast.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/payout-operations`

## 1. Roles and separation

| Role                 | Permission                                                  | Prohibited                         |
| -------------------- | ----------------------------------------------------------- | ---------------------------------- |
| Eligibility operator | Review eligibility and exceptions                           | Approve own exception or sign      |
| Maker                | Prepare payout batch and attach evidence                    | Final approval or signer access    |
| Checker              | Review batch, limits, destination, fees, and reconciliation | Modify maker evidence silently     |
| Treasury approver    | Approve within limit and reserve policy                     | Bypass network/ownership gate      |
| Signer service       | Sign approved payload under isolated policy                 | Accept unsigned/unapproved request |
| Broadcast watcher    | Observe provider/node result and confirmations              | Blind retry ambiguous result       |
| Reconciliation owner | Close source-versus-ledger variance                         | Delete or edit posted ledger rows  |
| Incident commander   | Pause/resume affected scope                                 | Resume without sign-off evidence   |

Maker and checker must be distinct identities. Approval is scoped to an immutable batch digest, policy IDs, and destination fingerprints; changing any material field invalidates prior approval.

## 2. Batch contract

A batch contains a unique batch ID, account-scoped payout entries, asset/network, destination fingerprints, amount atomic, fee estimate, reservation IDs, eligibility evidence, state version, limits, expiry, and digest. A batch cannot contain mixed asset/network routes unless a separate approved policy explicitly supports that route.

Batch windows are a product/treasury decision. The operator must record creation time, cutoff, maximum count, maximum atomic amount, and expiry. Expired batches are cancelled or rebuilt with a new digest; they are not edited in place.

## 3. Required handoff sequence

1. Eligibility service produces deterministic results and no reconciliation incident exists.
2. Reservation is committed with idempotency and concurrency version.
3. Maker assembles the batch and verifies destination/network, fee, reserve, and evidence.
4. Checker independently recomputes the digest and validates all limits.
5. Treasury approver confirms policy and reserve capacity.
6. Isolated signer receives only the approved digest/payload and returns signer evidence.
7. Broadcast watcher submits once and classifies accepted, rejected, or ambiguous response.
8. Confirmation watcher tracks depth and reconciles source amount, transaction fee, and ledger liability.
9. Reconciliation owner closes the batch or opens an incident.

## 4. Emergency stop

Payout must be paused for affected asset/network or account scope when there is a wallet variance, ledger delta, ambiguous broadcast, signer compromise, invalid network route, reorg impact, reserve breach, or unexplained duplicate reservation. Emergency pause is fail-closed and does not erase existing reservations or audit evidence.

Resume requires incident ID, root-cause or bounded explanation, reconciliation result, security/treasury approval, and a new smoke test in dummy mode. A paused batch must not be force-retried without checking provider/node status and idempotency evidence.

## 5. Replacement and ambiguous broadcast

Replacement or fee-bump policy is network-specific and must be approved before implementation. If a broadcast response is ambiguous, the system queries the authoritative provider/node and transaction identity before retry. A new broadcast is forbidden while the original status is unresolved.

## 6. Acceptance evidence

Each payout batch retains maker/checker IDs, policy IDs, state transitions, reservation IDs, digest, signer request/evidence ID, provider result, transaction ID if available, confirmation observations, reconciliation source, alerts, and final sign-off. Raw private keys, seed phrases, and signer credentials never enter repository, logs, fixtures, or issue comments.
