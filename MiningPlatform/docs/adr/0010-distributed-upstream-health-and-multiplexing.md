# ADR-0010: Distributed Upstream Health and Safe Multiplexing Boundary

- Owner: Abia Nugrahanto
- Status: Accepted
- Date: 2026-08-15
Decision scope: Mining Plane

## Context

Every Stratum session currently owns its upstream connection manager. A process-local circuit breaker can stop one session from repeatedly dialing an unhealthy provider, but it cannot protect multiple sessions or gateway replicas from a coordinated reconnect storm. Sharing one upstream connection among unrelated miners could reduce provider connection count, but doing so without an explicit extranonce, difficulty, extension, credential, and job-ownership contract risks duplicate work or misrouted shares.

## Decision

### Distributed health

1. Production multi-upstream gateways coordinate provider health through Redis. Development may use the in-memory coordinator.
2. Connection reservation, consecutive-failure increment, circuit opening, and half-open probe leasing are atomic Lua operations.
3. Redis server time is authoritative for circuit and probe leases, so clock skew between gateway replicas cannot open or close a provider circuit incorrectly.
4. At most one replica receives a half-open probe lease for a provider. A successful connection resets the shared failure state; a failed probe reopens the circuit.
5. State keys have bounded TTLs. They contain provider identifiers, counts, timestamps, circuit state, and bounded error text, but never endpoints with embedded credentials, usernames, or passwords.
6. Coordinator failure is fail-open for the Mining Plane: a session falls back to its local circuit breaker so Redis does not become a mining single point of failure. Every coordinator error must be logged and surfaced through operational alerts.
7. Production startup rejects non-development upstream operation unless the Redis coordinator is selected and reachable. Partially opened startup resources are closed in reverse order on failure.

### Upstream multiplexing

1. The accepted current architecture remains one upstream manager per downstream session. Connections must not be shared merely to reduce socket count.
2. Shared multiplexing is deferred until a dedicated gateway-shard implementation proves all of these invariants:
   - a connection group has one provider, asset, algorithm, region, credential scope, compatible extension set, and compatible difficulty policy;
   - every downstream session receives a provider-supported, non-overlapping extranonce partition;
   - jobs and submitted shares retain immutable connection-group and downstream-session ownership;
   - backpressure is bounded per group and per session, so one miner cannot starve the group;
   - group failure, draining, credential rotation, and reconnection cannot route work to another provider or credential scope;
   - provider terms and controlled integration tests explicitly permit the multiplexing mode.
3. If any invariant cannot be proven for a provider, that provider remains session-scoped even when another provider supports shared groups.

## Consequences

- Multiple gateway replicas make one coordinated provider-health decision and avoid independent retry storms.
- Redis loss degrades coordination but does not intentionally stop mining; local safeguards continue while operators receive a visible fault.
- Session-scoped upstream sockets remain a capacity constraint until provider-specific multiplexing is implemented and validated.
- Provider fixtures, controlled failover, regional routing, VarDiff validation, load, soak, and chaos evidence remain required before P0.2 can be marked complete.

## Verification

- Unit tests prove shared circuit state, fail-open coordinator behavior, redacted snapshots, and single half-open probes.
- Redis integration tests use separate clients to prove cross-instance atomicity and recovery.
- Production configuration tests reject memory-only health coordination.
- The operational runbook defines metrics, alerts, safe recovery, and rollback.
