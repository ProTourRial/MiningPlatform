# Release Governance Execution Guide

**Status:** Working governance contract; not a release approval.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/release-acceptance-governance`

## 1. Release lifecycle

| Stage | Purpose | Minimum gate | Allowed financial posture |
|---|---|---|---|
| Alpha | Validate contracts and disposable flows | Security baseline, synthetic QA, explicit risk disclosure | No real payout, signing, custody, or broadcast |
| Beta | Controlled pilot with approved users/limits | P0 evidence, monitoring, support, rollback, legal/compliance decision | Only explicitly approved pilot mode |
| Production | General availability under approved operating model | All release evidence, go/no-go, rollback, DR, support, compliance | Only approved routes and limits |

A release cannot advance solely because build or UI tests pass. Financial readiness requires state, wallet, reconciliation, signer, observability, security, legal, and operational evidence.

## 2. Change classification

| Class | Example | Required review |
|---|---|---|
| Documentation-only | Policy, runbook, copy, checklist | Owner review; no production activation |
| Low-risk code | Pure validator, typed contract, test-only helper | Engineering review and unit/type/lint evidence |
| Operational | Environment, alert, limit, deployment config | Engineering + Operations + Security |
| Financial | Reward, ledger, reservation, payout, fee, wallet routing | Engineering + Finance/Treasury + Security + Product |
| Migration | Schema/data migration or rollback | Migration owner + DBA + Engineering + release authority |
| Security-sensitive | Signer, secret, auth, rate limit, DDoS, KYC/AML | Security approval and incident/rollback plan |

## 3. Branch and pull request policy

Every change uses a branch with one purpose and a PR. Direct pushes to protected `main` are prohibited. The PR description must include scope, baseline commit, files changed, risk, dependencies, tests, evidence, rollback, unresolved decisions, and whether financial behavior changes.

Required checks include formatting/diff check, typecheck, lint, applicable unit/integration tests, security scan, dependency/license review, deployment smoke where relevant, and evidence index update. A reviewer must confirm that no frozen Codex path or unrelated change entered the PR.

## 4. Signed commits and provenance

Release commits must use the repository's approved signed-commit policy and retain commit SHA, author, reviewer, source baseline, build artifact digest, and deployment ID. A documentation branch must not claim signed production provenance until the release commit itself satisfies the policy.

## 5. Migration approval

A migration requires a reviewed plan, forward compatibility assessment, backup/PITR verification, dry run or disposable rehearsal, expected runtime, lock/availability impact, rollback or compensating strategy, owner, and approval. No migration is executed as part of this documentation branch. Irreversible migrations require explicit release authority and a tested recovery plan.

## 6. Rollback authority

The release owner may initiate application rollback. Finance/Treasury or the incident commander may immediately pause payout for financial ambiguity, reserve breach, wallet compromise, broadcast ambiguity, or reconciliation mismatch. Security may revoke credentials or isolate signer/traffic. Rollback and pause actions must be auditable and must not delete immutable ledger evidence.

## 7. Go/no-go checklist

| Gate | Required result | Owner |
|---|---|---|
| Contract/source drift | No unexplained drift; baseline recorded | Engineering |
| Financial invariants | Journal, allocation, reservation, fee, reversal, reconciliation pass | Finance engineering |
| Wallet/network | BTC/BEP20 validation, ownership, cooldown, lock, no fallback | Security/Treasury |
| Payout controls | Eligibility, maker-checker, signer, broadcast, confirmation, pause | Treasury/Operations |
| Observability | Metric catalog, dashboards, alerts, correlation/audit propagation | Operations |
| Security | Threat model, scan, secret rotation, signer isolation, abuse controls | Security |
| Compliance/legal | Jurisdiction, KYC/AML, sanctions, privacy, terms, risk disclosure | Legal/Compliance |
| HA/DR | Failover, backup restore, PITR, RPO/RTO, divergence evidence | Operations |
| QA/UAT | Manual, API integration, smoke, mobile/accessibility, failure/retry | QA/Product |
| Rollback | Tested target and authority | Release owner |
| Approval | Signed go/no-go with expiry and known limitations | Product owner |

Any missing critical gate is `NO-GO`. A waiver must state scope, risk, owner, compensating control, expiry, and explicit approver.

## 8. Post-release review

Within the approved review window, the release owner compares incidents, error/latency/reconciliation metrics, support cases, rollback triggers, and financial variance against the release assumptions. Any drift or failed assumption creates a corrective action and may trigger payout pause or rollback.
