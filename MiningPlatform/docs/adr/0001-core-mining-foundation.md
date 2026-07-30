# ADR-0001: Core Mining Foundation and Delivery Order

Status: Accepted  
Date: 2026-07-30  
Owners: Project Owner and Engineering  
Target release: v0.2.0

## Context

MiningPlatform is a Mining Pool Management Platform. It is not a cloud-mining marketplace and does not sell hashrate contracts. Physical ASIC miners connect to the platform through Stratum, while the platform relays work to an upstream pool during the first production phase.

A valid reward, ledger, wallet, and payout pipeline depends on trusted mining data. Building downstream financial features before share validation would create balances and payment obligations from unverified data.

Monitoring also depends on an end-to-end mining pipeline. A dashboard must display accepted operational data, not synthetic values that appear authoritative.

## Decision

The project will implement the mining pipeline in this dependency order:

```text
Stratum session
    ↓
Share validation
    ↓
Accepted share
    ↓
Difficulty accumulation
    ↓
Monitoring and statistics
    ↓
Reward allocation
    ↓
Double-entry ledger
    ↓
Wallet transaction construction
    ↓
Broadcast and payout settlement
```

The following architectural rules are mandatory.

### 1. Upstream gateway first

The first production model is:

```text
ASIC
  ↓
MiningPlatform Stratum Gateway
  ↓
Upstream Pool
```

Block-template generation, coinbase construction, block propagation, pool luck, and native block accounting are outside v0.2.0.

### 2. Reward waits for validated shares

No reward strategy may consume raw `mining.submit` requests. Reward calculations may only consume locally accepted shares that have a persisted validation result. Upstream-dependent settlement must also wait for upstream reconciliation.

### 3. Ledger controls user balances

Wallet services must never mutate a user balance directly. User balances are derived exclusively from posted double-entry journal lines.

The wallet domain may:

- reserve spendable wallet funds;
- construct transactions;
- request approval;
- sign through an approved signer;
- broadcast transactions;
- monitor confirmation state.

The ledger domain alone records reward liability, payout liability, fees, reversals, and settlement.

### 4. Internal event bus

Mining services communicate through versioned events. Stratum does not call monitoring, reward, statistics, audit, or notification logic directly.

The initial delivery model is at-least-once. Every consumer must therefore be idempotent.

### 5. Explicit idempotency

Idempotency is a shared platform capability with these operations:

```text
acquire(key, owner, ttl)
complete(key, resultReference)
release(key, owner)
expire(key)
```

It applies to share intake, share persistence, aggregation, reward settlement, ledger posting, payout, wallet broadcast, scheduled jobs, and notifications.

### 6. Finite state machines

Entities with a lifecycle use explicit transition rules. Invalid transitions fail before persistence.

This applies to:

- share;
- miner session;
- reward period;
- journal entry;
- payout;
- wallet transaction;
- upstream session.

### 7. Repository and domain separation

Repositories contain persistence operations only. They do not calculate difficulty, hashrate, reward, fees, balance, or state transitions.

Domain services contain business rules and may coordinate repositories inside explicit transactions.

### 8. Time-series retention

High-frequency telemetry and hashrate snapshots must not grow without bounds. The initial database remains PostgreSQL. The schema and migration path must remain compatible with TimescaleDB.

Raw telemetry uses a short retention period. Aggregated snapshots use longer retention periods.

### 9. Central scheduler

All periodic work is registered and dispatched by the scheduler deployment. Application services do not create independent cron schedules.

### 10. v0.2.0 completion boundary

v0.2.0 is complete only when the following pipeline works end to end:

```text
ASIC or Stratum test miner
    ↓
mining.subscribe
    ↓
mining.authorize
    ↓
mining.notify
    ↓
mining.submit
    ↓
local share validation
    ↓
persisted share result
    ↓
Redis realtime aggregation
    ↓
worker hashrate calculation
    ↓
WebSocket event
    ↓
realtime dashboard update
```

Reward settlement, ledger posting, Bitcoin transaction construction, and production payout are explicitly excluded from v0.2.0.

## Consequences

### Positive

- Financial features depend on validated mining data.
- Services can scale independently without direct coupling.
- Retry and duplicate delivery have defined handling.
- Lifecycle corruption is reduced through transition guards.
- Monitoring can be tested with real Stratum activity.
- The system remains adaptable to a native pool later.

### Negative

- The first release exposes fewer financial features.
- Event contracts, idempotency records, and transition tests add implementation work.
- Operational debugging requires correlation IDs and event tracing.
- Time-series retention and scheduled maintenance must be designed early.

## Enforcement

A pull request violates this ADR when it:

- calculates reward from unvalidated shares;
- mutates a user balance outside ledger posting;
- adds a service-to-service dependency where an event is the defined boundary;
- introduces a state change without a transition guard;
- adds an unbounded telemetry table;
- places a cron expression outside the scheduler deployment;
- adds financial processing to the v0.2.0 critical path.

Exceptions require a new ADR that explicitly supersedes the affected rule.
