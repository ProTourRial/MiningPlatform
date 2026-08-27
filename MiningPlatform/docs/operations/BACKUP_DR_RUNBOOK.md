# Backup and Disaster Recovery Runbook

**Status:** P0 operational runbook; no production restore or destructive action is executed by this branch.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/backup-dr-runbook`

## 1. Recovery objectives

RPO and RTO are pending Operations/Finance approval and must be recorded per service. Financial integrity is more important than fast recovery: if source, ledger, payout, or signer state is ambiguous, recovery must fail closed and pause payout.

| Service/data | Required decision | Minimum evidence |
|---|---|---|
| PostgreSQL ledger/reward/payout/audit | RPO/RTO, PITR window, retention | Restore checksum and reconciliation |
| Redis idempotency/queue/session | Durability, rebuildability, max loss window | Replay/queue recovery test |
| Node/provider source snapshots | Snapshot frequency and authoritative source | Block/tx/source digest |
| Object/log evidence | Retention, encryption, legal hold | Retrieval and access audit |
| Signer configuration/reference | Key recovery and rotation authority | Security-approved recovery drill |

## 2. Backup policy

Backups must be encrypted in transit and at rest, access-controlled, versioned, monitored, and independent from the primary failure domain. Ledger, payout, and audit data require immutable or append-protected retention. Secrets and signer keys are recovered through the approved secret-management process; private keys and seed phrases must never be copied into repository files or chat evidence.

A backup is not considered valid until restore verification proves it is readable, complete, from the intended point in time, and consistent with source checksums. A successful database dump alone is insufficient.

## 3. Restore drill

1. Declare a tabletop or controlled restore drill and assign incident commander, database owner, security reviewer, and reconciliation owner.
2. Select a redacted/synthetic backup and record backup ID, timestamp, checksum, retention class, and expected RPO.
3. Restore into an isolated disposable environment; never overwrite primary data.
4. Verify schema/runtime compatibility and application contract version without applying unapproved migration.
5. Verify ledger immutability, journal balance, payout state, reservation state, audit event continuity, and idempotency records.
6. Reconcile restored data against retained source snapshots and record every delta.
7. Exercise health/readiness, payout pause, operator access, and rollback to the prior disposable state.
8. Capture duration/RTO, data loss/RPO, checksum, reviewer sign-off, and remediation items.

## 4. Disaster scenarios

| Scenario | Immediate action | Recovery constraint |
|---|---|---|
| Primary database unavailable | Pause payout and write operations as policy requires; promote approved replica | No write split-brain or manual ledger edit |
| Corrupted database | Isolate primary; preserve evidence; restore verified point | Reconcile before reopening liability/payout |
| Redis loss | Pause idempotent financial jobs if keys/queue state is uncertain | Rebuild/replay only with durable event evidence |
| Region outage | Activate approved failover region | Confirm contract/version and source freshness |
| Object/log loss | Preserve remaining audit IDs; open security incident | Do not claim reconciliation complete without evidence |
| Signer/secret loss | Emergency pause; rotate/recover under security authority | No signing until signer boundary revalidated |

## 5. Key recovery

Key recovery requires dual authorization, documented custody, security review, access log, and post-recovery rotation where applicable. Recovery personnel must not paste secrets into issue trackers, repository, logs, or test fixtures. Any suspected exposure is treated as compromise and follows wallet compromise procedure.

## 6. Exit criteria

DR readiness requires approved RPO/RTO, scheduled encrypted backups, successful restore drill, divergence check, ledger/reconciliation evidence, tested payout pause, access review, key recovery plan, and documented remediation owner. Production payout remains blocked when backup verification or restore evidence is stale, incomplete, or ambiguous.
