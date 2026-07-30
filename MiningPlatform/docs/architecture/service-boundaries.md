# Service Boundaries

Domain dipisahkan secara logis sejak awal. Deployment fisik tetap terbatas agar kompleksitas MVP terkendali.

| Deployment | Tanggung jawab |
|---|---|
| web | Landing, dashboard, transparency, owner UI privat |
| api | Auth, users, workers, read models, configuration, WebSocket gateway |
| stratum-server | Miner TCP sessions, protocol, auth, upstream relay, job state, local validation |
| mining-worker | Share projection, hashrate aggregation, worker state, statistics |
| wallet-worker | Future payout preparation, signing integration, broadcast, confirmation |
| scheduler | Registrasi dan dispatch seluruh pekerjaan periodik |
| monitoring-agent | Telemetri perangkat melalui koneksi keluar |

## Communication

- Synchronous calls are limited to request-response operations that require an immediate result.
- Mining facts and cross-domain updates use the internal event bus.
- Database facts and emitted events use a transactional outbox where atomicity is required.
- Event delivery is at least once. Consumers are idempotent.

## Repository Boundary

Repositories perform persistence only:

```text
find
insert
update with expected version
list
lock
transaction
```

Repositories must not:

- calculate difficulty;
- validate a share;
- calculate hashrate;
- allocate reward;
- derive a user balance;
- select a state transition;
- construct a wallet transaction.

## Domain Service Boundary

Domain services contain business rules and coordinate repositories.

Examples:

```text
ShareValidationService
ShareStateMachine
UpstreamSubmissionService
HashrateAggregationService
WorkerStateService
RewardSettlementService
LedgerPostingService
PayoutPolicyService
```

A domain service may publish events through an outbox in the same transaction as its state change.

## Scaling Rule

Microservice tambahan dibuat only after measured needs for throughput, fault isolation, security isolation, or ownership. Logical domain separation does not require one deployment per module.
