# Roadmap

Roadmap ini tunduk pada [`../PROJECT_VISION.md`](../PROJECT_VISION.md) sebagai lapisan dokumentasi tertinggi dan [`product/PRODUCT_CONSTITUTION.md`](product/PRODUCT_CONSTITUTION.md) sebagai penerjemah invariant, urutan investasi, serta release gate. `v1.0.0` adalah milestone produksi pertama, bukan akhir pengembangan produk.

## Release Sequence

```text
v0.2.0  Core Mining Foundation
    ↓
v0.3.0  Control Plane and Monitoring Foundation
    ↓
v0.4.0  Ledger and Settlement
    ↓
v0.5.0  Wallet and Secure Payout
    ↓
v0.6.0  Transparency and Owner Operations
    ↓
v1.0.0  Production-Ready Upstream Gateway
```

## Current Checkpoint: v0.3.0-alpha.7

Implemented:

- Root Project Vision ditetapkan sebagai lapisan dokumentasi tertinggi, dengan Product Constitution dan Production Gap Register sebagai dokumen pelaksana.
- Default fee awal 0,5% dipindahkan ke versioned database policy (50 basis points), lengkap dengan scope, effective window, resolver deterministik, dan immutable allocation snapshot foundation.
- Redis distributed upstream health, single cross-replica half-open probe, fail-open local fallback, and ADR-0010 safe multiplexing boundary.
- Immutable upstream-accepted contribution facts, atomic settlement import, deterministic 50 bps fee snapshots, balanced ledger posting, liability balance projection, and equal-and-opposite reversals under ADR-0011.
- Authenticated reward/ledger/balance read APIs plus OWNER+TOTP settlement import and reversal commands.
- Two-owner reconciliation correction lifecycle, exact referral fee accounting, and default `MP05` donation liability from alpha.6.
- Versioned Asset/Network/PayoutRoute catalog and payout-address registration foundation with checksum validation, session-bound single-use password+TOTP step-up, cooldown, audit, masked reads, and database route gates.
- Auto-withdrawal preference `OFF/ON` remains default OFF and cannot become effective on a registration-only route or while the global payout gate/executor is disabled.
- v0.2.0-alpha.6 mining foundation, multi-upstream registry, circuit breaker, failover, provider-scoped jobs, bounded share queue, and VarDiff foundation.
- Official domain architecture, bounded contexts, context map, data flow, event flow, event catalog, and canonical ADR set.
- Registration, transactional email verification, login/logout, access token, atomic token-family refresh rotation/replay revocation, password reset, and TOTP 2FA.
- RBAC roles USER, ADMIN, and OWNER; administrative routes require TOTP.
- User profile, active-session management, scoped API keys, Worker CRUD, and worker credential rotation/revocation.
- Production worker credential path connected to `ProductionWorkerAuthenticator`.
- Production dashboard REST snapshot and authenticated WebSocket rooms.
- Notification inbox and encrypted channel registry.
- Root CI workflows, fresh/upgrade migration jobs, Docker E2E workflow, and Docker wiring for Control Plane secrets and upstream resilience settings.

Release blockers:

- Successful alpha.7 full pnpm, Prisma, PostgreSQL, Redis, Docker, static, security-diff, and repository CI validation on the exact commit.
- Captured compatibility and soak/failover fixtures from selected production upstream providers.
- Distributed API rate limiting, IP reputation, managed DDoS protection, and public TLS automation.
- Telegram, Discord, webhook delivery and channel verification; Resend identity email provisioning remains external.
- Selected-provider settlement evidence, payout eligibility/reservation, isolated signer and approval flow, wallet/blockchain reconciliation, and real payouts.
- Load, stress, and chaos validation.

## v0.2.0-alpha.6: Upstream Resilience — Implemented foundation

- Pool adapter layer.
- Multi-upstream registry and health scoring.
- Circuit breaker, backoff with jitter, and failover policy.
- Transparent or explicitly controlled session recovery.
- Share queue and response timeout handling.
- Provider-specific captured fixtures.
- VarDiff foundation and job lifecycle hardening.

## v0.2.0: Core Mining Foundation

- Expanded mining schema and migrations.
- Miner session and Stratum job persistence.
- Stratum V1 subscribe, authorize, notify, and submit flow.
- Upstream connection and relay.
- Local SHA-256 share validation.
- Difficulty target calculation.
- Duplicate, stale, malformed, unauthorized, and low-difficulty detection.
- Share state machine.
- Event bus and transactional outbox.
- Shared idempotency capability.
- Share persistence and upstream result tracking.
- Realtime Redis aggregation.
- Worker state and hashrate windows.
- WebSocket dashboard updates.
- Time-series retention jobs.
- End-to-end Stratum test miner.

Release gate: `docs/releases/v0.2.0-definition-of-done.md`.

## v0.3.0: Control Plane and Monitoring Foundation

- Miner API and optional monitoring agent.
- Temperature, fan, power, hardware error, and efficiency metrics.
- Monitoring alerts and incident lifecycle.
- Upstream reconciliation.
- `FOLLOW_UPSTREAM` reward strategy.
- Reward period state machine.
- Reward previews without spendable balances.

## v0.4.0: Ledger and Settlement

- Production double-entry journal posting.
- Reward liability accounts.
- Platform fee and upstream fee accounting.
- Immutable journal references and reversals.
- Balance projections.
- Reconciliation reports.

## v0.5.0: Wallet and Secure Payout

- Bitcoin node and wallet adapter.
- UTXO inventory and locking.
- Coin selection and fee estimation.
- Payout batches.
- PSBT and approval flow.
- Hot and cold wallet policy.
- Broadcast, RBF, confirmation, and settlement.
- Emergency wallet controls.

## v0.6.0: Transparency and Owner Operations

- Public pool and network metrics.
- Aggregated earnings and payout statistics.
- Owner user and worker management.
- Pool configuration.
- Reward operations.
- Wallet approval.
- Maintenance and emergency controls.
- Audit logs, security events, and system health.

## v1.0.0: Production-Ready Upstream Gateway

- Security assessment and remediation.
- Capacity and failure testing.
- Disaster recovery exercises.
- Production observability and on-call runbooks.
- Reconciliation acceptance criteria.
- Operational approval for real funds.

## Strategic Horizon After v1.0.0

Urutan strategis setelah milestone produksi pertama:

1. Conversion Engine, Asset/Network Catalog, referral economics, dan multi-asset reward configuration.
2. Auto payout, multi-network, multi-chain, serta treasury/risk automation yang tetap berbasis ledger dan rekonsiliasi.
3. Public Developer API, SDK, authenticated webhooks, desktop miner supervisor, dan mobile monitoring.
4. Enterprise/farm management, organizations, teams, fleet grouping, bulk configuration, regional Stratum, dan intelligent routing.
5. Support/news ecosystem dan community layer setelah moderation serta trust-and-safety matang.
6. Own-pool infrastructure untuk algoritma terpilih setelah hashrate, liquidity, node operations, security, dan economics memenuhi gate investasi.

Default fee awal lintas tahap adalah **0,5%**, tetapi penyelesaiannya harus memakai versioned fee policy agar dapat dikonfigurasi berdasarkan aset, algoritma, jaringan, campaign, referral, atau tier tanpa mengubah settlement historis.
