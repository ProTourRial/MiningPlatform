# Deployment Smoke Test Specification

**Status:** Executable checklist contract; no real payout or broadcast.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/deployment-smoke-tests`

## 1. Preconditions

Run against a disposable or approved staging environment with synthetic accounts, mock/test node/provider, payout mode disabled or simulation-only, and no production signer credentials. Record deployment ID, API/web versions, contract source commits, environment, tester, and timestamp.

## 2. Smoke matrix

| ID     | Check               | Expected result                                                                                         | Evidence                            |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SM-001 | Landing page        | Loads with alpha/payout-gated copy; no console-breaking error                                           | URL, screenshot, console summary    |
| SM-002 | Version             | Web/API expose compatible contract/build version                                                        | Response and deployment ID          |
| SM-003 | Health              | Liveness responds without leaking dependency secrets                                                    | HTTP status/body                    |
| SM-004 | Readiness           | Reports dependency and payout mode safely; gated mode never claims financial readiness                  | Response and config posture         |
| SM-005 | Register            | Synthetic user can register or test fixture is provisioned                                              | Account ID, redacted response       |
| SM-006 | Login/logout        | Session is issued, revoked on logout, and not reusable                                                  | Cookie/session evidence             |
| SM-007 | Refresh session     | Refresh follows rotation/revocation policy                                                              | Session IDs fingerprinted, not raw  |
| SM-008 | Protected dashboard | Anonymous user is denied; authenticated user sees safe empty state                                      | HTTP/UI evidence                    |
| SM-009 | Worker              | Synthetic worker can be created/rotated without exposing credential                                     | Worker fingerprint and audit event  |
| SM-010 | Wallet validation   | Valid route accepted; wrong network/checksum rejected                                                   | Validation code and audit event     |
| SM-011 | Payout gate         | UI/API clearly reports gated; no signer/broadcast call occurs                                           | Request trace and provider mock log |
| SM-012 | Error boundary      | Controlled 4xx/5xx maps to safe error envelope and correlation ID                                       | Response and log correlation        |
| SM-013 | Observability       | Required health/payout/ledger/randomx metric families are present or explicitly disabled by environment | Metric scrape/query evidence        |
| SM-014 | Rollback marker     | Deployment metadata can identify version and previous rollback target                                   | Release evidence                    |

## 3. Failure policy

A critical smoke failure blocks traffic promotion. A payout/signing/broadcast invocation in a supposedly disabled environment is a release-blocking security incident. Secrets in response/logs, contract mismatch, missing correlation IDs, or non-zero reconciliation signal also block promotion.

## 4. Cleanup

Delete synthetic accounts, workers, sessions, reservations, test artifacts, and provider mocks according to the environment retention policy. Preserve only redacted evidence and audit IDs. Never clean up by deleting production data or altering immutable financial records.

## 5. Exit criteria

All applicable checks pass, skipped checks have an approved reason, no protected path was changed by the smoke test, and the release owner signs the result. Passing smoke tests does not approve production payout; it is one gate among security, backup/DR, compliance, reconciliation, and go/no-go approval.
