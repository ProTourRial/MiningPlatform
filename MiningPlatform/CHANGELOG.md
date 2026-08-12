# Changelog

## [Unreleased] - 2026-08-13

### Added

- Professional Control Plane frontend with responsive navigation, authenticated operational dashboards, worker management, hashrate insights, and gated financial surfaces.
- Lightweight Bitcoin reward feed backed by cached public block data for current subsidy and fee context.
- A production-accessible `/control-plane-preview` route with representative data for Vercel review.

### Changed

- Production web requests now default to the same-origin `/api/v1` endpoint, while development keeps its explicit local API fallback.
- Release, migration, Prisma generation, and Docker E2E workflows now use isolated CI configuration and deterministic dependency startup.

### Fixed

- Initial dashboard data loading is deferred to effect callbacks, satisfying React's `set-state-in-effect` rule without disabling lint safeguards.
- Docker images include the Prisma author-header generator required by `db:generate`.
- Fresh and upgrade migration checks sanitize Prisma-only URL parameters before invoking `psql`.
- Release-manifest checks use the same payload boundary as manifest generation.

### Removed

- Superseded generic v0.3.0 release and migration verification scripts; the versioned alpha verification paths remain authoritative.

## [0.3.0-alpha.2] - 2026-08-03

### Added

- Root GitHub Actions workflows with PostgreSQL, Redis, frozen lockfile installation, fresh migration, upgrade migration, and Docker E2E jobs.
- Persistent refresh-token family history, replay detection, family-wide revocation, and PostgreSQL integration coverage for parallel refresh requests.
- Resend-backed verification and password-reset delivery through the transactional outbox.
- Disabled-by-default maintenance donation and future site-payment receiving-address registry.
- Database snapshot/restore tooling, rollback procedure, refresh-token replay metric, and alert rule.

### Fixed

- Worker rename now returns a conflict for duplicate names and handles concurrent unique-constraint races.
- Worker deletion, credential revocation, logout, and password-reset session revocation are transactional.
- Authentication TTL values reject invalid, zero, negative, or excessive values.
- Dockerfiles use `pnpm install --frozen-lockfile` and copy `pnpm-lock.yaml`.

### Security

- A replayed or concurrently reused refresh token revokes its entire token family.
- Public payment addresses remain disabled by default and cannot credit user balances.
- Identity email delivery requires HTTPS application URLs in production and uses provider idempotency keys.

### Validation boundary

- Static checks and release-manifest verification completed in the packaging environment.
- pnpm/Prisma/PostgreSQL/Redis/Docker execution must complete successfully in GitHub Actions before the build is described as validated.

## [0.3.0-alpha.1] - 2026-08-03

### Added

- Control Plane registration, email verification, password login, rotating refresh sessions, logout, password reset, and TOTP 2FA.
- RBAC for USER, ADMIN, and OWNER with mandatory TOTP for administrator endpoints.
- User profile, active-session, scoped API-key, Worker CRUD, and worker credential management APIs.
- Production dashboard snapshot and authenticated WebSocket worker rooms.
- Encrypted notification-channel registry and notification inbox endpoints.
- Schema version 7 and control-plane migration.
- ADR-0009, Control Plane architecture, upgrade guide, and release validation scripts.

### Fixed

- Website worker creation now produces credentials accepted by the production Stratum authenticator.
- Production realtime monitoring no longer depends on the development dashboard flag.
- Docker Compose passes multi-upstream, reconnect, share-queue, job-cache, and VarDiff settings.
- Full-release packaging excludes Git metadata and uses a regenerated payload manifest.

### Security

- Passwords and worker secrets use versioned scrypt hashes.
- Refresh tokens and API keys are persisted only as hashes.
- Browser tokens use HttpOnly SameSite=Strict cookies and server-side session revocation.
- TOTP secrets use AES-256-GCM with a deployment-provided key.
- Authentication, worker, API-key, profile, and administrator mutations are audited.

### Known gaps

- Provider-specific notification delivery, distributed API rate limiting, public TLS automation, DDoS service, and IP reputation remain pending.
- Reward settlement, ledger posting, wallet orchestration, and payouts remain disabled.
- Full pnpm/Prisma/Docker build and integration validation must run in the target environment.

## [0.2.0-alpha.6] - 2026-07-31

### Added

- Pool adapter abstraction and multi-upstream registry.
- Priority/weight selection, circuit breaker, automatic recovery, exponential backoff, and jitter.
- Provider-scoped multi-job router with clean invalidation and bounded cache.
- Bounded share queue with concurrency, timeout, and explicit backpressure.
- Upstream selection, failover, health, and worker difficulty domain events.
- Conservative VarDiff foundation with upstream difficulty floor.
- Database schema version 6 and upstream resilience migration.
- Primary-to-backup TCP failover regression test.

### Changed

- Downstream sessions remain connected during recoverable upstream failures.
- Share submission is routed only to the provider that owns the job.
- Release metadata and binary/API version output now report schema version 6.

### Known gaps

- Provider-specific captured fixtures, shared multiplexing, and distributed circuit state are pending.
- Prisma generation, PostgreSQL/Redis integration, Docker, load, soak, and chaos verification require the target environment.

## [0.2.0-alpha.5] - 2026-07-31

### Added

- Official domain architecture for Control, Mining, Accounting, Event, Monitoring, and Operations planes.
- Bounded-context catalog, context map, data flow, event flow, and domain event catalog.
- Canonical ADR index and decisions for universal hardware, event delivery, and production miner identity.
- `WorkerCredential` schema and migration with lifecycle, lock, expiry, rotation, and revocation fields.
- Versioned scrypt worker-secret hashing and verification.
- PostgreSQL-backed production worker authenticator with Redis rate limiting and audit logging.
- Worker credential create, rotate, and revoke CLI.
- Authentication regression tests and event-gate regression tests.
- Incremental patch deletion manifest and cross-platform patch cleanup scripts.
- Release, generated-client, and fresh/upgrade migration verification commands.

### Fixed

- Registered `mining.worker.device-detected.v1` in the mining projection supported-event gate.
- Removed duplicate ADR numbering and consolidated canonical architecture decisions.
- Prevented development worker authentication from being selected outside development mode.

### Security

- Worker plaintext secrets are displayed once and never persisted.
- Production authentication validates user, mining account, worker, credential status, expiry, and lock state.
- Authentication logs use HMAC-derived IP and user-agent identifiers and do not log passwords.
- Repeated authentication failures are rate-limited through Redis and persisted credential lock state.

### Known gaps

- PostgreSQL and Redis integration tests for production authentication still require the local Docker environment.
- Worker credential management is CLI-based until the Control Plane API is implemented.
- Multi-upstream failover, transparent session recovery, and production VarDiff remain alpha.6 work.
- Prisma Client generation and fresh/upgrade database migration verification must be completed on a platform with the correct Prisma engine.

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
