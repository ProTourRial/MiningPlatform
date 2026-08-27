# PostgreSQL and Redis HA Readiness

**Status:** HA design contract; infrastructure changes are not applied by this branch.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/data-ha-readiness`

## 1. Availability objectives

RPO/RTO must be approved per service and recorded with owner. Financial integrity is the hard priority: if failover cannot establish a single authoritative write path or idempotency state, payout and financial writes pause.

| Service | Critical data | Required design | Fail-closed condition |
|---|---|---|---|
| PostgreSQL | Ledger, reward, payout, reservation, audit | Primary/standby, WAL/PITR, monitored replication, controlled promotion | Unknown primary, lag beyond approved RPO, split brain |
| Redis | Idempotency, queues, rate limits, sessions/cache | Durability mode by workload, replication, rebuild/replay policy | Lost idempotency/queue state for financial jobs |
| Connection pool | API/worker database connections | Bounded pool, timeout, circuit breaker, drain on failover | Saturation or stale connection storm |

## 2. PostgreSQL requirements

Production PostgreSQL must use encrypted connections, least-privilege roles, monitored replication/WAL, tested point-in-time recovery, backup verification, connection limits, statement timeout, and maintenance windows. Schema/migration changes require the separate migration approval gate and are not executed by this branch.

Promotion must identify the last durable WAL position, replication lag, active writers, in-flight financial jobs, and audit checkpoint. No dual-primary operation is allowed. After promotion, reconciliation verifies ledger balance, reservations, payout state, audit continuity, and idempotency before financial writes resume.

## 3. Redis requirements

Redis data is classified by rebuildability. Session/cache data may be recreated under policy; financial idempotency keys, reservation queues, and job state require a durable event/replay strategy. A Redis failover must not silently drop a key that could permit duplicate payout or reward allocation.

Queue replay uses stable job IDs and idempotency keys. Operators must distinguish an unprocessed job, in-flight job, completed job, and ambiguous job before retrying. Financial queues remain paused until durable state and database source are reconciled.

## 4. Failure matrix

| Failure | Immediate action | Recovery evidence |
|---|---|---|
| PostgreSQL primary down | Pause financial writes/payout; promote approved standby | WAL position, promotion audit, reconciliation |
| Replication lag | Keep primary; alert; defer release | Lag trend and RPO decision |
| Split brain suspicion | Stop writes and isolate nodes | Owner-approved topology resolution |
| Redis primary down | Pause financial queues; preserve database source | Key/queue recovery and replay evidence |
| Connection pool exhaustion | Shed non-critical traffic; drain/recycle safely | Pool metrics and error rate |
| Planned maintenance | Announce window; drain workers; verify backups | Change ticket and smoke test |

## 5. Acceptance criteria

1. Approved RPO/RTO exists for PostgreSQL, Redis, audit evidence, and financial queue state.
2. Replication/failover topology has a single-writer rule and operator authority.
3. Backup/restore and PITR drills include ledger, reservation, payout, idempotency, and audit checks.
4. Redis replay cannot double-credit or double-reserve due to stable job identity.
5. Connection limits and timeouts prevent cascading failure.
6. Every failover ends with reconciliation and explicit payout resume approval.
