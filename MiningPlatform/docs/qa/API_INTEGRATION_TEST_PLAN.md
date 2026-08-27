# API Integration Test Plan

**Status:** Test plan and fixture contract; no real funds or production integration.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/api-integration-test-plan`

## 1. Environment and safety

Tests run in a disposable environment with synthetic accounts, test-only wallet destinations, mock/test node/provider, payout disabled or simulation-only, and no production credentials. Each run has a run ID, isolated namespace, seed version, cleanup report, and evidence directory. A test must fail if it detects a production endpoint, production signer, or real broadcast capability.

## 2. Matrix

| Area           | Scenarios                                                                 | Required assertions                                           |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Auth/session   | Register, login, logout, refresh, expired session, revoked session        | Status/error envelope, cookie policy, no session reuse        |
| Worker         | Create, duplicate name, credential rotation, disable, unauthorized access | Scope, validation, audit event, secret redaction              |
| Reward         | Mature/immature, allocation, duplicate allocation, policy reference       | State, digest, idempotency, ledger evidence                   |
| Wallet         | BTC valid, BTC wrong network, BEP20 checksum, invalid/changed wallet      | Validation code, ownership gate, cooldown/lock, audit         |
| Payout         | Below minimum, eligible, reserve conflict, approval, failure, timeout     | State machine, no blind retry, no double reservation          |
| Referral/fee   | No referral, valid referral, MP05, expired/disabled code                  | Fee conservation, beneficiary attribution, no fallback wallet |
| Reconciliation | Zero, non-zero, missing source, repeated run                              | Variance handling, incident, immutable evidence               |
| Observability  | Correlation/request/audit propagation and required metric labels          | IDs present, labels bounded, no sensitive data                |

## 3. Seed data

Seed data must define account IDs, worker IDs, contribution/reward IDs, block states, wallet destinations, policy IDs, fee policy, minimum/maturity values, reserve posture, and expected ledger/source digests. Seed values are synthetic and versioned; the test never uses private keys or production addresses.

## 4. Idempotency and concurrency assertions

Every retriable financial request includes an idempotency key. Repeating the same request returns the original outcome without a second reservation, allocation, fee, or payout. Reusing a key for a different intent returns a conflict. Concurrent requests use optimistic version/conditional write evidence; one winner is accepted and the loser receives a safe conflict response.

## 5. Cleanup

Cleanup revokes sessions, disables synthetic workers, removes disposable queues, closes test reservations, records remaining artifacts, and preserves only redacted evidence and audit IDs. Cleanup must not mutate immutable financial entries or delete production data.

## 6. Exit criteria

All applicable scenarios pass, no production endpoint/signer/broadcast is detected, failures have a deterministic error code, audit/correlation evidence is retained, and an owner signs the result. A passing integration test plan is required but insufficient for production payout without release/security/legal/reconciliation gates.
