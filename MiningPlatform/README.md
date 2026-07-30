# MiningPlatform

MiningPlatform adalah monorepo TypeScript untuk pengelolaan mining pool, koneksi Stratum, validasi share, monitoring worker, akuntansi reward, ledger, wallet, payout, dan transparansi operasional.

Platform ini bukan cloud mining. Platform tidak menjual kontrak hashrate. Aktivitas mining berasal dari ASIC atau GPU fisik. Fase awal memakai model upstream pool gateway.

## Status

Versi saat ini: `0.2.0-alpha.1`

Rilis alpha ini menyediakan pipeline development dari Stratum test miner sampai dashboard realtime. Upstream relay nyata, reward settlement, ledger posting, wallet Bitcoin, dan payout belum aktif.

Landing page publik pada route `/` telah menggunakan desain mining khusus dengan status alpha yang eksplisit. Spesifikasi visual dan tipografi tersedia di `docs/ui/landing-page-v1.md`.

```text
Stratum test miner
    ↓
subscribe dan authorize
    ↓
development mining job
    ↓
share submission
    ↓
local SHA-256d validation
    ↓
Redis Stream
    ↓
PostgreSQL projection
    ↓
5-minute hashrate snapshot
    ↓
WebSocket
    ↓
Next.js dashboard
```

## Baseline

- Aset pertama: BTC
- Algoritma: SHA-256
- Model: upstream pool gateway
- Reward: `FOLLOW_UPSTREAM` setelah rekonsiliasi
- Fee platform: 2%
- Hardware awal: ASIC
- Ledger: immutable double-entry journal
- Monitoring: Stratum dan agent opsional
- Role: Guest, User, Owner
- Deposit pengguna: tidak tersedia

## Aturan Dependensi

```text
Stratum
    ↓
Share Validation
    ↓
Accepted Share
    ↓
Difficulty Accumulation
    ↓
Monitoring and Statistics
    ↓
Reward Allocation
    ↓
Ledger
    ↓
Wallet
    ↓
Payout
```

Wallet tidak boleh mengubah saldo pengguna. Perubahan saldo hanya berasal dari journal entry yang valid dan seimbang.

## Struktur

```text
apps/
  web/                 Next.js dashboard dan landing page
  api/                 NestJS REST API dan WebSocket gateway
  stratum-server/      TCP Stratum gateway
  mining-worker/       Event projection dan hashrate aggregation
  wallet-worker/       Future wallet and payout jobs
  scheduler/           Central scheduled job dispatcher
  monitoring-agent/    Optional miner telemetry agent
packages/
  mining-core/         Bitcoin header, target, validation, duplicate, and hashrate logic
  stratum-protocol/    Stratum parser, request types, response, and notification helpers
  event-bus/           In-memory event bus and Redis Stream transport
  database/            Prisma schema, baseline migration, seed, and client
  shared/              Shared event contracts and domain types
  idempotency/         Shared idempotency contract
  state-machine/       Finite state transition guard
  ledger/              Double-entry ledger rules
  reward-engine/       Reward strategy foundation
  blockchain-adapters/ Blockchain adapter foundation
```

## Menjalankan Core Mining Smoke Test

Persyaratan:

- Node.js 20.9 atau lebih baru
- pnpm 10
- Docker dan Docker Compose

Salin environment file.

```bash
cp .env.example .env
```

Aktifkan konfigurasi development berikut pada `.env`:

```dotenv
NODE_ENV=development
STRATUM_DEV_MODE=true
STRATUM_DEV_WORKER=demo.worker1
STRATUM_DEV_PASSWORD=x
STRATUM_DEV_DIFFICULTY=0.000001
SEED_DEVELOPMENT_DATA=true
EVENT_BUS_DRIVER=redis
PAYOUTS_ENABLED=false
```

Saat service Node.js berjalan dari host, gunakan `localhost` untuk PostgreSQL dan Redis.

```dotenv
DATABASE_URL=postgresql://mining:change-me@localhost:5432/mining_platform?schema=public
REDIS_URL=redis://localhost:6379
```

Pasang dependency dan siapkan database.

```bash
corepack enable
pnpm install
pnpm db:generate
docker compose up -d postgres redis
pnpm db:migrate:deploy
pnpm db:seed
```

Jalankan service pada terminal terpisah.

```bash
pnpm --filter @mining/mining-worker dev
pnpm --filter @mining/api dev
pnpm --filter @mining/web dev
pnpm --filter @mining/stratum-server dev
```

Kirim satu share development yang valid.

```bash
pnpm smoke:stratum
```

Buka dashboard:

```text
http://localhost:3000/dashboard
```

Panduan lengkap tersedia di `docs/deployment/core-mining-smoke-test.md`.

## Pengujian Core

```bash
pnpm --filter @mining/mining-core test
pnpm --filter @mining/stratum-protocol test
```

Test mencakup compact target, nonce validation, duplicate share, stale job, hashrate window, request parsing, dan notification serialization.

## Peringatan Produksi

- Jangan aktifkan `STRATUM_DEV_MODE` pada production. Konfigurasi akan ditolak ketika `NODE_ENV=production`.
- Jangan mengarahkan ASIC produksi ke server alpha.
- `PAYOUTS_ENABLED` harus tetap `false`.
- Jangan simpan private key, seed phrase, atau kredensial wallet dalam repository, PostgreSQL aplikasi, Redis, atau file log.
- Endpoint monitoring user belum dilindungi autentikasi produksi. Endpoint snapshot saat ini hanya tersedia pada non-production.
- Redis Stream alpha belum memiliki pending recovery dan dead-letter processing.
- Event JSONL development bukan pengganti transactional outbox.

## Dokumen Acuan

1. `docs/adr/0001-core-mining-foundation.md`
2. `docs/releases/v0.2.0-definition-of-done.md`
3. `docs/releases/v0.2.0-alpha.1.md`
4. `docs/releases/v0.2.0-alpha.1-validation.md`
5. `docs/architecture/share-validation.md`
6. `docs/architecture/event-driven-core.md`
7. `docs/deployment/core-mining-smoke-test.md`
8. `docs/database/time-series-monitoring.md`
9. `docs/ui/landing-page-v1.md`
10. `docs/releases/landing-v1-validation.md`
