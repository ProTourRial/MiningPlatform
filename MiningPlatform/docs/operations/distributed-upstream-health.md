# Distributed Upstream Health Runbook

- Owner: Mining Platform Operations
- Decision: [ADR-0010](../adr/0010-distributed-upstream-health-and-multiplexing.md)
Production boundary: required when `UPSTREAM_DRIVER` is not `development`

## Required configuration

```dotenv
UPSTREAM_HEALTH_DRIVER=redis
UPSTREAM_HEALTH_KEY_PREFIX=mining:upstream-health:v1:
UPSTREAM_HEALTH_TTL_MS=86400000
UPSTREAM_HEALTH_PROBE_LEASE_MS=5000
```

The configured Redis URL is reused as the connection target, but the coordinator owns a separate client lifecycle. `UPSTREAM_HEALTH_TTL_MS` must exceed the probe lease. Redis server time, not the gateway host clock, controls circuit and probe expiry.

## Stored state and privacy

One hash is stored per encoded provider key. It may contain connection success/failure counts, last success/failure time, circuit expiry, a short probe token, probe expiry, and an error message truncated to 1,024 characters. It must not contain provider credentials or credential-bearing URLs.

## Normal behavior

1. A gateway atomically reserves a provider connection attempt.
2. An open circuit denies the attempt and allows the manager to try the next eligible provider.
3. After recovery timeout, one replica obtains a bounded half-open probe lease.
4. Success resets consecutive failures and clears the circuit. Failure reopens it.

## Degraded behavior

If Redis coordination fails after startup, connection selection fails open to the manager's local circuit breaker. This prevents Redis from becoming a Mining Plane single point of failure, but all replicas can retry independently. Treat repeated coordinator errors as degraded service and investigate Redis availability, latency, authentication, TLS, and capacity immediately.

Production startup fails closed if the Redis coordinator cannot connect. Startup cleanup must close every dependency already opened before returning the error.

## Alerts and operator checks

Alert on:

- any sustained upstream-health coordinator error;
- repeated shared circuit openings for a provider;
- Redis latency or availability outside the deployment SLO;
- excessive fail-open fallback or reconnect activity;
- no successful upstream connection while miners remain connected.

Confirm the following before clearing an incident:

1. Redis is reachable from every gateway replica.
2. Redis clocks and host clocks are monitored even though leases use Redis time.
3. The selected provider accepts controlled probes and normal connections.
4. A backup provider remains eligible and share/job ownership is unchanged.
5. Separate Redis clients observe the same circuit and only one half-open probe.

## Recovery and rollback

- Prefer restoring Redis or routing gateways to the documented Redis failover endpoint.
- Do not run `FLUSHDB`, `FLUSHALL`, or a wildcard key deletion. Those commands can destroy unrelated idempotency, rate-limit, event, or duplicate-share state.
- If a single provider state is demonstrably stale, resolve its exact encoded key and capture incident evidence before deleting only that key under an approved change.
- Roll back the application to the last verified release if the coordinator causes invalid selection behavior. Do not switch a production multi-upstream deployment to the memory driver.
- After rollback or Redis recovery, run the cross-client integration test and a controlled no-funds Stratum smoke test before restoring traffic.

## Verification command

With a disposable Redis instance only:

```powershell
$env:REDIS_INTEGRATION_URL='redis://127.0.0.1:56379'
pnpm --filter @mining/stratum-server test
```
