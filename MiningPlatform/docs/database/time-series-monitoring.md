# Time-Series Monitoring Strategy

## Decision

PostgreSQL remains the primary database for v0.2.0. Monitoring tables use time-based partitioning and retention rules. The design remains compatible with TimescaleDB.

## Data Classes

| Data | Resolution | Initial retention |
|---|---:|---:|
| Raw Stratum share events | per share | 30 days online, then archive |
| Raw device telemetry | 10 to 30 seconds | 7 days |
| Worker metrics | 1 minute | 30 days |
| Worker metrics | 5 minutes | 180 days |
| Worker metrics | 1 hour | 2 years |
| Pool aggregate metrics | 1 minute | 180 days |
| Audit and financial records | event based | no automatic deletion |

Retention values are configuration defaults, not legal retention policy.

## Tables

High-frequency tables include:

- `worker_telemetry`;
- `hashrate_snapshots`;
- `pool_metric_snapshots`;
- `upstream_metric_snapshots`.

Each table requires:

- `recorded_at` as the partitioning time column;
- an index beginning with the aggregate identifier and time;
- bounded JSON payloads;
- no private keys, passwords, or raw credentials;
- scheduled retention and aggregation jobs.

## Aggregation

Raw accepted share difficulty is aggregated into fixed windows:

```text
1 minute
5 minutes
15 minutes
1 hour
24 hours
```

Estimated hashrate:

```text
sum(accepted difficulty) × 2^32 / window seconds
```

Rejected and stale shares remain separate counters. They are not included in accepted hashrate.

## Scale Path

1. PostgreSQL native partitioning.
2. TimescaleDB hypertables and continuous aggregates.
3. Separate analytical store only after measured need.

The application reads metrics through repository interfaces so storage changes do not affect domain services or API contracts.
