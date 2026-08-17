# MiningPlatform

MiningPlatform adalah monorepo TypeScript untuk **Mining Pool Management Platform** berbasis upstream gateway, validasi share, monitoring worker, event-driven projection, Control Plane, reward/accounting foundation, dan roadmap wallet/payout yang dikunci oleh release gate.

Platform ini **bukan cloud mining**, tidak menjual kontrak hashrate, dan tidak menganggap deposit pengguna sebagai sumber reward mining. Aktivitas mining berasal dari ASIC, GPU, CPU, FPGA, rig hybrid, atau perangkat fisik lain yang terhubung melalui Stratum.

## Current status

Canonical current-status document:

```text
docs/CURRENT_STATUS.md
```

Checkpoint saat ini:

- release package terakhir: `0.3.0-alpha.2`;
- branch aktif: `main`;
- HEAD yang diaudit pada 18 Agustus 2026: `c08296254571c5e37beed9e65687007000cb6a0d`;
- `CHANGELOG.md` memiliki blok `Unreleased` setelah alpha.2;
- status engineering yang benar: **`v0.3.0-alpha.2 + Unreleased HEAD`**;
- jangan menyebutnya `alpha.3` sampai release/version resmi dibuat.

Rilis/HEAD ini adalah **Control Plane + upstream gateway alpha**, bukan mining pool finansial produksi.

## Yang sudah tersedia

### Mining Plane

- Bitcoin/SHA-256 mining core.
- Stratum V1 downstream subscribe/authorize/notify/submit flow.
- Local share validation untuk stale, duplicate, malformed, unauthorized, unknown job, invalid time/version, dan low difficulty.
- Upstream Stratum TCP client dan simulator.
- Provider-scoped multi-job registry.
- Multi-upstream registry dengan priority/weight selection.
- Circuit breaker, recovery backoff+jitter, automatic failover foundation.
- Bounded share queue dan explicit backpressure.
- Upstream pending/accepted/rejected lifecycle.
- Conservative VarDiff foundation.
- Production worker credential authentication dengan PostgreSQL/Redis boundary.

### Event dan Monitoring

- PostgreSQL transactional outbox.
- Redis Stream transport dengan pending recovery/retry/dead-letter foundation.
- Shared idempotency contract.
- Duplicate-share reservation.
- Share/session/job projection.
- Rolling hashrate windows.
- Authenticated realtime worker rooms.
- Health/readiness/Prometheus metrics.
- Universal monitoring-agent inventory/telemetry foundation.

### Control Plane

- Registration.
- Email verification.
- Password login/logout.
- Password reset.
- Access token + rotating refresh sessions.
- Persistent refresh-token family history.
- Atomic refresh rotation, replay detection, family-wide revocation.
- TOTP 2FA.
- RBAC USER/ADMIN/OWNER.
- User profile.
- Active-session management.
- Scoped API keys.
- Worker CRUD.
- Worker credential create/rotate/revoke.
- Notification inbox dan encrypted channel registry.
- Resend-backed identity email melalui transactional outbox.
- Database snapshot/restore tooling.
- Disabled-by-default support receiving-address registry tanpa user balance crediting atau payout.

### Control Plane Frontend v1 - Unreleased HEAD

- Responsive operational navigation.
- Authenticated dashboards.
- Worker management UI.
- Hashrate insights.
- Financial surfaces tetap gated.
- Lightweight Bitcoin reward feed.
- Production-accessible `/control-plane-preview`.
- Same-origin `/api/v1` default untuk production web requests.

## Validation evidence

GitHub Actions CI terakhir pada HEAD `c082962` selesai `success`.

Terbukti hijau:

```text
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm verify:v030-alpha2:static
pnpm verify:payment-addresses
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:manifest:verify
```

Fresh migration dan upgrade migration alpha.2 juga berhasil pada job CI terpisah.

Artinya dokumentasi lama yang menyatakan pnpm/Prisma/PostgreSQL/Redis build dan fresh/upgrade migration belum pernah terbukti tidak lagi mewakili current HEAD.

## Yang masih menjadi blocker produksi

- Docker E2E workflow sudah tersedia tetapi pada audit 18 Agustus 2026 belum memiliki run pada `main`.
- Browser E2E lengkap untuk lifecycle Control Plane belum menjadi release evidence.
- Captured fixture dan soak/failover terhadap selected production upstream provider belum lengkap.
- Distributed API rate limiting, IP reputation, managed DDoS protection, reverse-proxy/public-edge hardening, dan public TLS automation belum selesai.
- Telegram/Discord/webhook delivery dan channel verification belum lengkap.
- Production Resend sender/domain provisioning tetap external deployment work.
- Reward settlement, contribution accounting, automatic journal posting, spendable balance projection, dan reconciliation belum aktif.
- Wallet signer isolation, payout approval, broadcast, confirmation, dan payout nyata tetap disabled/gated.
- Load, stress, long-running soak, selected-upstream failure testing, chaos, dan DR evidence belum lengkap.

**Jangan menghubungkan dana nyata atau mengaktifkan payout produksi pada checkpoint ini.**

## Baseline arsitektur

- Aset awal: BTC.
- Algoritma aktif awal: SHA-256.
- Model awal: upstream pool gateway.
- Reward strategy foundation: `FOLLOW_UPSTREAM`.
- Platform fee baseline: 2%.
- Hardware taxonomy: CPU, GPU, FPGA, ASIC, HYBRID, OTHER, UNKNOWN.
- Ledger target: immutable double-entry journal.
- Event delivery: at-least-once.
- Event durability: PostgreSQL outbox.
- Duplicate reservation: Redis dengan PostgreSQL sebagai pertahanan lanjutan.
- Role: Guest, User, Admin, Owner.
- Deposit user: tidak tersedia.
- Monitoring: Stratum + optional agent.

**Wallet tidak boleh mengubah saldo user secara langsung.** Perubahan saldo hanya boleh berasal dari journal entry yang valid, seimbang, dapat diaudit, dan dapat direkonsiliasi.

## Struktur utama

```text
apps/
  web/                 Next.js landing, auth, Control Plane UI
  api/                 NestJS REST, health, metrics, WebSocket
  stratum-server/      Downstream Stratum gateway + upstream decision flow
  upstream-simulator/  Local Stratum V1 upstream simulator
  outbox-worker/       PostgreSQL outbox -> Redis Stream
  mining-worker/       Projection + hashrate aggregation
  wallet-worker/       Wallet boundary, payout tetap nonaktif
  scheduler/           Central scheduler foundation
  monitoring-agent/    Universal inventory/telemetry foundation

packages/
  miner-detection/     Evidence-based CPU/GPU/FPGA/ASIC/hybrid detection
  mining-core/         Bitcoin header/target/share validation/hashrate
  stratum-protocol/    Downstream/upstream Stratum codec
  upstream-stratum/    Client/state machine/job registry/failover foundation
  event-bus/           In-memory + Redis Stream transport
  database/            Prisma schema/migrations/seed/client
  shared/              Domain/event contracts
  idempotency/         Idempotency contracts
  state-machine/       Transition guards
  security/            scrypt/JWT/TOTP/AES-GCM/credential helpers
  ledger/              Double-entry invariants
  reward-engine/       FOLLOW_UPSTREAM allocation foundation
```

## Persyaratan development

- Node.js `>=22.12.0`.
- pnpm `10.13.1`.
- Docker/Docker Compose untuk PostgreSQL/Redis integration dan compose validation.

## Instalasi

```bash
cp .env.example .env
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm db:generate
```

Jangan gunakan nilai `change-me` untuk deployment apa pun di luar development disposable environment.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Readiness endpoints:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
GET /api/v1/metrics
```

## Development dengan Docker

```bash
pnpm docker:up:dev
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

Development services:

```text
Landing page     http://localhost
Web              http://localhost:3000
API              http://localhost:4000/api/v1
Swagger          http://localhost:4000/docs
Stratum          localhost:3333
Prometheus       http://localhost:9090
Grafana          http://localhost:3001
```

## Upstream gateway lokal

Terminal 1:

```bash
pnpm --filter @mining/upstream-simulator dev
```

Terminal 2:

```bash
STRATUM_DEV_MODE=true \
STRATUM_AUTH_DRIVER=development \
EVENT_BUS_DRIVER=memory \
EVENT_STORE_DRIVER=jsonl \
UPSTREAM_DRIVER=tcp \
UPSTREAM_HOST=127.0.0.1 \
UPSTREAM_PORT=3334 \
pnpm --filter @mining/stratum-server dev
```

Test:

```bash
pnpm test:upstream
```

## Production worker authentication foundation

Worker password/secret dipisahkan dari password akun website.

```bash
pnpm worker:credential create demo.worker1
pnpm worker:credential rotate demo.worker1
pnpm worker:credential revoke wc_exampleCredentialId
```

Production foundation:

```env
STRATUM_DEV_MODE=false
STRATUM_AUTH_DRIVER=postgres
STRATUM_AUTH_MAX_FAILURES=5
STRATUM_AUTH_WINDOW_MS=60000
STRATUM_AUTH_LOCK_MS=900000
EVENT_STORE_DRIVER=postgres
EVENT_BUS_DRIVER=redis
```

Worker plaintext secret ditampilkan sekali dan disimpan sebagai versioned scrypt hash. Authentication audit tidak boleh menyimpan plaintext password atau raw sensitive credential.

## Security boundaries

- Development Stratum authentication ditolak pada production runtime.
- Production Stratum membutuhkan durable event/duplicate boundaries sesuai konfigurasi release.
- Development dashboard/debug surfaces tidak boleh lolos ke production tanpa explicit design decision.
- Wallet worker berada di boundary terpisah dan payout tetap off.
- Database/Redis/internal monitoring services tidak dipublikasikan tanpa alasan operasional yang jelas.
- Private key, seed phrase, signer credential, atau wallet secret tidak boleh berada di source repo, application database, Redis, atau log.
- Environment variables dibatasi per service; jangan meneruskan satu `.env` penuh ke semua container.
- Financial UI tidak berarti financial backend aktif.
- Monitoring Agent tidak boleh menjadi source of truth untuk reward/balance.

## Release history

Dokumen alpha historis dipertahankan di:

```text
docs/releases/
```

Gunakan dokumen berikut untuk current planning:

```text
docs/CURRENT_STATUS.md
docs/roadmap.md
docs/DEVELOPMENT_MASTER_PLAN.md
CHANGELOG.md
```

Dokumen release historis seperti `v0.3.0-alpha.1*` dan `v0.3.0-alpha.2*` adalah audit trail, bukan current-status source.

## Next execution order

1. Pertahankan CI main hijau.
2. Jalankan Docker E2E dan simpan compose-smoke evidence.
3. Tambahkan complete browser E2E Control Plane.
4. Pilih production-upstream candidate dan capture compatibility/TLS/failover/soak fixtures.
5. Selesaikan notification delivery/verification yang masih berada di scope v0.3.
6. Hardening public edge: rate limits, DDoS, TLS, proxy, secret rotation.
7. Jalankan load/soak/failure testing.
8. Tutup blocker sebelum release candidate v0.3 berikutnya.
9. Mulai v0.4 ledger settlement dengan deterministic trace + reconciliation.
10. Jangan mengaktifkan payout nyata sebelum ledger, signer, approval, reconciliation, security, legal/compliance, dan operational runbook lolos gate.

Lihat `docs/roadmap.md` dan `docs/DEVELOPMENT_MASTER_PLAN.md` untuk rencana lengkap.
