# P2 E2E Integration Test Plan

**Status:** Executable plan and safe runner; production payout/broadcast is prohibited.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/e2e-integration-testing`

## 1. Safety contract

All E2E runs must use a disposable or explicitly approved staging environment with synthetic accounts, test-only wallet destinations, a mock/test node or provider, and payout mode disabled or simulation-only. The runner refuses an unspecified environment and refuses remote targets unless the caller explicitly confirms that the target is synthetic. No private keys, seed phrases, production credentials, or production addresses may be used.

## 2. End-to-end journey

| Stage          | Scenario                                        | Required outcome                                  |
| -------------- | ----------------------------------------------- | ------------------------------------------------- |
| Anonymous      | Landing, transparency, version, health          | Safe public response and alpha/gated copy         |
| Authentication | Register/login/logout/refresh                   | Session lifecycle and revocation are correct      |
| Worker         | Create, list, credential rotation, disable      | Account scope, redaction, audit evidence          |
| Wallet         | BTC/BEP20 validation and change                 | Network separation, ownership gate, cooldown/lock |
| Mining         | Job/worker/share path in synthetic mode         | Accepted/stale/duplicate share classifications    |
| Reward         | Immature to mature and allocation               | State transition, fee policy, no double credit    |
| Payout         | Eligibility/reservation/approval simulation     | No bypass, idempotency, maker-checker evidence    |
| Reconciliation | Source snapshot versus ledger projection        | Zero/approved variance and incident path          |
| Recovery       | Timeout, retry, provider down, reorg simulation | Safe retry, pause, reversal, and audit trail      |

## 3. Runner contract

The runner is invoked with `E2E_ENV=disposable` or `E2E_ENV=staging`, `E2E_BASE_URL`, and an optional manifest path. The default manifest covers health/readiness and status routes. Authenticated mutations, worker creation, wallet change, reward allocation, and payout simulation require a separately provisioned synthetic fixture harness and must not be faked by the public smoke runner.

Each response records case ID, method, path, status, expected statuses, elapsed time, redacted body excerpt, and pass/fail. Reports use schema `p2-e2e-report.v1`; raw authorization/cookie/token/secret/password values are redacted.

## 4. Failure policy

A safety-gate failure exits with a distinct non-zero code. A network error, unexpected status, timeout, missing readiness, contract mismatch, unredacted secret, payout invocation in disabled mode, duplicate side effect, or unexplained reconciliation delta blocks the E2E run. A blocked scenario must record its dependency and must not be marked as passed.

## 5. Evidence and cleanup

Evidence includes deployment ID, source/build/contract commits, environment, manifest, report path, synthetic fixture version, test run ID, correlation/request/audit IDs, and cleanup result. Cleanup revokes sessions, disables synthetic workers, releases disposable reservations, removes test queues, and preserves only redacted evidence. Immutable ledger or audit entries are never deleted to make a test green.

## 6. Exit criteria

The P2 E2E workstream is ready for broader load testing when the safe runner passes on disposable/staging, authenticated fixture journeys pass without side-effect duplication, failure/retry/reconciliation scenarios are evidenced, and no production target or signer/broadcast path is reachable from the test environment.
