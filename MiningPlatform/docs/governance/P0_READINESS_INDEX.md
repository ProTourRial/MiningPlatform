# MiningPlatform P0 Readiness Index

**Status:** Integration planning index; not a production approval.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/p0-readiness-index`

## 1. P0 objective

P0 is complete only when the pool can safely prove contribution, reward, wallet destination, payout, ledger, reconciliation, observability, security, compliance, and deployment behavior in a disposable or approved environment. All financial flows must be deterministic, idempotent, auditable, reversible by compensating event, and fail closed under ambiguity.

## 2. Workstream dependency map

| Order | Workstream                        | Depends on                       | Acceptance evidence                                               | Current posture                                                   |
| ----: | --------------------------------- | -------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
|     1 | Product governance/open decisions | Stakeholders                     | Approved decision log with owner/date/rationale                   | Documentation ready; approvals pending                            |
|     2 | API contract                      | Product decisions                | Endpoint contract, error/idempotency, source/runtime drift result | Documentation ready; implementation alignment pending             |
|     3 | State machines                    | Product/API                      | Legal transitions, tests, audit/idempotency evidence              | Pure domain guard implemented; durable integration pending        |
|     4 | Wallet/network                    | API/security                     | BTC/BEP20 checksum/network/ownership/cooldown evidence            | Validator implemented; controller/persistence integration pending |
|     5 | Reward/block policy               | Product/treasury                 | Scheme decision, maturity/orphan/reorg fixtures                   | Policy ready; native block source pending                         |
|     6 | Fee/referral                      | Product/finance                  | Conservation and attribution fixtures, effective policy           | Policy ready; active engine alignment pending                     |
|     7 | Eligibility/reservation           | Wallet/reward/ledger             | No-bypass eligibility and reservation evidence                    | Contract ready; accounting boundary pending                       |
|     8 | Payout operations                 | Eligibility/reservation/security | Maker-checker, signer, broadcast, confirmation, reconciliation    | Runbook ready; signer/broadcast pending                           |
|     9 | Reconciliation                    | Ledger/node/provider             | Source snapshots, zero/approved variance, sign-off                | Runbook ready; source integration pending                         |
|    10 | Observability                     | All critical flows               | Metric catalog, label tests, alerts, dashboard, retention         | Contract/package implemented; runtime instrumentation pending     |
|    11 | Security/compliance/legal         | Product/operations               | Threat model, scan, jurisdiction/KYC/AML/legal approval           | Drafts ready; professional approval pending                       |
|    12 | HA/backup/DR                      | Deployment/data topology         | Failover, restore, PITR, RPO/RTO, divergence evidence             | Plans ready; drills pending                                       |
|    13 | QA/UAT/smoke                      | API/UI/runtime                   | Disposable E2E, manual QA, UAT, smoke result                      | Plans/checklists ready; full runtime pending                      |
|    14 | Release evidence/go-no-go         | All prior gates                  | Evidence index, signed checklist, rollback target                 | Governance ready; gates pending                                   |

## 3. P0 Definition of Done

A P0 item is done only when its branch is pushed, diff is scoped, tests or deterministic fixtures pass, owner and reviewer are recorded, unresolved decisions are visible, acceptance evidence is linked, and the change is compatible with the latest source baseline. Documentation-only branches must remain labeled as contracts and must not be described as live features.

The P0 release is not done until the following all hold:

1. Product, reward, fee, minimum payout, maturity, reserve, SLA, jurisdiction, and payout mode decisions are approved.
2. API, state machine, wallet/network, fee, reward/block, and observability contracts show no unresolved drift against the implementation baseline.
3. Accepted contribution evidence, reward allocation, fee/referral, reservation, payout, and reconciliation are durable and idempotent.
4. Wallet destinations are account-scoped, network-validated, ownership-gated, cooldown/lock protected, and never replaced by global/default/donation addresses.
5. Payout has eligibility, reservation, maker-checker, isolated signer, broadcast ambiguity handling, confirmation, and reconciliation evidence.
6. Ledger invariants, reversal, rollback, source reconciliation, and no-double-credit fixtures pass in disposable environment.
7. Observability metrics/alerts/dashboards cover payout, ledger, wallet, RandomX, template freshness, and Stratum quality without sensitive labels.
8. Threat model, security scan, secrets rotation, signer isolation, DDoS/abuse response, privacy classification, KYC/AML, sanctions, tax, and legal jurisdiction gates pass.
9. PostgreSQL/Redis/Bitcoin Core availability, backup/restore, PITR, RPO/RTO, rollback, deployment smoke, and health/readiness checks pass.
10. Manual QA, API integration, UAT, mobile/accessibility, support, and failure/retry evidence pass with no open critical defect.
11. Release evidence index is complete, expiry dates are valid, go/no-go is signed, and rollback/payout pause authority is explicit.

## 4. Hard blockers

The following are hard blockers, not items to be waived by a documentation merge:

- RandomX authoritative dispatch/worker/accounting handoff is not complete and security-audited.
- Native Bitcoin template, coinbase, candidate, submit, confirmation, maturity, orphan, and reorg pipeline is not implemented and reconciled.
- Durable financial state and ledger integration has not passed invariant, idempotency, and reconciliation tests.
- Signer isolation, maker-checker, broadcast watcher, replacement policy, and production wallet reconciliation are not proven.
- Legal jurisdiction, KYC/AML, sanctions, tax, privacy, and custody/service classification remain unresolved.
- Production observability, HA, backup/DR, deployment smoke, and rollback evidence are missing or stale.

## 5. Checkpoint handoff

After Codex completes RandomX v20, migration, security scan, and final commit/push, every affected branch must be rebased or compared against the new main baseline. The API source commit, metric catalog, state transition names, wallet policy, and deployment compatibility must be drift-checked. Tests and smoke evidence must be rerun; `CHANGELOG.md` remains unchanged until release history is final.
