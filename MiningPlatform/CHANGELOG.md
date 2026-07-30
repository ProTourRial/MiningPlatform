# Changelog

## [0.2.0-alpha.4] - 2026-07-31

- Added universal CPU, GPU, FPGA, ASIC, and hybrid worker profiles.
- Added evidence-based miner detection and persistence.
- Added universal hardware website review surfaces.
- Added Abia Nugrahanto author attribution headers across code files.
- Removed packaged build and dependency artifacts from the release archive.
- Included and synchronized `pnpm-lock.yaml` for reproducible workspace installation.
- Fixed legacy ESM logger import and frontend type errors found during universal-hardware validation.

## 0.2.0-alpha.3 - 2026-07-31

### Added

- Upstream Stratum V1 TCP/TLS client with request-response correlation.
- Parsers for upstream subscribe results, difficulty, extranonce, and notify messages.
- Upstream session finite state machine and exponential initial reconnect backoff.
- Multi-job registry with active, superseded, expired, and invalidated states.
- `clean_jobs` generation invalidation.
- Job normalization into Bitcoin header byte order.
- Local upstream Stratum simulator application.
- Downstream gateway integration that waits for upstream acceptance before replying `true`.
- Separate `UPSTREAM_PENDING`, `UPSTREAM_ACCEPTED`, and `UPSTREAM_REJECTED` events.
- Mining projection handlers for the upstream share lifecycle.
- Reference Stratum V1 fixture with byte-for-byte header and hash expectations.
- End-to-end TCP gateway test from downstream miner through upstream simulator.

### Changed

- Corrected Bitcoin job representation so normalized prevhash and Merkle branches are not reversed twice.
- Hashrate contribution is recorded after upstream acceptance when upstream is required.
- Zero-valued aggregate difficulty buckets are now valid inputs to decimal summation.
- Redis event transport and PostgreSQL adapters are loaded lazily by the Stratum server, improving local test isolation.
- Development and upstream TCP modes are selected explicitly through `UPSTREAM_DRIVER`.

### Known gaps

- The compatibility fixture is a public Stratum V1 reference example, not yet a captured fixture from the selected production pool.
- A live upstream disconnect currently closes the downstream miner session; transparent session recovery is not complete.
- Production worker authentication is not implemented.
- PostgreSQL, Redis, Docker, load, and soak integration tests remain pending.
- A registry-generated `pnpm-lock.yaml` still requires the first networked installation.

## 0.2.0-alpha.2 - 2026-07-30

### Added

- PostgreSQL durable outbox event store and dedicated outbox dispatcher.
- Redis duplicate-share reservation with expiry and release on durability failure.
- Redis Stream pending recovery, retry tracking, malformed-event isolation, and dead-letter stream.
- One-minute hashrate buckets and rolling 1m, 5m, 15m, 1h, and 24h snapshots.
- Centralized retention scheduler protected by a PostgreSQL advisory transaction lock.
- API liveness, readiness, and Prometheus metrics endpoints.
- Development WebSocket authentication and per-worker rooms.
- Database constraints for non-negative, one-sided, asset-consistent, and balanced journal entries.
- Soft-delete fields and restrictive historical mining relations.
- Non-root multi-stage Docker images and isolated service environment variables.
- Development Docker override with localhost-only infrastructure ports.

### Changed

- Corrected Next.js typed route configuration and same-origin API/WebSocket routing.
- Added Nginx Socket.IO proxy support.
- Replaced per-share five-minute database rescans with time buckets.
- Applied share state transitions through the domain state machine.
- Routed mining projection through the shared idempotency contract.
- Prevented duplicate projection delivery from emitting duplicate realtime hashrate events.
- Replaced raw IP hashing with keyed HMAC over normalized IP addresses.
- Replaced unbounded session share retention with fixed-duration difficulty buckets.
- Pinned direct dependency versions exactly.
- Disabled fake login, registration, and production dashboard actions until authentication is implemented.

### Security

- Production dashboard and development monitoring endpoints are forcibly disabled.
- PostgreSQL, Redis, MinIO, Prometheus, and Grafana are private in the base compose file.
- Wallet service remains behind an explicit profile with payouts disabled.

### Known gaps

- Upstream Stratum connection, job normalization, and upstream response lifecycle are not implemented.
- A registry-generated `pnpm-lock.yaml` must be created and committed on the first networked installation.
- Full dependency-aware build, Docker integration, PostgreSQL integration, and Redis integration tests require a networked development environment.

## 0.2.0-alpha.1 - 2026-07-30

### Added

- Bitcoin mining core package for coinbase, merkle root, 80-byte header, double SHA-256, compact target, share target, and achieved difficulty.
- Share validation for unauthorized, unknown job, stale, duplicate, malformed, invalid time, invalid version, and low difficulty submissions.
- Stratum request parsing for configure, subscribe, authorize, and submit.
- Development Stratum session, worker authentication, job notification, submission rate limit, and JSONL event trace.
- Redis Stream event publisher and consumer group transport.
- Prisma mining models for miner sessions, difficulty assignments, upstream sessions, Stratum jobs, share fingerprints, detailed share states, outbox events, and idempotency records.
- Baseline PostgreSQL migration and optional development miner seed.
- Mining worker projection for session, job, accepted share, rejected share, fingerprint, worker state, and five-minute hashrate snapshot.
- NestJS WebSocket gateway for worker, share, and hashrate events.
- Next.js realtime development panel.
- End-to-end Stratum smoke client.
- Predicate-based Stratum smoke client inbox that safely handles interleaved responses and notifications.

### Security

- Development Stratum mode is rejected under production runtime.
- Development monitoring snapshot endpoint is hidden under production runtime.
- Payout and wallet functions remain disabled.

### Known gaps

- Upstream Stratum relay and submission results are not implemented.
- Transactional outbox, pending message recovery, and dead-letter handling are not implemented.
- Full integration, container, load, and production security tests are not complete.

## 0.1.1 - 2026-07-30

### Added

- ADR-0001 as the official core mining architecture baseline.
- v0.2.0 Definition of Done for the end-to-end Stratum and monitoring pipeline.
- Internal event bus contract with at-least-once delivery rules.
- Transactional outbox requirement for durable event publication.
- Shared idempotency contract and in-memory test implementation.
- Generic finite state machine transition guard.
- Repository and domain service separation rules.
- PostgreSQL and TimescaleDB-compatible time-series retention strategy.
- Central scheduler responsibility document.
- Expanded mining and monitoring event catalog.

### Changed

- Renumbered the existing ADR documents after inserting the architecture baseline.
- Revised the roadmap into v0.2.0 through v1.0.0 release stages.
- Clarified that reward, ledger settlement, wallet RPC, and real payout are outside v0.2.0.
- Clarified that wallet services never mutate user balances directly.
