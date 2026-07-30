# Event-Driven Mining Core

## Purpose

The internal event bus separates Stratum intake from monitoring, statistics, reward, audit, and notification processing.

The first implementation may use Redis Streams. The contracts must remain transport-neutral so the platform can move to NATS JetStream, Kafka, or another durable broker without changing domain payloads.

## Delivery Semantics

- Delivery guarantee: at least once.
- Ordering guarantee: per aggregate key where supported.
- Consumers: idempotent.
- Event schema: versioned and immutable.
- Failed delivery: retried with bounded backoff, then moved to a dead-letter stream.
- Correlation: every event carries `correlationId` and `causationId`.

## Event Envelope

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

## Initial Streams

| Stream | Producer | Primary consumers |
|---|---|---|
| `mining.sessions` | stratum-server | monitoring, audit |
| `mining.shares` | stratum-server | mining-worker, monitoring, statistics, audit |
| `mining.hashrate` | mining-worker | websocket gateway, statistics |
| `monitoring.telemetry` | monitoring-agent | monitoring, alerts, statistics |
| `operations.scheduler` | scheduler | domain workers |
| `system.audit` | all services | audit persistence |

## Share Event Flow

```text
mining.share.received.v1
    ↓
ShareValidationService
    ├── mining.share.local-accepted.v1
    └── mining.share.local-rejected.v1

mining.share.local-accepted.v1
    ↓
UpstreamSubmissionService
    ├── mining.share.upstream-accepted.v1
    └── mining.share.upstream-rejected.v1

mining.share.local-accepted.v1
    ├── HashrateAggregator
    ├── RealtimeWorkerState
    ├── StatisticsProjector
    └── AuditProjector
```

## Consumer Rules

A consumer must:

1. acquire the event idempotency key;
2. validate the event version and payload;
3. execute domain logic inside a database transaction where required;
4. persist the consumer checkpoint or outbox result;
5. mark the idempotency record complete;
6. acknowledge the broker message.

A consumer must not acknowledge a message before durable state is committed.

## Transactional Outbox

Database writes that publish domain events use a transactional outbox. The domain record and outbox record are committed in one PostgreSQL transaction. A dispatcher publishes pending records and marks them delivered.

This prevents a committed database change from losing its corresponding event.
