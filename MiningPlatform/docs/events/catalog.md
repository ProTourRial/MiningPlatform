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
| `identity.account.registered.v1` | auth API | User | audit, notification | Contract catalogued in v0.3.0 |
| `identity.email.verified.v1` | auth API | User | audit, notification | Contract catalogued in v0.3.0 |
| `identity.login.succeeded.v1` | auth API | UserSession | audit, security | Contract catalogued in v0.3.0 |
| `identity.login.failed.v1` | auth API | User | audit, security | Contract catalogued in v0.3.0 |
| `identity.session.created.v1` | auth API | UserSession | audit, notification | Contract catalogued in v0.3.0 |
| `identity.session.revoked.v1` | auth API | UserSession | audit, security | Contract catalogued in v0.3.0 |
| `identity.password.changed.v1` | auth API | UserSecurity | audit, notification | Contract catalogued in v0.3.0 |
| `identity.two-factor.enabled.v1` | auth API | UserSecurity | audit, notification | Contract catalogued in v0.3.0 |
| `identity.two-factor.disabled.v1` | auth API | UserSecurity | audit, notification | Contract catalogued in v0.3.0 |
| `identity.profile.updated.v1` | users API | User | audit | Contract catalogued in v0.3.0 |
| `identity.api-key.created.v1` | API key service | ApiKey | audit | Contract catalogued in v0.3.0 |
| `identity.api-key.revoked.v1` | API key service | ApiKey | audit | Contract catalogued in v0.3.0 |
| `control.worker.created.v1` | worker API | Worker | audit, monitoring | Contract catalogued in v0.3.0 |
| `control.worker.updated.v1` | worker API | Worker | audit, monitoring | Contract catalogued in v0.3.0 |
| `control.worker.deleted.v1` | worker API | Worker | audit, mining session control | Contract catalogued in v0.3.0 |
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
| `payout.requested.v1` | payout policy | Payout | approval | Contract only |
| `payout.approved.v1` | owner/policy | Payout | wallet worker | Contract only |
| `wallet.transaction.broadcast.v1` | wallet worker | WalletTransaction | confirmations | Contract only |
| `wallet.transaction.confirmed.v1` | blockchain adapter | WalletTransaction | ledger settlement | Contract only |

## Catalog rules

- `Implemented` berarti producer dan consumer utama tersedia.
- `Catalogued` berarti nama dan payload direction telah dikunci, tetapi transport event belum wajib aktif.
- `Contract only` tidak boleh dianggap fitur operasional.
- Event tidak pernah membawa password, credential secret, private key, raw IP, atau TOTP secret.
