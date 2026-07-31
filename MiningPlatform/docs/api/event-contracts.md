# Event Contracts

## Standard Envelope

Semua event memakai envelope berikut:

```ts
export interface DomainEvent<TPayload> {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  payload: TPayload;
}
```

## Contract Rules

- Event name uses `<domain>.<aggregate>.<action>.v<version>`.
- Existing event payloads are immutable.
- Breaking changes require a new event version.
- Delivery is at least once.
- Every consumer must be idempotent.
- Financial and mining facts use a transactional outbox.
- Consumers acknowledge messages only after durable processing.
- Sensitive values such as passwords, private keys, raw credentials, and full miner IP addresses are forbidden.

## Alpha Transport Status

`v0.2.0-alpha.5` supports a PostgreSQL transactional outbox, Redis Stream delivery, pending recovery, bounded retry, dead-letter handling, and idempotent projection. Docker-backed PostgreSQL/Redis integration and multi-replica validation remain release blockers.

## Mining Events

| Event | Producer | Description |
|---|---|---|
| `mining.session.connected.v1` | stratum-server | TCP session accepted |
| `mining.session.subscribed.v1` | stratum-server | Stratum subscription completed |
| `mining.session.authorized.v1` | stratum-server | Worker authorization completed |
| `mining.session.disconnected.v1` | stratum-server | Session closed |
| `mining.job.received.v1` | stratum-server | Upstream job received and normalized |
| `mining.share.received.v1` | stratum-server | Submission parsed and assigned an event ID |
| `mining.share.local-accepted.v1` | stratum-server | Submission satisfies local validation |
| `mining.share.local-rejected.v1` | stratum-server | Submission fails local validation |
| `mining.share.upstream-pending.v1` | stratum-server | Valid local share sent upstream |
| `mining.share.upstream-accepted.v1` | stratum-server | Upstream accepted the share |
| `mining.share.upstream-rejected.v1` | stratum-server | Upstream rejected the share |
| `mining.hashrate.updated.v1` | mining-worker | Realtime hashrate window changed |
| `mining.worker.state-changed.v1` | mining-worker | Worker operational state changed |
| `mining.worker.device-detected.v1` | stratum-server/monitoring-agent | Evidence-based hardware profile detected |


## Security and Worker Identity Events

| Event | Producer | Description | Runtime status |
|---|---|---|---|
| `security.worker-authentication.succeeded.v1` | worker identity | Successful worker credential authentication | AuditLog implemented; event transport catalogued |
| `security.worker-authentication.failed.v1` | worker identity | Failed, locked, or rate-limited authentication | AuditLog implemented; event transport catalogued |
| `security.worker-credential.created.v1` | worker management | Worker credential created | CLI audit implemented; event transport catalogued |
| `security.worker-credential.rotated.v1` | worker management | Active credential rotated | CLI audit implemented; event transport catalogued |
| `security.worker-credential.revoked.v1` | worker management | Credential revoked | CLI audit implemented; event transport catalogued |

These events and audit records never contain plaintext worker secrets, account passwords, raw IP addresses, private keys, or TOTP secrets.

## Monitoring Events

| Event | Producer | Description |
|---|---|---|
| `monitoring.telemetry.received.v1` | monitoring-agent | Raw bounded miner telemetry received |
| `monitoring.telemetry.aggregated.v1` | mining-worker | Telemetry window aggregated |
| `monitoring.alert.opened.v1` | monitoring worker | Threshold or health incident opened |
| `monitoring.alert.resolved.v1` | monitoring worker | Existing incident resolved |

## Future Financial Events

These contracts are reserved but are outside the v0.2.0 execution path:

- `reward.period.closed.v1`
- `reward.allocated.v1`
- `ledger.journal.posted.v1`
- `payout.requested.v1`
- `payout.approved.v1`
- `wallet.transaction.broadcast.v1`
- `wallet.transaction.confirmed.v1`

## Share Payload Example

```json
{
  "eventId": "01K1...",
  "eventName": "mining.share.local-accepted.v1",
  "eventVersion": 1,
  "occurredAt": "2026-07-30T09:00:00.000Z",
  "producer": "stratum-server",
  "aggregateType": "share",
  "aggregateId": "share_123",
  "correlationId": "session_123",
  "causationId": "submit_456",
  "idempotencyKey": "share:worker_1:job_9:ex2:ntime:nonce:version",
  "payload": {
    "sessionId": "session_123",
    "workerId": "worker_1",
    "asset": "BTC",
    "algorithm": "SHA256",
    "jobId": "job_9",
    "fingerprint": "6af4...",
    "assignedDifficulty": "4096",
    "achievedDifficulty": "5128.445",
    "headerHash": "000000...",
    "extranonce2": "00000001",
    "networkTime": "68a00000",
    "nonce": "00000042",
    "submittedAt": "2026-07-30T09:00:00.000Z",
    "blockCandidate": false
  }
}
```
