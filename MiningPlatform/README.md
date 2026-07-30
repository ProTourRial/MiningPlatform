# MiningPlatform

MiningPlatform adalah monorepo TypeScript untuk pengelolaan mining pool berbasis upstream gateway, validasi share, monitoring worker, akuntansi reward, double-entry ledger, wallet orchestration, payout, dan transparansi operasional.

Platform ini bukan cloud mining. Platform tidak menjual kontrak hashrate. Aktivitas mining berasal dari ASIC atau GPU fisik yang terhubung melalui Stratum.

## Status rilis

Versi saat ini: `0.2.0-alpha.2`

Rilis ini merupakan **development mining pipeline yang diperkeras**, bukan mining pool produksi. Landing page, Stratum development flow, local share validation, durable event intake, Redis Stream recovery, PostgreSQL projection, multi-window hashrate, dan dashboard development sudah tersedia.

Bagian berikut belum aktif:

- upstream Stratum connector nyata;
- job normalization dari upstream pool;
- upstream share submission dan response correlation;
- autentikasi pengguna produksi;
- reward settlement;
- ledger posting reward;
- Bitcoin wallet signing;
- payout nyata.

Jangan menghubungkan ASIC produksi atau dana nyata ke rilis ini.

## Pipeline alpha

```text
Stratum development miner
    ↓
mining.configure
    ↓
mining.subscribe
    ↓
mining.authorize
    ↓
mining.notify
    ↓
mining.submit
    ↓
local SHA-256d validation
    ↓
Redis duplicate reservation
    ↓
PostgreSQL durable outbox
    ↓
outbox dispatcher
    ↓
Redis Stream
    ↓
PostgreSQL projection
    ↓
1m / 5m / 15m / 1h / 24h hashrate
    ↓
authorized development WebSocket room
    ↓
Next.js development dashboard
```

## Baseline arsitektur

- Aset pertama: BTC
- Algoritma: SHA-256
- Model awal: upstream pool gateway
- Reward awal: `FOLLOW_UPSTREAM`
- Fee platform: 2%
- Hardware awal: ASIC
- Ledger: immutable double-entry journal
- Monitoring: Stratum dan agent opsional
- Role: Guest, User, Owner
- Deposit pengguna: tidak tersedia
- Event delivery: at-least-once
- Event durability: PostgreSQL outbox
- Duplicate reservation: Redis dengan PostgreSQL sebagai pertahanan lanjutan

Wallet tidak boleh mengubah saldo pengguna secara langsung. Perubahan saldo hanya boleh berasal dari journal entry yang valid dan seimbang.

## Struktur utama

```text
apps/
  web/                 Next.js landing page dan dashboard development
  api/                 NestJS REST API, health, metrics, dan WebSocket
  stratum-server/      TCP Stratum development gateway
  outbox-worker/       PostgreSQL outbox dispatcher ke Redis Stream
  mining-worker/       Event projection dan hashrate aggregation
  wallet-worker/       Boundary wallet, tetap nonaktif
  scheduler/           Central scheduler foundation
  monitoring-agent/    Optional telemetry agent foundation
packages/
  mining-core/         Bitcoin header, target, validation, duplicate, hashrate
  stratum-protocol/    Stratum parser dan serializer
  event-bus/           In-memory bus dan Redis Stream transport
  database/            Prisma schema, migrations, seed, dan client
  shared/              Event contracts dan domain types
  idempotency/         Idempotency contracts
  state-machine/       Finite state transition guard
  ledger/              Double-entry invariants
  reward-engine/       FOLLOW_UPSTREAM allocation foundation
```

## Persyaratan

- Node.js 22 direkomendasikan
- pnpm 10.13.1
- Docker dan Docker Compose untuk PostgreSQL serta Redis

## Instalasi pertama

```bash
cp .env.example .env
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install
```

Lingkungan pembuatan arsip ini tidak memiliki akses registry, sehingga `pnpm-lock.yaml` tidak dapat dihasilkan di sini. Seluruh dependency langsung sudah dipatok ke versi exact. Setelah instalasi pertama pada mesin yang memiliki akses registry, commit file berikut ke GitHub:

```bash
git add pnpm-lock.yaml
git commit -m "chore: lock dependencies"
```

Setelah lockfile tersedia, ubah CI dan Docker dari `--no-frozen-lockfile` menjadi `--frozen-lockfile`.

## Development dengan Docker

Pastikan seluruh nilai `change-me` pada `.env` diganti.

```bash
pnpm docker:up:dev
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

Service development tersedia pada:

```text
Landing page     http://localhost
Web langsung     http://localhost:3000
API              http://localhost:4000/api/v1
Swagger          http://localhost:4000/docs
Stratum          localhost:3333
Prometheus       http://localhost:9090
Grafana          http://localhost:3001
```

Dashboard development membutuhkan token dari `.env`. Dashboard dan endpoint development dipaksa nonaktif saat `NODE_ENV=production`.

## Development dari host

Jalankan database dan Redis:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
```

Sesuaikan `DATABASE_URL` dan `REDIS_URL` agar menunjuk ke `localhost`, lalu jalankan:

```bash
pnpm install
pnpm prepare:workspace
pnpm db:migrate:deploy
pnpm db:seed
```

Jalankan service pada terminal terpisah:

```bash
pnpm --filter @mining/outbox-worker dev
pnpm --filter @mining/mining-worker dev
pnpm --filter @mining/api dev
pnpm --filter @mining/web dev
pnpm --filter @mining/stratum-server dev
```

Kirim satu share development:

```bash
pnpm smoke:stratum
```

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pemeriksaan readiness:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
GET /api/v1/metrics
```

## Batas keamanan

- `STRATUM_DEV_MODE=true` ditolak saat production.
- Production Stratum mewajibkan PostgreSQL event store dan Redis duplicate reservation.
- Dashboard development dan WebSocket development ditolak saat production.
- Wallet worker berada di Docker profile terpisah dan `PAYOUTS_ENABLED=false`.
- Database, Redis, MinIO, Prometheus, dan Grafana tidak dipublikasikan pada compose utama.
- Private key, seed phrase, dan credential wallet tidak boleh disimpan dalam repository, database aplikasi, Redis, atau log.
- Satu file `.env` tidak diteruskan secara penuh ke seluruh container. Setiap service hanya menerima variable yang diperlukan.

## Blocker sebelum upstream staging

1. Fixture Stratum nyata dan validasi byte order.
2. Upstream session state machine.
3. Multi-job registry dan `clean_jobs` invalidation.
4. Job normalization.
5. Upstream submit dan response correlation.
6. PostgreSQL dan Redis integration tests.
7. Load test serta soak test.
8. Production worker authentication dan tenant isolation.

## Dokumen utama

- `docs/adr/0001-core-mining-foundation.md`
- `docs/architecture/hardening-alpha-2.md`
- `docs/architecture/share-validation.md`
- `docs/architecture/event-driven-core.md`
- `docs/database/time-series-monitoring.md`
- `docs/releases/v0.2.0-alpha.2-validation.md`
- `docs/releases/v0.2.0-definition-of-done.md`
- `docs/ui/landing-page-v1.md`
