# MiningPlatform Roadmap

Tanggal sinkronisasi: 18 Agustus 2026 (Asia/Jakarta)

Dokumen ini adalah roadmap aktif. Status implementasi terbaru dibaca bersama `docs/CURRENT_STATUS.md`, `CHANGELOG.md`, dan bukti GitHub Actions.

## Release Sequence

```text
v0.2.x  Core Mining Foundation
    ↓
v0.3.x  Control Plane + Monitoring + Upstream Hardening
    ↓
v0.4.x  Ledger and Settlement
    ↓
v0.5.x  Wallet and Secure Payout
    ↓
v0.6.x  Transparency and Owner Operations
    ↓
v1.0.0  Production-Ready Upstream Gateway
```

## Current Checkpoint

- Release package terakhir: `0.3.0-alpha.2`.
- HEAD `main` yang diaudit: `c08296254571c5e37beed9e65687007000cb6a0d`.
- `CHANGELOG.md` memiliki blok `Unreleased` setelah alpha.2.
- Checkpoint engineering aktif: **`v0.3.0-alpha.2 + Unreleased HEAD`**.
- Jangan menyebutnya `alpha.3` sebelum version/release resmi dibuat.

## Pencapaian Saat Ini

### Core Mining dan Upstream

- Bitcoin/SHA-256 header reconstruction, target/difficulty, achieved difficulty, dan SHA-256d validation.
- Share validation untuk unauthorized, unknown job, stale, duplicate, malformed, invalid time/version, dan low difficulty.
- Stratum V1 downstream flow dan upstream TCP client/simulator.
- Provider-scoped multi-job registry dan clean invalidation.
- Multi-upstream registry dengan priority/weight selection.
- Circuit breaker, automatic recovery, exponential backoff, dan jitter.
- Bounded share queue, timeout, explicit backpressure, dan VarDiff foundation.
- Production worker authentication dengan credential lifecycle, scrypt hashing, PostgreSQL validation, Redis rate limiting, lock/expiry/rotation/revocation.

### Event, Projection, dan Monitoring

- PostgreSQL transactional outbox.
- Redis Stream transport dengan pending recovery, retry tracking, malformed-event isolation, dan dead-letter foundation.
- Duplicate-share reservation dan shared idempotency contract.
- Share/session/job projection dan rolling hashrate windows.
- Authenticated realtime worker rooms.
- API liveness/readiness/Prometheus metrics.
- Monitoring-agent universal inventory/telemetry foundation.

### Control Plane

- Registration, email verification, login/logout, reset password.
- Access token dan rotating refresh sessions.
- Persistent refresh-token family history, atomic refresh rotation, replay detection, dan family-wide revocation.
- TOTP 2FA.
- RBAC USER/ADMIN/OWNER.
- User profile, active sessions, scoped API keys.
- Worker CRUD dan worker credential management.
- Notification inbox dan encrypted channel registry.
- Identity email melalui transactional outbox + Resend adapter.
- Database snapshot/restore tooling.
- Disabled-by-default support receiving-address registry tanpa user balance credit atau payout.

### Control Plane Frontend v1 - Unreleased HEAD

- Responsive operational navigation.
- Authenticated dashboard surfaces.
- Worker management UI.
- Hashrate insights.
- Financial surfaces tetap gated.
- Lightweight Bitcoin reward feed.
- Production-accessible `/control-plane-preview`.
- Same-origin `/api/v1` default untuk production web requests.

## Validation Evidence yang Sudah Hijau

CI utama pada HEAD `c082962` selesai `success`.

Terbukti berhasil:

- `pnpm install --frozen-lockfile`;
- Prisma generation;
- database migration deploy;
- static alpha.2 verification;
- payment-address validation;
- lint;
- TypeScript typecheck;
- tests;
- production build;
- release-manifest verification;
- fresh migration verification;
- upgrade migration verification.

Karena itu dokumen lama yang menyatakan build/migration tersebut sama sekali belum terbukti tidak lagi mewakili current HEAD.

## Blocker v0.3 Berikutnya

1. **Docker E2E evidence** - workflow sudah ada, tetapi pada audit 18 Agustus 2026 belum memiliki run pada `main`.
2. **Browser E2E Control Plane** - registration, verification, login, refresh/replay, password reset, 2FA, Worker CRUD, credential lifecycle, dashboard/realtime authorization.
3. **Production-upstream compatibility** - selected-provider captured fixtures, TLS/auth semantics, provider errors, disconnect/recovery, failover, timeout, malformed response, dan long-session soak.
4. **Public edge hardening** - distributed rate limiting, IP reputation, DDoS protection, reverse-proxy limits, public TLS/certificate automation, secret rotation.
5. **Notification completion** - Telegram, Discord, webhook delivery/signing/verification, serta production Resend provisioning.
6. **Load/stress/soak/failure evidence** - Stratum, API, Redis/event projection, WebSocket fanout, queue pressure, upstream failover, dan resource/leak observation.

## v0.4.x - Ledger and Settlement

Tujuan: production accounting yang deterministik dan dapat direkonsiliasi, **tanpa payout nyata terlebih dahulu**.

- Production double-entry journal posting.
- Reward liability accounts.
- Platform/upstream fee accounting.
- Contribution accounting dari traceable source events.
- Immutable journal references dan reversals.
- Balance projections hanya dari ledger.
- Deterministic replay.
- Internal-vs-upstream reconciliation.
- Idempotent accounting consumers.
- Period close/reopen policy.
- Financial trace integration suite.

### Gate v0.4

- Journal selalu balanced.
- Tidak ada balance mutation di luar journal.
- Retry tidak double-credit.
- Reversal mempertahankan invariant.
- Reconciliation menjelaskan selisih.
- Accounting trace dapat direplay.

## v0.5.x - Wallet and Secure Payout

Dimulai hanya setelah ledger/settlement lolos gate.

- Wallet/node adapter.
- Signer isolation.
- Spend inventory/UTXO controls.
- Transaction construction dan fee estimation.
- Payout request + balance reservation.
- Approval policy.
- Batch/sign/broadcast/confirmation lifecycle.
- Hot/warm/cold treasury policy.
- Reorg/retry/RBF handling bila relevan.
- Payout reconciliation.
- Emergency stop dan treasury limits.

### Gate v0.5

- Private key/seed tidak berada di application DB, Redis, repo, atau log.
- Signer least-privilege dan terisolasi.
- Scheduler idempotent.
- Reservation mencegah double payout.
- Semua transition auditable.
- Reconciliation terhadap node/provider terbukti.
- Legal/compliance dan treasury runbook disetujui sebelum dana nyata.

## v0.6.x - Transparency and Owner Operations

- Public aggregate metrics tanpa membocorkan user data.
- Owner user/worker/pool/reward operations.
- Wallet approval surface.
- Maintenance/emergency controls.
- Audit/security explorer.
- Incident/maintenance publication.
- Support/case-management foundation.

## MiningPlatform Agent Track

Agent boleh berkembang paralel selama tidak mengganggu release gate utama.

### A0 - Read-only Telemetry
- Device/installation identity.
- Hardware inventory.
- Worker association.
- Outbound-only authenticated telemetry.
- Tidak menjalankan miner secara default.

### A1 - Lightweight Desktop Monitor
- Lightweight core + optional UI.
- UI dapat ditutup sementara core tetap berjalan.
- Monitoring CPU/GPU/ASIC tanpa menjadi source reward/balance.

### A2 - Port and Configuration Manager
- Auto/custom port profiles.
- TLS/TCP endpoint selection.
- Local miner API loopback-only by default.
- Port conflict detection dan fallback.

### A3 - BYOM Miner Adapters
- Bring Your Own Miner.
- Adapter XMRig/lolMiner/dll.
- Normalized telemetry schema.
- Clean core tidak membundel arbitrary miner binaries.

### A4 - Optional Miner Supervisor
- Explicit opt-in local mining runtime.
- Whitelisted start/stop/pause/resume.
- Tidak ada arbitrary remote shell.
- Resource usage dan STOP control selalu jelas.

### A5 - Resource/Thermal Policy
- Eco/Balanced/Performance/Custom.
- Thermal guard.
- Power/intensity limits.
- Schedule/idle mode.

### A6 - Fleet/Headless
- Headless rig agent.
- Fleet grouping.
- Safe remote commands.

### A7 - Verified Miner Registry
- Optional package registry.
- Explicit consent sebelum download.
- Vendor/source/version/SHA-256/signature metadata.
- Tidak ada antivirus evasion atau silent exclusion.

### A8 - Remote Management
- Signed/validated configuration.
- Whitelisted commands only.
- Device binding/mTLS bila relevan.
- Audit trail.

## v1.0.0 - Production-Ready Upstream Gateway

v1.0 membutuhkan evidence operasional:

- security assessment/remediation;
- production-like load/capacity testing;
- long-running soak;
- upstream failover/failure evidence;
- disaster-recovery exercise;
- backup restore drill;
- production observability dan on-call ownership;
- reconciliation acceptance criteria;
- secrets/certificate rotation drill;
- incident response runbook.

## Aturan Scope

- Financial UI tidak berarti financial backend aktif.
- Wallet/payout tidak boleh dipercepat hanya karena dashboard sudah siap.
- Agent telemetry tidak boleh menjadi sumber kebenaran reward.
- Server-side accepted work tetap authoritative untuk contribution/reward.
- Historical alpha release docs tetap disimpan sebagai audit trail.
- `docs/CURRENT_STATUS.md` adalah ringkasan current checkpoint.
