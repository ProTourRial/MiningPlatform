# ADR-0008: Multi-Upstream Resilience

**Status:** Accepted  
**Date:** 2026-07-31  
**Owner:** Abia Nugrahanto

## Context

A single upstream connection creates a single point of failure. Closing every downstream miner when an upstream endpoint becomes unavailable causes unnecessary reconnect storms and loses valid operational context. At the same time, silently moving an old job or share to a different provider is unsafe because extranonce, difficulty, job identifiers, and acceptance policy are provider-scoped.

## Decision

MiningPlatform uses a `PoolAdapter` boundary and a session-scoped `MultiUpstreamPoolManager` with:

- ordered upstream definitions using priority and weight;
- health state, failure threshold, circuit-open timeout, and recovery backoff with jitter;
- provider-scoped job identifiers and a bounded multi-job registry;
- explicit invalidation when `clean_jobs`, provider switch, or session recovery occurs;
- a bounded share queue with concurrency and response timeouts;
- explicit lifecycle events for pool selection, recovery, failover, health, and worker difficulty;
- conservative VarDiff whose minimum is never below the active upstream difficulty.

The current alpha implementation keeps one manager per downstream session. It is a resilience foundation, not yet a shared multiplexing pool architecture.

## Invariants

1. A share is submitted only to the provider that produced its upstream job.
2. A provider switch invalidates all jobs owned by the previous provider.
3. A new extranonce invalidates jobs built with the previous extranonce.
4. Queue backpressure is returned explicitly; shares are never silently dropped.
5. A circuit-open provider cannot be selected until its recovery time is reached.
6. VarDiff cannot issue a downstream target below the upstream target.
7. Credentials, raw passwords, and secrets never appear in domain events or logs.

## Consequences

### Positive

- Downstream sessions can survive a primary upstream outage and receive a new job from a backup.
- Provider-specific behavior is isolated behind adapters.
- Job ownership and stale handling are explicit.
- Queue limits bound memory usage during upstream latency.

### Trade-offs

- Session-scoped upstream connections do not scale to large miner counts.
- Health state is currently process-local and is not coordinated across replicas.
- Provider-specific compatibility fixtures are still required before production use.
- Failover can interrupt active work because jobs cannot be migrated between providers.

## Follow-up

A later ADR must define shared upstream multiplexing, distributed health coordination, provider credential storage in a secret manager, and production failover policy per asset.
