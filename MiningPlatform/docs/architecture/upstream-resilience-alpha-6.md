# Upstream Resilience Architecture — alpha.6

Owner: Abia Nugrahanto  
Status: Development foundation

## Runtime flow

```text
Downstream Miner
    │
    ▼
Stratum Gateway Session
    │
    ├── Worker authentication
    ├── Local job registry
    ├── Local share validation
    └── Bounded share queue
            │
            ▼
Multi-Upstream Pool Manager
    ├── Pool Adapter: primary
    ├── Pool Adapter: backup A
    └── Pool Adapter: backup B
            │
            ▼
Upstream Pool
```

## Pool selection

Definitions are ordered by:

1. enabled state;
2. circuit availability;
3. numeric priority, lower first;
4. weight, higher first;
5. stable pool key.

Health state is one of `UNKNOWN`, `CONNECTING`, `HEALTHY`, `DEGRADED`, `CIRCUIT_OPEN`, or `DISABLED`.

## Recovery and failover

```text
ACTIVE
  │ disconnect / timeout
  ▼
RECOVERING
  ├── retry eligible provider with exponential backoff + jitter
  ├── open circuit after configured failure threshold
  └── select next eligible provider
          │
          ▼
ACTIVE on backup
```

When a replacement provider becomes active, the gateway relays its difficulty, extranonce, and a fresh normalized job. Existing jobs from the prior provider are invalidated.

## Job lifecycle

Gateway job IDs encode provider ownership and a monotonically increasing sequence. The registry stores bounded entries with:

- downstream job ID;
- upstream pool key;
- upstream job ID;
- gateway generation;
- received and expiry time;
- lifecycle status.

Statuses: `ACTIVE`, `SUPERSEDED`, `EXPIRED`, `INVALIDATED`.

## Share queue

The queue is bounded by capacity, concurrency, and response timeout. Queue saturation produces an explicit Stratum error. A queued share carries its provider route, so it cannot be submitted to a different provider after failover.

## VarDiff foundation

VarDiff is disabled by default. When enabled it observes accepted-share intervals, retargets only after the configured interval and minimum sample count, limits each adjustment factor, and enforces the active upstream difficulty as a floor.

## Configuration

`UPSTREAM_DRIVER=multi` reads `UPSTREAM_POOLS_JSON`. Example:

```json
[
  {
    "key": "primary",
    "host": "pool.example.net",
    "port": 3333,
    "tls": false,
    "username": "account.worker",
    "password": "secret-reference",
    "priority": 0,
    "weight": 100,
    "failureThreshold": 3,
    "recoveryTimeoutMs": 30000
  },
  {
    "key": "backup",
    "host": "backup.example.net",
    "port": 3333,
    "tls": true,
    "username": "account.worker",
    "password": "secret-reference",
    "priority": 10,
    "weight": 100
  }
]
```

Production credentials must be injected through a secret manager; plaintext JSON environment configuration is development-only.

## Known limits

- One upstream manager is created per downstream session.
- Circuit state is not shared between gateway replicas.
- No provider-specific captured fixture is bundled yet.
- PostgreSQL and Redis integration, load, soak, and chaos tests remain pending.
- Docker deployment is not part of the alpha.6 validation performed in the release environment.
