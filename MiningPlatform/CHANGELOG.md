# Changelog

## [Unreleased]

### Added

- Controlled payout execution foundation with database-backed eligibility snapshots, exact journal balance reservation, append-only approval evidence, user-owned selected payout destinations, cancellation/rejection reversal journals, and fail-closed request/signing/broadcast controls.
- Schema v14 evidence records for signing requests, broadcast attempts, chain observations, payout reconciliation, wallet reconciliation, and per-asset emergency payout controls; historical alpha.7 payouts remain preserved as execution version 1.
- Authenticated APIs for selecting an account payout destination, creating idempotent payout requests, listing payout history, cancelling pre-approval requests, and recording separated administrator approval or rejection.
- Fresh and alpha.7-to-schema-14 migration rehearsal plus controlled-payout integration coverage for retry safety, balanced reservation, self-approval rejection, unique final decisions, cancellation boundaries, rejection reversal, and wallet-reservation oversubscription prevention.
- ADR-0014 defining the isolated signer boundary, payout evidence state machine, independent production gates, and reconciliation requirements.
- Bitcoin Core watch-only RPC adapter with exact satoshi conversion, synchronized wallet snapshots, PSBT construction and output verification, reserved-fee enforcement, input unlock on preparation failure, finalization, mempool preflight, raw broadcast, and confirmation/reorg observations.
- Versioned signer protocol with canonical manifest digests and replay-bound HMAC authentication, plus an isolated transaction-signer service that independently validates destination, amount, fee, owned change outputs, key allowlist, and manifest expiry before calling a signer-only Bitcoin Core wallet.
- Wallet-worker signer client and AES-256-GCM artifact encryption primitives with request/response binding, payload limits, timeouts, and regression tests; PSBT, signed PSBT, raw transactions, authorization values, and encrypted artifact fields are redacted from structured logs.
- Separate transaction-signer container and Docker network. The API has no route or network membership to the signer, and production signer startup requires mutual TLS unless an explicit unsafe acknowledgement is supplied.
- RandomX validation foundation with XMRig-compatible CryptoNote nonce placement and target parsing, strict job/share bounds, constant-time result comparison, deterministic share fingerprints, and a fail-closed client for the official `randomx-service` hashing boundary.
- Isolated CryptoNote JSON-RPC upstream adapter for RandomX login, mandatory seeded-job normalization, bounded job retention and expiry, TLS-capable transport, correlated submissions, response timeouts, line-size limits, and fail-closed protocol parsing.
- ADR-0015 defining separate RandomX validation and CryptoNote upstream boundaries, algorithm-discriminated accounting evidence, and fail-closed production activation gates.
- Native Pool Gap Register promoted to an active engineering track, prioritizing the Bitcoin regtest path from `getblocktemplate` and deterministic coinbase construction through `submitblock`, maturity, native reward allocation, versioned fees, balanced ledger posting, and exact coinbase/wallet/liability reconciliation.
- Owner-confirmed native Bitcoin mainnet coinbase default `1P6FZk2jiRuFkP8m4RuAVi9QVYWvhDCtrA`, with the separate BEP20 deposit destination retained as non-Bitcoin receiving metadata and explicit network-mismatch safeguards documented.
- Fail-closed native Bitcoin Core readiness and `getblocktemplate` adapter with exact-chain, sync, network, version, and warning gates; strict transaction/dependency, target/`bits`, block-limit, coinbase-value, and witness-commitment validation; bounded template expiry; and canonical source digests.
- ADR-0016 defining the private full-template boundary, minimal miner-facing job projection, separately bounded mining RPC responses, and the remaining regtest-to-`submitblock` activation gates.
- Offline native Bitcoin job foundation with checksum- and network-validated address-to-script conversion, deterministic BIP34 coinbase construction, exact owner-selected payout value, separate stripped/full witness serialization, display-order txid merkle branches, evidence-bound job identities, and full block-candidate reconstruction.
- Candidate reconstruction now rejects stale or mutated evidence, invalid time rolling, hashes above the network target, and candidates exceeding the Bitcoin Core template size or weight limits; it produces correlated header, block, coinbase txid/wtxid, and raw-block digests without performing an RPC side effect.
- Explicit Bitcoin Core proposal and `submitblock` RPC boundary with bounded raw-block payloads, node-readiness checks, fresh digest-matching valid-proposal evidence required before submission, and distinct accepted, duplicate, inconclusive, and rejected result evidence.
- Redis-time native mining coordination foundation with globally unique bounded extranonce leases per chain and template digest, monotonic lease expiry across identical template refreshes, Redis Cluster-compatible hash tags, and deterministic allocation evidence.
- Private native-job serialization and Redis retention with bounded payloads, restored `BigInt`/`Date` evidence, complete bundle validation, idempotent writes, newest-observation active selection, expiry enforcement, and mutation detection.

### Changed

- The alpha.7 static release checker now tracks all 32 exact-tree workspace package files and the current independently gated payout readiness controls introduced during Unreleased development.
- Payout readiness now evaluates the selected account destination, active route window, minimum/maximum amount, current posted user liability, recent matched wallet reconciliation, signer configuration, wallet reserve, single-payout limit, and rolling daily limit.
- Wallet liquidity checks lock the selected hot wallet and subtract all active reservations before admitting a new request, preventing concurrent accounts from committing the same node balance.
- `PILOT` and `ACTIVE` payout routes now bind an explicit asset-matched hot wallet, eliminating nondeterministic wallet selection when an asset has multiple treasury wallets.
- One payout may have only one append-only approval decision, enforced by both the service state machine and a database uniqueness constraint.
- Payout preference reads expose explicit blockers for request, signing, and broadcast gates; auto withdrawal remains ineffective whenever any required gate or destination prerequisite is missing.

### Safety boundary

- The API and web application do not possess private keys and cannot sign or broadcast. The isolated signer and watch-only adapter boundary now exist, while durable wallet orchestration, broadcast recovery, confirmation/reorg handling, and final wallet reconciliation are still under implementation; all real-funds gates remain disabled by default.
- Production activation still requires external custody credentials, funded-wallet authorization, operational approvers, incident controls, and exact deployment evidence; this development milestone does not authorize transfer of real funds.
- RandomX validation is not yet connected to a miner-facing listener, upstream pool, reward projection, or production sidecar; no RandomX share can affect balances in this checkpoint.
- The RandomX upstream adapter is intentionally separate from Bitcoin Stratum V1 and is not activated by runtime configuration in this checkpoint.
- The configured native coinbase destination does not activate mining or guarantee revenue; native Bitcoin mining remains hard-disabled in Docker, and the laboratory must use disposable regtest funds and a regtest-owned destination.
- The native Bitcoin template, coinbase/job/candidate, Redis coordination, proposal, and submission boundaries have fixture-level evidence only and are not invoked by Stratum or Docker. Live Redis restart/partition evidence, durable submission records, and Bitcoin Core regtest remain mandatory; no block is automatically submitted and no reward can be created in this checkpoint.

### Development assistance

- OpenAI Codex is assisting with architecture review, implementation, documentation, automated tests, migration validation, security analysis, and deployment readiness work.
- Product ownership, requirements, final decisions, approvals, production credentials, and release responsibility remain with Abia Nugrahanto.

## [0.3.0-alpha.7] - 2026-08-22

### Added

- Schema v13 controlled-payout foundation with explicit `AssetNetwork`, immutable versioned `PayoutRoute`, hardened payout-address lifecycle, and single-use `StepUpAuthorization`.
- Password+TOTP step-up bound to the authenticated user, interactive session, and payout-address scope; raw tokens are returned once, persisted only as hashes, expire after five minutes, and are consumed atomically.
- One global successful-TOTP counter shared by enrollment, login, factor disablement, and payout step-up, including atomic rejection of concurrent or cross-flow replay.
- Offline Bitcoin mainnet Base58Check, BIP-173 Bech32, and BIP-350 Bech32m validation without enabling RPC balance, signing, broadcast, or confirmation operations.
- Authenticated route/address APIs and wallet-dashboard controls for registration, cooldown activation, replacement, and disablement; normal reads expose only a masked address and network-bound SHA-256 fingerprint.
- Database enforcement for immutable route/step-up identity, immutable address validation evidence, one active address per user/route, address/route payout alignment, registration-only payout rejection, and status-only transition guards that keep pilot payouts in `REVIEW` until a future approval control exists.
- Fresh schema-13 and alpha.6-to-alpha.7 migration rehearsal with representative legacy address and payout backfill.

### Changed

- Auto-withdrawal readiness now evaluates the actual active address and route; registration-only routes add `PAYOUT_ROUTE_NOT_ACTIVE` and cannot become effective.
- PostgreSQL `CURRENT_TIMESTAMP` is authoritative for payout-address cooldown and step-up expiry decisions, preventing application/database clock skew from activating a destination early.
- Transactional address mutations return only an ID inside the transaction and load their masked read model after commit, avoiding concurrent relation queries on one PostgreSQL transaction connection.
- Reconciliation resolution now performs scalar transaction reads sequentially, keeping one PostgreSQL transaction connection free from concurrent relation-query warnings.
- Product authority, constitution, ADR index, roadmap, gap register, release metadata, build information, and operations guidance advance to the payout-control foundation.

### Fixed

- Next.js and `eslint-config-next` advance from 16.0.0 to the stable 16.3.2 patch line so Vercel no longer blocks deployment for a vulnerable framework runtime.
- Vercel Preview builds trace from the Git repository root so the required server manifest preserves the `MiningPlatform/apps/web` path expected by the platform packager; Turbo now forwards the `VERCEL` and `NEXT_OUTPUT_MODE` build inputs, while Docker standalone output retains the narrower monorepo-root boundary.
- Direct web typechecks now build the `@mining/shared` declaration output first, so Vercel Deployment Checks use the same workspace dependency boundary as the repository pipeline.
- Financial-truth zero-payout evidence is scoped to its isolated fixture user, so realistic upgrade rehearsal data can retain a representative legacy payout without producing a false failure.
- An active session can no longer replace an enabled TOTP factor: re-enrollment is rejected atomically until the existing factor is disabled with the current password and TOTP.
- A TOTP code accepted during enrollment or login can no longer be replayed for payout step-up; one monotonic counter now covers every successful TOTP authentication flow, while recovery-code removal is atomic under concurrency.
- TOTP setup, enablement, and disablement now require an interactive access-token session, so delegated API keys cannot mutate the human account's authentication factor.
- Payout-address and auto-withdrawal reads now declare explicit API-key scopes, and preference changes require an interactive access-token session.
- Concurrent wallet requests now share one in-flight refresh operation, preventing legitimate refresh-token rotation from revoking its own session family.
- Step-up issuance and consumption now derive their timestamps from PostgreSQL, so application-clock skew cannot extend a sensitive authorization beyond its database-enforced five-minute window.
- The active repository-root GitHub CI and release workflows now execute alpha.7 static, payout integration, fresh migration, and alpha.6-upgrade gates; the static checker verifies those active workflows instead of trusting the packaged nested copy.

### Safety boundary

- Checksum and network validation prove address format, not control of the corresponding private key.
- A newly registered address must complete its route-defined cooldown and explicit activation; replacement disables the previous address rather than rewriting history.
- The seeded BTC route is `ADDRESS_REGISTRATION`, so payout creation is rejected at the database even if an API path is introduced incorrectly.
- `PAYOUTS_ENABLED=false` remains the default. Eligibility, balance reservation, batching, signing, broadcast, confirmation, reorg recovery, and real payouts remain disabled.

### Validation evidence

- Frozen-lockfile installation succeeds across all 28 workspaces; repository gates pass with lint 27/27, typecheck 42/42, tests 42/42, and production build 27/27 with 21 generated Next.js routes.
- Targeted security tests pass 16/16, Bitcoin address-validator tests pass 4/4, and API tests pass 5/5 including payout-control integration.
- Disposable PostgreSQL fresh and alpha.6 upgrade rehearsals apply all 13 migrations and verify backfill, immutability, single-use authorization, route gating, status-only transition rejection, safe terminal cancellation, and payout alignment.
- API integration proves enabled-TOTP replacement is rejected, the original factor remains usable, login-to-step-up TOTP replay fails, API-key preference writes fail, and payout-control behavior remains intact; browser regression proves two concurrent 401 responses cause exactly one refresh rotation.
- Payout-control integration proves hashed and once-consumed step-up, database-time expiry despite a deliberately skewed application clock, global TOTP replay rejection, checksum validation, masked reads, cooldown/activation, one active destination, immutable identity, registration-route rejection, audit records, and zero payout creation without driver warnings.
- Accounting and reconciliation integrations pass the financial invariants for balanced journals, posted-entry immutability, equal-and-opposite reversal, retry idempotency, unique reward allocation, rollback, and exact source decomposition.
- Docker E2E builds and starts API, web, outbox, mining, and accounting images behind Nginx, applies all 13 migrations, reports PostgreSQL/Redis/API healthy, and returns HTTP 200 for readiness, version, and disabled-wallet status; runtime configuration confirms `PAYOUTS_ENABLED=false` and the initial platform fee of 0.5%.
- Codex Security review identified enabled-TOTP replacement, cross-flow TOTP replay, payout API-key scope gaps, API-key TOTP mutation, and application-clock-sensitive step-up expiry; all five remediations are implemented and covered by regression or static acceptance tests. Verified manifests, a final exact-tree security report, and exact-commit GitHub CI evidence remain mandatory promotion evidence.

### Development assistance

- OpenAI Codex assisted with architecture review, implementation, documentation, automated tests, migration and release validation, and engineering gap analysis for this project.
- Product ownership, requirements, final decisions, approvals, and release responsibility remain with Abia Nugrahanto.

## [0.3.0-alpha.6] - 2026-08-21

### Added

- Schema v11 reconciliation-exception lifecycle with immutable imported evidence, explicit correction requests, two-owner approval/rejection, versioned replacement reconciliation, and a single settlement event after approval.
- Schema v12 referral fee foundation with versioned referral programs, immutable account attribution, personal referral codes, and default promo code `MP05` whose commission beneficiary is the site-donation liability.
- Exact PPM accounting for the **0.50%** standard fee, **0.375%** referred-miner fee, and **0.125% of gross reward** referral commission; allocations persist the rate, code, program, commission, and retained-platform snapshots.
- Worker username parsing for `account.worker#CODE`, with valid-code enforcement, sticky attribution, self-referral rejection, conflict rejection, and audit records.
- Authenticated auto-withdrawal preference per mining account/asset, default `OFF`, with an accessible `OFF/ON` dashboard control and explicit readiness blockers.
- Fresh and alpha.5-to-alpha.6 migration rehearsal covering both new migrations, representative reconciliation exceptions, fee precision backfill, existing-user referral-code backfill, and the safe auto-withdrawal default.

### Changed

- Referral commission is funded from the charged platform fee rather than deducted in addition to the miner fee. For a referred allocation, 0.375% is split into 0.125% beneficiary liability and 0.25% retained platform revenue.
- Reward journals can now credit miner liability, referral/donation liability, and retained platform revenue while preserving `source = user net + charged platform fee + clearing` and `charged fee = referral commission + platform retained`.
- `PROJECT_VISION.md` now records the owner-approved referral economics and auto-withdrawal safety semantics as the highest documentation authority.
- Release metadata advances to `0.3.0-alpha.6`, schema version 12, and migration `20260821020000_referral_fee_foundation`.

### Safety boundary

- Unknown, inactive, malformed, conflicting, and self-owned referral codes do not receive a discount. Referral attribution is immutable and mid-period attribution does not retroactively discount earlier contribution facts.
- `MP05` accrues commission to a donation ledger liability; no real donation wallet address is invented or activated.
- Auto withdrawal `ON` is only a stored user preference. It cannot bypass the global payout kill switch, verified-address requirement, minimum threshold, balance reservation, wallet health, or operational approvals.
- Real wallet signing, transaction broadcast, conversion, and payouts remain disabled.

### Validation evidence

- Reward-engine tests prove exact 5,000/3,750/1,250 PPM arithmetic and commission funding from the charged fee.
- Disposable PostgreSQL fresh and alpha.5 upgrade rehearsals pass all 12 migrations and verify reconciliation triggers, MP05 economics, personal-code backfill, 5,000 PPM default-policy backfill, and auto withdrawal `OFF`.
- End-to-end accounting evidence proves a 100,000-unit referred allocation produces fee 375, donation commission 125, retained revenue 250, and user net 98,125 after provider costs; journals balance, retries do not double-credit, reversal remains equal-and-opposite, and payouts created remain zero.
- Frozen-lockfile installation succeeds across all 28 workspaces; repository gates pass with lint 27/27, typecheck 41/41, tests 41/41, and production build 27/27 with 21 generated Next.js routes.
- Accounting and reconciliation integrations pass all financial invariants, including balanced journals, posted-entry immutability, equal-and-opposite reversal, retry idempotency, unique reward allocation, transactional rollback, and exact source reconciliation.
- The final 520-file managed-source manifest and 521-file release manifest verify successfully.
- Docker E2E applies all 12 migrations, builds clean API/web/outbox/mining/accounting images, starts the isolated stack, and returns HTTP 200 for readiness, version, and disabled-wallet status without runtime errors.
- Codex Security reviewed all 75 changed-file work items against the threat model and produced zero reportable findings. GitHub CI remains mandatory on the Draft PR before promotion.

### Development assistance

- OpenAI Codex assisted with architecture review, implementation, documentation, automated tests, migration and release validation, and engineering gap analysis for this project.
- Product ownership, requirements, final decisions, approvals, and release responsibility remain with Abia Nugrahanto.

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
