# Event Contracts

Semua event memiliki `eventId`, `occurredAt`, `eventName`, `version`, dan payload tervalidasi.

Event awal:

- `mining.share.received.v1`
- `mining.share.validated.v1`
- `mining.share.aggregated.v1`
- `reward.period.closed.v1`
- `reward.allocated.v1`
- `payout.requested.v1`
- `payout.broadcast.v1`
- `monitoring.telemetry.received.v1`

Consumer wajib idempotent. Event schema tidak diubah secara breaking. Breaking change memakai versi baru.
