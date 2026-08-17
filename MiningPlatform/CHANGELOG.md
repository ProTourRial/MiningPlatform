# Changelog

## [0.3.0-alpha.5] - 2026-08-16

### Added

- Schema v10 financial-truth foundation with immutable accepted-share contribution facts, reward-period contribution snapshots, exact atomic-unit settlement fields, and atomic journal lines.
- `accounting-worker` for idempotent contribution ingestion, deterministic `FOLLOW_UPSTREAM` allocation, versioned fee-policy snapshots, balanced posting, reconciliation closure, audit records, and transactional outbox events.
- OWNER+TOTP settlement import CLI with explicit confirmation, immutable source reference, SHA-256 checksum, zero-tolerance reconciliation, and duplicate/conflict detection.
- Equal-and-opposite journal reversal CLI; posted journal entries, lines, allocations, and contribution snapshots are protected by database immutability triggers.
- Authenticated reward, reward-period audit trace, ledger-entry, and balance endpoints with user isolation and `rewards:read`/`ledger:read` API-key scopes.
- ADR-0011, financial-truth operations runbook, fresh/upgrade v10 migration verifier, and end-to-end accounting integration test.

### Changed

- Initial platform fee remains **0.5% (50 basis points)** and now becomes an immutable policy snapshot on every persisted allocation.
- Gross reward and provider costs use deterministic largest-remainder allocation; per-account platform fees round down at the atomic boundary in the user's favour.
- User balances are calculated exclusively from user-liability lines in posted/reversed journals; no mutable balance field is authoritative.
- Mining projection writes a durable contribution event only after upstream acceptance and now acknowledges unrelated domain events without incorrectly dead-lettering them.
- Release metadata advances to `0.3.0-alpha.5`, schema version 10, and migration `20260816020000_financial_truth_foundation`.

### Fixed

- Journal-line database validation now requires decimal and atomic amounts to represent the exact same asset value, in addition to balancing both representations.
- The v9-to-v10 verifier now creates its own deterministic legacy fixture instead of depending on optional development seed data, and invokes pnpm without the deprecated shell path.
- The end-to-end accounting harness now uses per-run fixture identities, so the same disposable database can be validated repeatedly without uniqueness collisions.
- The accounting harness now provisions its own user, mining account, and worker, removing its dependency on optional development seed records during upgrade rehearsals.
- The PostgreSQL authentication integration test now provisions isolated test-only cryptographic configuration instead of depending on ambient machine secrets.
- Managed-source checksums now canonicalize CRLF to LF, keeping verification stable across Windows and Linux checkouts.
- Script typechecking now resolves accounting dependencies directly from workspace source, so clean GitHub runners do not depend on pre-existing package build artifacts.
- The alpha.5 migration now explicitly reinstalls deferred journal-balance constraints, and its fresh/upgrade verifier proves those database triggers are present.

### Safety boundary

- Settlement variance is fail-closed: alpha.5 requires zero atomic tolerance and creates no allocation or journal for an exception.
- Payouts, wallet signing, transaction broadcast, conversion, and real funds remain disabled.
- Exception approval/resolution, selected-provider evidence, multi-replica event recovery, load/soak evidence, and controlled-funds gates remain pending.

### Validation evidence

- Reward-engine tests pass 11/11, including exact remainders, user-favouring 50 bps rounding, and per-account cost-cap edge cases.
- Accounting unit tests pass 2/2; mining-worker, accounting-worker, API, and operator scripts pass targeted typechecks.
- PostgreSQL disposable validation passes all 10 migrations from empty, formal v9-to-v10 upgrade/backfill over representative prior-schema rows, and repeatable financial trace tests proving every journal balances, posted entries remain immutable, reversal creates a new equal-and-opposite entry, retries do not double-credit, reward allocation stays unique, rejected transactions roll back completely, and `source = user allocation + platform fee + clearing residual` with zero residual.
- All local commit gates pass: lint 27/27, typecheck 41/41, tests 41/41, production build 27/27 with 21 generated Next.js routes, alpha.5 static checks, Compose configuration, a 502-file managed-source manifest, and a 503-file release manifest.

### Development assistance

- OpenAI Codex assisted with architecture review, implementation, documentation, automated tests, migration and release validation, and engineering gap analysis for this project.
- Product ownership, requirements, final decisions, approvals, and release responsibility remain with Abia Nugrahanto.

## [0.3.0-alpha.4] - 2026-08-15

### Added

- Redis-backed distributed upstream health coordination with atomic failure tracking, circuit opening, and a single cross-replica half-open probe.
- ADR-0010 and an operations runbook that define the safe boundary for future shared-upstream multiplexing.

### Changed

- Redis server time is authoritative for distributed circuit and probe leases, avoiding gateway clock-skew errors.
- Production multi-upstream startup requires Redis health coordination and cleans up partially opened dependencies on failure.
- The root Turbo test pipeline now forwards `REDIS_INTEGRATION_URL`, ensuring CI executes the cross-client Redis test instead of conditionally skipping it.

### Fixed

- Upstream failover regression tests use realistic connection/response budgets and assert the primary selection before inducing failure, preventing false backup selection under parallel CI load.
- Every Prisma-generating service Dockerfile now includes the author-header helper required by `db:generate`, fixing clean container builds that previously failed after dependency installation.
- Docker E2E now checks the canonical version-neutral `/version` route instead of the nonexistent `/api/v1/version` path.
- Public landing-page fee labels and examples now consistently show the owner-approved initial platform fee of 0.5% instead of the former 2% alpha placeholder.
- Dependency overrides now live in `pnpm-workspace.yaml`, where pnpm 10 applies them, instead of the ignored legacy `package.json` field.
- Managed-source manifests now exclude generated TypeScript build-info files, keeping source checksums stable before and after local builds.

### Validation boundary

- Cross-client Redis integration, fail-open fallback, configuration, type, lint, static-release, and build gates are required before alpha.4 is accepted.
- Provider-specific fixtures, controlled real-provider tests, safe multiplexing implementation, regional routing, VarDiff evidence, load, soak, and chaos tests remain release blockers for P0.2.
- This remains an alpha release; real mining funds, wallet signing, conversion, and payouts stay disabled.

### Validation evidence

- Mandatory local gates completed on 2026-08-16: migrations 9/9, lint 26/26, typecheck 38/38, tests 38/38, production build 26/26, 20 Next.js routes, Redis cross-client tests 13/13 without skips, clean Stratum image startup, and Docker API/web/Nginx E2E.
- Alpha.4 static checks and the final managed-source/release checksum gates pass over 483 files.
- Repository CI on the committed branch remains an additional release gate and does not expand the no-real-funds alpha boundary.

### Development assistance

- OpenAI Codex assisted with architecture review, implementation, documentation, automated tests, migration and release validation, and engineering gap analysis for this project.
- Product ownership, requirements, final decisions, approvals, and release responsibility remain with Abia Nugrahanto.

## [0.3.0-alpha.3] - 2026-08-13

### Added

- `PROJECT_VISION.md` as the highest project-documentation authority, supported by the Product Constitution and Production Gap Register.
- Versioned mining-fee policies with scope, effective windows, basis-point precision, deterministic resolution, and immutable allocation snapshots.
- Schema version 9 migration that establishes the owner-approved initial platform fee of 0.5% (50 basis points).

### Changed

- Registration and public system configuration now resolve the active database fee policy instead of relying on a source constant.
- Existing accounts on the former 2% alpha default migrate to policy version 1 at 0.5%; custom account rates are retained as explicit account policies.
- Historical reward allocation amounts are retained and annotated with legacy policy snapshots rather than recalculated.

### Validation boundary

- Fee-policy unit, type, static-release, fresh-migration, and upgrade-migration gates are required before alpha.3 is accepted.
- This remains an alpha release; real mining funds, wallet signing, conversion, and payouts stay disabled.

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
