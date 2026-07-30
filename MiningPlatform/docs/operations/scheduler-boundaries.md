# Scheduler Boundaries

## Rule

The scheduler deployment owns cron registration. Domain services expose idempotent job handlers but do not register independent cron expressions.

## Scheduled Jobs

| Job | Owner handler | Initial cadence |
|---|---|---|
| Hashrate snapshot | mining-worker | every minute |
| Worker offline evaluation | mining-worker | every minute |
| Upstream health check | stratum-server handler | every minute |
| Telemetry aggregation | monitoring handler | every minute |
| Redis cleanup | operations handler | every hour |
| Audit archive | audit handler | daily |
| Notification retry | notification handler | every minute |
| Reward period close | reward handler | disabled in v0.2.0 |
| Wallet reconciliation | wallet handler | disabled in v0.2.0 |
| Payout batch creation | payout handler | disabled in v0.2.0 |

## Dispatch Contract

Every scheduled invocation includes:

```text
jobId
jobName
scheduledAt
attempt
correlationId
idempotencyKey
payload
```

The scheduler dispatches work through the event bus. It does not execute domain calculations itself.

## Failure Handling

- Retry with bounded exponential backoff.
- Use a durable idempotency key based on `jobName` and `scheduledAt`.
- Record start, completion, failure, duration, and retry count.
- Move exhausted jobs to a dead-letter queue.
- Alert only after the configured retry policy is exhausted.
