# Release Governance

- **Status:** Documentation-only governance draft
- **Branch:** `feat/release-governance`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Alpha/beta/production definitions, release criteria, migration approval, signed commits, branch protection, PR policy, rollback authority, dan go/no-go
- **Out of scope:** Repository settings changes, code implementation, migration execution, RandomX, `upstream-stratum`, accounting implementation, dan `CHANGELOG.md`

> Branch ini mendefinisikan governance; ia tidak mengubah branch protection GitHub secara otomatis dan tidak memberi kewenangan untuk mengaktifkan payout.

## 1. Release vocabulary

| Stage | Meaning | User/funds posture | Required evidence |
|---|---|---|---|
| **Alpha** | Fondasi masih berkembang; contract, provider, feature, atau operational gate belum final | Internal/allowlisted use; payout and custody disabled by default; no ROI promise | Scope disclosure, known gaps, targeted tests, rollback path |
| **Beta** | Core workflow usable pada controlled population; breaking changes masih mungkin dengan notice | Limited external users; controlled funds only if separate signed gate passes; limits/holds active | End-to-end, load/soak, security review, support/runbooks, incident drills |
| **Production** | Contract, operations, security, financial truth, and support are owned and measured | Public availability according to approved terms/SLA; payout only through approved custody/control policy | Release evidence, approvals, monitoring, backup/restore, rollback, post-launch owner |

The current repository baseline is **alpha** unless a later release record explicitly states otherwise. A polished frontend or successful build does not change the stage.

## 2. Release criteria

Every release candidate must have a release record containing:

- source commit(s), image digest, API contract version, schema version, configuration fingerprint, and build timestamp;
- scope of changed domains and explicit non-goals;
- test summary: unit, integration, contract, E2E, security, dependency, load, soak, failover, backup/restore, and manual QA;
- known issues, severity, owner, workaround, and customer impact;
- migration status and approval, if any;
- observability dashboard/alert evidence and on-call owner;
- rollback target, compatibility statement, and recovery authority;
- sign-off list for product, engineering, security, operations, finance/treasury, and legal/compliance as applicable.

### Mandatory gates by stage

| Gate | Alpha | Beta | Production |
|---|---:|---:|---:|
| Build/lint/typecheck | Required | Required | Required |
| Unit/integration/contract test | Relevant scope | Full critical scope | Full release scope |
| Manual QA | P0 smoke | P0/P1 critical journeys | P0/P1 plus supported devices |
| Security review | Threat model baseline | Remediation review | Independent/sign-off review |
| Financial invariant vectors | Documentation/fixture | Passing critical vectors | Passing plus reconciliation evidence |
| Backup/restore drill | Local/staging | Staging | Production-equivalent and recurring |
| Load/soak/failover | Planned | Evidence for critical services | Thresholds and SLO evidence |
| Payout | Disabled | Manual controlled pilot only if separately approved | Approved controlled/automated mode |
| Public disclosure | Alpha limitations | Beta limitations/risk | Terms/privacy/SLA/support/status |

## 3. Migration approval

This policy does not execute migrations. Any migration requires:

1. ADR with purpose, schema/data impact, lock behavior, security/financial risk, alternatives, and rollback/forward-fix plan.
2. Fresh-install and upgrade tests on production-matching PostgreSQL.
3. Sanitized production-size rehearsal with duration, row counts, lock/replication observations, and failure recovery.
4. Backup/PITR verification and tested restore target.
5. Expand/contract or equivalent compatibility plan for rolling deploys.
6. Explicit approval from database owner; finance/accounting owner for financial tables; security for sensitive data; product owner for user-visible behavior.
7. Deployment window, monitoring, stop conditions, migration owner, and rollback authority.
8. Post-migration invariant check: ledger balance, idempotency, outbox, audit continuity, API contract, and read model.
9. Release record linking migration ID/checksum and the exact source commit.

Destructive down migrations are not a default rollback. Posted financial facts are corrected through reversal/reconciliation, not by editing or deleting rows.

## 4. Signed commit and artifact policy

- Commits on protected branches must use the approved signed-commit mechanism (SSH/GPG signing or organization-approved equivalent).
- CI verifies signature status, author identity, trusted key validity, and that release tag points to the reviewed commit.
- Release tags are immutable by policy; if a tag is wrong, create a new tag and record the correction.
- Build artifact includes commit SHA, source date, image digest, dependency lockfile hash, API contract version, and schema version.
- CI must fail if secrets, development tokens, production wallet material, or unapproved generated manifests are included.
- Dependabot/security updates and generated files follow the same review/verification rules.
- A commit being signed does not imply that its code is secure or production-approved; it proves provenance only.

## 5. Branch protection policy

The repository owner should configure the following on `main` and release branches:

- pull request required; direct push disabled except approved emergency procedure;
- at least two reviewers for financial, wallet, security, migration, or release-governance changes;
- CODEOWNERS review for API, database, payout, security, infrastructure, and documentation policy;
- required CI checks: lint, typecheck, tests, contract, security/dependency scan, build, and relevant smoke/QA;
- branch up-to-date requirement before merge;
- signed commits and verified status checks required;
- force-push and branch deletion restricted;
- secret scanning, dependency alerts, and audit log enabled;
- merge queue or equivalent serialized merge for high-risk changes;
- no auto-merge for payout, signer, schema, migration, or policy changes;
- emergency bypass requires incident ID, owner authorization, post-incident review, and follow-up PR.

Readiness branches are reference branches. They may be reviewed independently and must not be merged merely because they contain documentation.

## 6. Draft PR policy

Every PR must include:

1. **Purpose and scope:** what changes and what deliberately does not change.
2. **Traceability:** link to goal/requirement, API/state-machine/observability contract, test vector, and acceptance evidence.
3. **Risk:** financial, security, availability, privacy, migration, compatibility, and rollback risks.
4. **Files touched:** explicit protected/frozen-area statement.
5. **Verification:** exact commands, environment, commit, test result, and known blocked tests.
6. **Deployment:** config changes, health/readiness, observability, smoke test, rollout, and rollback.
7. **Data/funds:** whether it changes ledger, payout, wallet, secret, migration, or user-visible policy.
8. **Approval:** required reviewers and decision owner.

Draft PRs are appropriate for contracts, design, and reference documents. A draft PR must not be treated as implementation approval or release approval. Keep `CHANGELOG.md` unchanged until the relevant Codex milestone and final release history are approved.

## 7. Rollback authority

| Situation | Primary authority | Required coordination |
|---|---|---|
| Web/API availability regression | Incident commander/operations | Engineering owner; security if data exposure |
| DB/Redis/node degradation | Operations/database owner | Incident commander; finance if financial state affected |
| Ledger imbalance/reconciliation mismatch | Finance/accounting owner + incident commander | Security, database, product, owner |
| Payout/signing anomaly | Security + treasury owner | Incident commander, finance, owner; pause immediately |
| Wallet/key compromise | Security incident commander | Treasury, infrastructure, legal/compliance, owner |
| Migration failure | Database owner | Release owner, operations, finance/security as applicable |
| Unauthorized policy/config change | Security owner | Owner, product, affected domain owner |

Any authorized rollback may pause service or payout but may not silently reverse blockchain transactions, edit posted ledger facts, or delete evidence. Resume requires explicit owner(s), scope, timestamp, and verification checklist.

## 8. Go/no-go checklist

### Scope and provenance

- [ ] Release stage is explicitly `ALPHA`, `BETA`, or `PRODUCTION`.
- [ ] Source commit, artifact digest, API contract, schema version, and config fingerprint match the release record.
- [ ] Signed commit/tag and CI provenance are verified.
- [ ] Protected/frozen areas and unreviewed changes are absent or explicitly approved.

### Quality and operations

- [ ] Required CI/test/manual QA gates pass; blocked tests have owner and waiver.
- [ ] Health/readiness/version/metrics smoke tests pass.
- [ ] Observability dashboards, alert routes, log retention, and on-call are active.
- [ ] Backup freshness, restore evidence, RPO/RTO, and rollback target are verified.
- [ ] Known incidents and exceptions have a decision: block, mitigate, or accept with owner.

### Data and migration

- [ ] Migration approval is complete or release is migration-free.
- [ ] Fresh/upgrade/recovery behavior is verified where applicable.
- [ ] Ledger/reward/reconciliation invariant evidence is attached for financial changes.
- [ ] No direct posted-entry edit or unsafe fallback is part of rollback.

### Wallet and payout

- [ ] Wallet role/network policy, ownership, checksum, cooldown, lock, and audit are approved.
- [ ] Payout gate is explicitly set to the approved state; default remains OFF when gates are incomplete.
- [ ] Signer isolation, maker-checker, limits, emergency stop, node quorum, and reconciliation are verified.
- [ ] User terms, privacy, risk disclosure, fee/threshold/route status, and support path are current.

### Approval

- [ ] Product owner approves user-visible scope.
- [ ] Engineering owner approves implementation/compatibility evidence.
- [ ] Security approves threat/security evidence.
- [ ] Operations approves SLO, monitoring, backup, on-call, and rollback.
- [ ] Finance/treasury approves financial exposure and payout.
- [ ] Legal/compliance approves jurisdiction, custody, KYC/AML, sanctions, and tax posture where applicable.
- [ ] Incident commander/release owner records final **GO**, **GO WITH CONDITIONS**, or **NO-GO** decision.

## 9. Post-release review

At minimum, review at 15 minutes, 1 hour, 24 hours, and the first agreed business window. Compare error rate, event lag, share quality, database/cache/node health, ledger/reconciliation, payout queue, alert noise, and user support reports to baseline. A release is not complete until deviations are recorded and follow-up actions have owners and due dates.

This governance document does not authorize merging any readiness branch into `main` and does not override Codex audit, RandomX v20, migration, security, finance, or legal approval.
