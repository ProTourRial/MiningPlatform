# MiningPlatform

MiningPlatform adalah monorepo TypeScript untuk pengelolaan mining pool berbasis upstream gateway, validasi share, monitoring worker, akuntansi reward, double-entry ledger, wallet orchestration, payout, dan transparansi operasional.

Platform ini bukan cloud mining. Platform tidak menjual kontrak hashrate. Aktivitas mining berasal dari ASIC, GPU, CPU, FPGA, rig hybrid, atau perangkat fisik lain yang terhubung melalui Stratum.

## Status rilis

Versi saat ini: `0.2.0-alpha.4`

Rilis ini merupakan **upstream gateway development alpha**, bukan mining pool produksi. Landing page, Stratum downstream server, upstream TCP/TLS client, local upstream simulator, job normalization, multi-job registry, local share validation, upstream response correlation, durable event foundation, multi-window hashrate, dan dashboard development sudah tersedia.

Bagian berikut belum aktif atau belum tervalidasi untuk produksi:

- fixture tangkapan dari upstream pool yang benar-benar dipilih;
- transparent reconnect setelah koneksi upstream aktif terputus;
- production worker authentication dan tenant isolation penuh;
- PostgreSQL dan Redis integration test pada lingkungan Docker;
- reward settlement;
- ledger posting reward;
- Bitcoin wallet signing;
- payout nyata.

Jangan menghubungkan perangkat mining produksi atau dana nyata ke rilis ini.

## Pipeline alpha

```text
Downstream test miner
    ↓
MiningPlatform Stratum gateway
    ↓
mining.subscribe / mining.authorize
    ↓
Upstream Stratum simulator melalui TCP
    ↓
mining.set_difficulty / mining.set_extranonce / mining.notify
    ↓
job normalization dan multi-job registry
    ↓
downstream mining.submit
    ↓
local SHA-256d validation
    ↓
UPSTREAM_PENDING
    ↓
upstream mining.submit dan response correlation
    ↓
UPSTREAM_ACCEPTED atau UPSTREAM_REJECTED
    ↓
event projection dan hashrate foundation
```

## Baseline arsitektur

- Aset pertama: BTC
- Algoritma: SHA-256
- Model awal: upstream pool gateway
- Reward awal: `FOLLOW_UPSTREAM`
- Fee platform: 2%
- Hardware: CPU, GPU, FPGA, ASIC, HYBRID, OTHER, dan UNKNOWN
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
  stratum-server/      TCP Stratum gateway dan upstream decision flow
  upstream-simulator/  Local Stratum V1 upstream simulator
  outbox-worker/       PostgreSQL outbox dispatcher ke Redis Stream
  mining-worker/       Event projection dan hashrate aggregation
  wallet-worker/       Boundary wallet, tetap nonaktif
  scheduler/           Central scheduler foundation
  monitoring-agent/    Universal inventory dan telemetry agent foundation
packages/
  miner-detection/     Evidence-based CPU/GPU/FPGA/ASIC/hybrid detection
  mining-core/         Bitcoin header, target, validation, duplicate, hashrate
  stratum-protocol/    Downstream dan upstream Stratum codec
  upstream-stratum/    Upstream client, state machine, job registry, simulator
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
- Docker dan Docker Compose hanya diperlukan untuk integration test PostgreSQL/Redis dan staging

## Instalasi pertama

```bash
cp .env.example .env
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm db:generate
```

`pnpm-lock.yaml` sudah tersedia dan seluruh importer workspace telah disinkronkan. CI serta Docker menggunakan lockfile sebagai sumber dependency yang reproducible.


## Review website tanpa Docker

Review visual universal worker dapat dibuka langsung tanpa Node.js atau Docker:

```text
docs/ui/universal-miner-review.html
```

Untuk meninjau aplikasi Next.js:

```bash
pnpm --filter @mining/web dev
```

Buka `http://localhost:3000`, lalu lihat landing page dan route `/dashboard/workers`. Dashboard development tetap dibatasi untuk lingkungan non-production.

## Universal miner detection

- Jenis hardware: CPU, GPU, FPGA, ASIC, HYBRID, OTHER, dan UNKNOWN.
- Sumber deteksi: deklarasi user, signature `mining.subscribe`, monitoring agent, dan miner API.
- Hasil menyimpan confidence, possible types, evidence, software, vendor, model, OS, jumlah perangkat, dan kemampuan algoritma.
- Signature ambigu seperti XMRig, CGMiner, dan BFGMiner tidak dianggap sebagai bukti satu tipe hardware.
- Pipeline share aktif masih BTC/SHA-256. Universal hardware tidak berarti semua algoritma telah diimplementasikan.

## Upstream gateway lokal tanpa Docker

Tahap codec, simulator, state machine, registry, dan TCP gateway dapat dijalankan tanpa PostgreSQL atau Redis.

Terminal pertama:

```bash
pnpm --filter @mining/upstream-simulator dev
```

Terminal kedua:

```bash
STRATUM_DEV_MODE=true \
EVENT_BUS_DRIVER=memory \
EVENT_STORE_DRIVER=jsonl \
UPSTREAM_DRIVER=tcp \
UPSTREAM_HOST=127.0.0.1 \
UPSTREAM_PORT=3334 \
pnpm --filter @mining/stratum-server dev
```

Jalankan pengujian upstream:

```bash
pnpm test:upstream
```

Mode `UPSTREAM_DRIVER=development` tetap tersedia untuk job lokal lama. Mode `tcp` memakai satu koneksi upstream per downstream session pada alpha ini. Desain tersebut memudahkan verifikasi protokol, tetapi belum menjadi model scaling final.

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

1. Tambahkan fixture tangkapan dan expected hash dari upstream pool yang dipilih.
2. Uji TLS, authorization policy, dan error code khusus provider tersebut.
3. Implementasikan transparent reconnect atau explicit failover policy setelah sesi aktif terputus.
4. Ganti development worker authenticator dengan PostgreSQL-backed authenticator.
5. Jalankan PostgreSQL dan Redis integration tests.
6. Jalankan load test serta soak test.
7. Audit isolation untuk banyak user, banyak worker, dan banyak replica.
8. Production worker authentication dan tenant isolation.

## Dokumen utama

- `docs/adr/0001-core-mining-foundation.md`
- `docs/architecture/upstream-stratum-alpha-3.md`
- `docs/architecture/hardening-alpha-2.md`
- `docs/architecture/share-validation.md`
- `docs/architecture/event-driven-core.md`
- `docs/database/time-series-monitoring.md`
- `docs/releases/v0.2.0-alpha.4.md`
- `docs/releases/v0.2.0-alpha.4-validation.md`
- `docs/releases/v0.2.0-definition-of-done.md`
- `docs/ui/landing-page-v1.md`

## Universal Miner Detection

Worker dapat mewakili CPU, GPU, FPGA, ASIC, rig hybrid, atau hardware lain. Deteksi menggunakan user-agent Stratum, deklarasi user, monitoring agent, dan miner API dengan confidence level yang eksplisit. Pipeline share aktif tetap BTC/SHA-256.
