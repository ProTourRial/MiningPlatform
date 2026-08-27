# P0 Release Evidence Index

**Status:** Evidence index template; not a release approval.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/release-evidence-index`

## 1. Evidence rules

Every release claim must link to a concrete artifact, commit, test result, reviewer, timestamp, known limitation, and expiry/revalidation date. A documentation branch is not evidence that the corresponding implementation is active. Evidence must be redacted and must not contain secrets, private keys, seed phrases, production credentials, or unapproved personal data.

## 2. P0 gate index

| Gate ID | Requirement                  | Evidence required                                                   | Owner             | Status    |
| ------- | ---------------------------- | ------------------------------------------------------------------- | ----------------- | --------- |
| P0-01   | Product decisions approved   | Decision log, owner, approver, effective date                       | Product           | `PENDING` |
| P0-02   | API contract aligned         | Contract commit, implementation source commit, drift result         | Engineering       | `PENDING` |
| P0-03   | State transitions safe       | FSM tests, illegal-transition evidence, replay evidence             | Engineering       | `PENDING` |
| P0-04   | Reward/block policy approved | Scheme decision, maturity/orphan/reorg policy, fixture result       | Finance/Treasury  | `PENDING` |
| P0-05   | Wallet/network safe          | BTC/BEP20 validation, ownership, cooldown/lock, audit evidence      | Security/Treasury | `PENDING` |
| P0-06   | Payout acceptance passed     | Scenario matrix, synthetic run, no-broadcast evidence               | QA/Operations     | `PENDING` |
| P0-07   | Payout maker-checker ready   | Role separation, batch digest, signer boundary, pause drill         | Treasury/Security | `PENDING` |
| P0-08   | Reconciliation closed        | Source snapshots, delta zero/approved exception, sign-off           | Finance           | `PENDING` |
| P0-09   | Observability complete       | Metric catalog, scrape/query, alerts, dashboard, retention          | Operations        | `PENDING` |
| P0-10   | Security/compliance approved | Threat model, scan, risk disposition, jurisdiction/KYC/AML decision | Security/Legal    | `PENDING` |
| P0-11   | HA/backup/DR verified        | Restore drill, RPO/RTO, failover/reconciliation evidence            | Operations        | `PENDING` |
| P0-12   | Deployment smoke passed      | Environment/version matrix, smoke run, rollback target              | Release owner     | `PENDING` |
| P0-13   | QA/UAT accepted              | Manual QA/UAT results, defect disposition, mobile/error evidence    | QA/Product        | `PENDING` |
| P0-14   | Release go/no-go signed      | Signed checklist, rollback authority, release notes input           | Product owner     | `PENDING` |

## 3. Evidence record template

```text
Evidence ID:
Gate ID:
Artifact URL/path:
Commit SHA:
Source baseline:
Environment:
Test command/scenario:
Expected result:
Actual result:
Reviewer:
Timestamp UTC:
Known limitations:
Expiry/revalidation date:
Audit/correlation ID:
Status:
```

## 4. Current known limitations

At the time of this index, native RandomX dispatch integration, accounting handoff, native Bitcoin template/coinbase pipeline, production signer, real broadcast, legal jurisdiction, and production payout remain gated or pending. These must not be represented as passed evidence merely because contracts, fixtures, or UI are present.

## 5. Go/no-go rule

Production release is `NO-GO` if any P0 gate is pending, has expired evidence, contains unexplained financial variance, has a critical security finding, lacks legal/compliance approval, or cannot demonstrate rollback and payout pause. Exceptions require written owner, rationale, expiry, compensating control, and explicit approval.
