# Roadmap

## Release Sequence

```text
v0.2.0  Core Mining Foundation
    ↓
v0.3.0  Monitoring and Reward Foundation
    ↓
v0.4.0  Ledger and Settlement
    ↓
v0.5.0  Wallet and Secure Payout
    ↓
v0.6.0  Transparency and Owner Operations
    ↓
v1.0.0  Production-Ready Upstream Gateway
```

## Current Checkpoint: v0.2.0-alpha.4

Implemented:

- Downstream Stratum handshake, authorization, notification, and submission flow.
- Upstream Stratum TCP/TLS client and local simulator.
- Reference fixture header reconstruction and byte-order test.
- Upstream session state machine and initial reconnect backoff.
- Job normalization, multi-job registry, and `clean_jobs` invalidation.
- Local validation followed by upstream submit and response correlation.
- Separate local and upstream share lifecycle events.
- Redis duplicate reservation and PostgreSQL durable outbox foundation.
- Rolling 1m, 5m, 15m, 1h, and 24h hashrate snapshots.
- Development-only authorized WebSocket room and dashboard panel.
- Universal CPU, GPU, FPGA, ASIC, hybrid, other, and unknown worker profiles.
- Evidence-based Stratum, user, agent, and miner API detection.
- Per-device telemetry model and universal worker review interface.

Release blockers:

- Captured compatibility fixture from the selected production upstream pool.
- Transparent active-session reconnect or explicit failover policy.
- Production worker authentication and tenant authorization.
- Full PostgreSQL and Redis integration tests.
- Load and soak tests.

## v0.2.0: Core Mining Foundation

- Expanded mining schema and migrations.
- Miner session and Stratum job persistence.
- Stratum V1 subscribe, authorize, notify, and submit flow.
- Upstream connection and relay.
- Local SHA-256 share validation.
- Difficulty target calculation.
- Duplicate, stale, malformed, unauthorized, and low-difficulty detection.
- Share state machine.
- Event bus and transactional outbox.
- Shared idempotency capability.
- Share persistence and upstream result tracking.
- Realtime Redis aggregation.
- Worker state and hashrate windows.
- WebSocket dashboard updates.
- Time-series retention jobs.
- End-to-end Stratum test miner.

Release gate: `docs/releases/v0.2.0-definition-of-done.md`.

## v0.3.0: Monitoring and Reward Foundation

- Miner API and optional monitoring agent.
- Temperature, fan, power, hardware error, and efficiency metrics.
- Monitoring alerts and incident lifecycle.
- Upstream reconciliation.
- `FOLLOW_UPSTREAM` reward strategy.
- Reward period state machine.
- Reward previews without spendable balances.

## v0.4.0: Ledger and Settlement

- Production double-entry journal posting.
- Reward liability accounts.
- Platform fee and upstream fee accounting.
- Immutable journal references and reversals.
- Balance projections.
- Reconciliation reports.

## v0.5.0: Wallet and Secure Payout

- Bitcoin node and wallet adapter.
- UTXO inventory and locking.
- Coin selection and fee estimation.
- Payout batches.
- PSBT and approval flow.
- Hot and cold wallet policy.
- Broadcast, RBF, confirmation, and settlement.
- Emergency wallet controls.

## v0.6.0: Transparency and Owner Operations

- Public pool and network metrics.
- Aggregated earnings and payout statistics.
- Owner user and worker management.
- Pool configuration.
- Reward operations.
- Wallet approval.
- Maintenance and emergency controls.
- Audit logs, security events, and system health.

## v1.0.0: Production-Ready Upstream Gateway

- Security assessment and remediation.
- Capacity and failure testing.
- Disaster recovery exercises.
- Production observability and on-call runbooks.
- Reconciliation acceptance criteria.
- Operational approval for real funds.
