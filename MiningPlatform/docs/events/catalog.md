# Domain Event Catalog

Owner: Abia Nugrahanto  
Status: Accepted baseline  
Versioning: event name suffix `.vN`

| Event | Producer | Aggregate | Primary consumers | Status |
|---|---|---|---|---|
| `mining.session.connected.v1` | stratum-server | MinerSession | mining-worker, audit | Implemented |
| `mining.session.subscribed.v1` | stratum-server | MinerSession | mining-worker | Implemented |
| `mining.session.authorized.v1` | stratum-server | MinerSession | mining-worker, monitoring | Implemented |
| `mining.session.disconnected.v1` | stratum-server | MinerSession | mining-worker, monitoring | Implemented |
| `mining.worker.device-detected.v1` | stratum-server/agent | Worker | mining-worker | Implemented and regression-tested in alpha.5 |
| `mining.job.received.v1` | stratum-server | StratumJob | mining-worker | Implemented |
| `mining.share.local-accepted.v1` | stratum-server | Share | mining-worker | Implemented |
| `mining.share.local-rejected.v1` | stratum-server | Share | mining-worker | Implemented |
| `mining.share.upstream-pending.v1` | stratum-server | Share | mining-worker | Implemented |
| `mining.share.upstream-accepted.v1` | stratum-server | Share | mining-worker, future reward | Implemented |
| `mining.share.upstream-rejected.v1` | stratum-server | Share | mining-worker, audit | Implemented |
| `mining.hashrate.updated.v1` | mining-worker | Worker | API/WebSocket, statistics | Implemented |
| `mining.upstream.pool-selected.v1` | stratum-server | MinerSession | mining-worker, monitoring, audit | Implemented in alpha.6 |
| `mining.upstream.failover-started.v1` | stratum-server | MinerSession | mining-worker, monitoring, audit | Implemented in alpha.6 |
| `mining.upstream.failover-completed.v1` | stratum-server | MinerSession | mining-worker, monitoring, audit | Implemented in alpha.6 |
| `mining.upstream.failover-failed.v1` | stratum-server | MinerSession | mining-worker, monitoring, alerting | Implemented in alpha.6 |
| `mining.upstream.health-changed.v1` | stratum-server | UpstreamPool | mining-worker, monitoring | Implemented in alpha.6 |
| `mining.worker.difficulty-changed.v1` | stratum-server | Worker | mining-worker, monitoring | Implemented in alpha.6 |
| `security.worker-authentication.succeeded.v1` | worker identity | Worker | audit, security alerts | Catalogued; AuditLog write implemented |
| `security.worker-authentication.failed.v1` | worker identity | Worker | audit, abuse detection | Catalogued; AuditLog write implemented |
| `security.worker-credential.created.v1` | worker management | Worker | audit, notification | Catalogued; CLI audit implemented |
| `security.worker-credential.rotated.v1` | worker management | Worker | audit, notification | Catalogued; CLI audit implemented |
| `security.worker-credential.revoked.v1` | worker management | Worker | audit, session control | Catalogued; CLI audit implemented |
| `monitoring.telemetry.received.v1` | monitoring-agent | WorkerDevice | monitoring | Contract only |
| `monitoring.telemetry.aggregated.v1` | monitoring | Worker | analytics | Contract only |
| `reward.period.closed.v1` | reward scheduler | RewardPeriod | reward engine | Contract only |
| `reward.allocated.v1` | reward engine | RewardPeriod | ledger | Contract only |
| `ledger.journal.posted.v1` | ledger | JournalEntry | balance projection | Contract only |
| `reconciliation.exception.opened.v1` | Control Plane API | ReconciliationException | audit, operations | Implemented |
| `reconciliation.exception.submitted.v1` | Control Plane API | ReconciliationException | approval queue, audit | Implemented |
| `reconciliation.exception.approved.v1` | Control Plane API | ReconciliationException | resolution queue, audit | Implemented |
| `reconciliation.exception.rejected.v1` | Control Plane API | ReconciliationException | operator queue, audit | Implemented |
| `reconciliation.exception.resolved.v1` | Control Plane API | ReconciliationException | reporting, audit | Implemented |
| `payout.requested.v1` | payout policy | Payout | approval | Contract only |
| `payout.approved.v1` | owner/policy | Payout | wallet worker | Contract only |
| `wallet.transaction.broadcast.v1` | wallet worker | WalletTransaction | confirmations | Contract only |
| `wallet.transaction.confirmed.v1` | blockchain adapter | WalletTransaction | ledger settlement | Contract only |

## Catalog rules

- `Implemented` berarti producer dan consumer utama tersedia.
- `Catalogued` berarti nama dan payload direction telah dikunci, tetapi transport event belum wajib aktif.
- `Contract only` tidak boleh dianggap fitur operasional.
- Event tidak pernah membawa password, credential secret, private key, raw IP, atau TOTP secret.

## Control Plane identity events (v0.3.0-alpha.1)

| Event | Producer | Consumer intent | Sensitive payload rule |
|---|---|---|---|
| `identity.email-verification.requested.v1` | Control Plane API | Email delivery worker sends an activation link | Token is never placed in the event; delivery worker resolves a protected token reference |
| `identity.password-reset.requested.v1` | Control Plane API | Email delivery worker sends a reset link | Token is never logged or placed in analytics |

Account, session, API-key, worker, and administrator mutations also create `AuditLog` records. Provider delivery events will be added when notification workers are implemented.
