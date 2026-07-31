# MiningPlatform

MiningPlatform adalah monorepo TypeScript untuk pengelolaan mining pool berbasis upstream gateway, validasi share, monitoring worker, akuntansi reward, double-entry ledger, wallet orchestration, payout, dan transparansi operasional.

Platform ini bukan cloud mining. Platform tidak menjual kontrak hashrate. Aktivitas mining berasal dari ASIC, GPU, CPU, FPGA, rig hybrid, atau perangkat fisik lain yang terhubung melalui Stratum.

## Status rilis

Versi saat ini: `0.2.0-alpha.6`

Rilis ini merupakan **upstream gateway development alpha**, bukan mining pool produksi. Landing page, Stratum downstream server, upstream TCP/TLS client, local upstream simulator, job normalization, multi-job registry, local share validation, upstream response correlation, durable event foundation, multi-window hashrate, dan dashboard development sudah tersedia.

Bagian berikut belum aktif atau belum tervalidasi untuk produksi:

- fixture tangkapan dari upstream pool yang benar-benar dipilih;
- transparent reconnect setelah koneksi upstream aktif terputus;
- PostgreSQL/Redis integration verification untuk production worker authentication;
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
  stratum-server/      TCP Stratum gateway, worker authentication, dan upstream decision flow
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
  security/            HMAC, token, dan scrypt worker credential helpers
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
STRATUM_AUTH_DRIVER=development \
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

## Production worker authentication foundation

Stratum production menggunakan credential worker terpisah dari password akun website.

```bash
pnpm worker:credential create demo.worker1
pnpm worker:credential rotate demo.worker1
pnpm worker:credential revoke wc_exampleCredentialId
```

Konfigurasi production foundation:

```env
STRATUM_DEV_MODE=false
STRATUM_AUTH_DRIVER=postgres
STRATUM_AUTH_MAX_FAILURES=5
STRATUM_AUTH_WINDOW_MS=60000
STRATUM_AUTH_LOCK_MS=900000
EVENT_STORE_DRIVER=postgres
EVENT_BUS_DRIVER=redis
```

Secret dibuat dengan entropy tinggi, hanya ditampilkan sekali, dan disimpan sebagai versioned scrypt hash. Authentication success/failure dicatat pada audit log tanpa raw IP atau plaintext password. Detail: `docs/security/worker-credential-management.md`.

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

- `STRATUM_DEV_MODE=true` dan `STRATUM_AUTH_DRIVER=development` ditolak saat production.
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
4. Jalankan PostgreSQL dan Redis integration tests untuk production authenticator dan event pipeline.
5. Tambahkan fixture credential rotation/revocation pada integration test.
6. Jalankan load test serta soak test.
7. Audit isolation untuk banyak user, banyak worker, dan banyak replica.
8. Implementasikan Control Plane API untuk credential management dan tenant authorization.

## Dokumen utama

- `docs/adr/0001-core-mining-foundation.md`
- `docs/architecture/domain-architecture.md`
- `docs/architecture/bounded-contexts.md`
- `docs/events/catalog.md`
- `docs/adr/README.md`
- `docs/architecture/upstream-stratum-alpha-3.md`
- `docs/architecture/hardening-alpha-2.md`
- `docs/architecture/share-validation.md`
- `docs/architecture/event-driven-core.md`
- `docs/database/time-series-monitoring.md`
- `docs/releases/v0.2.0-alpha.5.md`
- `docs/releases/v0.2.0-alpha.5-validation.md`
- `docs/releases/v0.2.0-definition-of-done.md`
- `docs/ui/landing-page-v1.md`

## Universal Miner Detection

Worker dapat mewakili CPU, GPU, FPGA, ASIC, rig hybrid, atau hardware lain. Deteksi menggunakan user-agent Stratum, deklarasi user, monitoring agent, dan miner API dengan confidence level yang eksplisit. Pipeline share aktif tetap BTC/SHA-256.

## Upgrade alpha.4 ke alpha.5

Untuk upgrade incremental, ekstrak paket patch di atas folder alpha.4 lalu jalankan:

```bash
bash apply-patch.sh
```

Windows PowerShell:

```powershell
./apply-patch.ps1
```

Setelah itu jalankan verifikasi pada lingkungan yang memiliki pnpm dan Prisma engine yang sesuai:

```bash
pnpm verify:alpha5
```

Verifikasi migrasi database kosong dan salinan database alpha.4 dijelaskan dalam `docs/releases/v0.2.0-alpha.5-upgrade.md`. Jangan menjalankan pemeriksaan migrasi terhadap satu-satunya salinan database penting.


## Upgrade alpha.5 ke alpha.6

Ekstrak patch incremental di atas folder alpha.5, lalu jalankan `bash apply-patch.sh` atau `.\apply-patch.ps1`. Verifikasi target environment dengan:

```bash
pnpm verify:alpha6
```

Prosedur database kosong dan upgrade salinan alpha.5 tersedia di `docs/releases/v0.2.0-alpha.6-upgrade.md`.

## Release and build diagnostics

The repository includes `release-manifest.json` for automated upgrade and CI checks. It records the release version, schema version, migration, alpha.5 compatibility, build date, git commit, and payload checksums.

Every Node service binary supports machine-readable version output without initializing PostgreSQL or Redis:

```bash
pnpm --filter @mining/stratum-server start -- --version
pnpm --filter @mining/mining-worker start -- --version
pnpm --filter @mining/api start -- --version
```

The API also exposes:

```text
GET /version
```

Worker credential inventory can be reviewed without exposing credential secrets:

```bash
pnpm worker:credential list demo.worker1
```


## Upstream resilience alpha.6

The local gateway now supports a session-scoped pool adapter registry with primary/backup selection, circuit breaker, recovery backoff with jitter, provider-scoped jobs, bounded share submission, and a conservative VarDiff foundation.

```env
UPSTREAM_DRIVER=multi
UPSTREAM_POOLS_JSON=[{"key":"primary","host":"127.0.0.1","port":3334,"tls":false,"username":"gateway.worker","password":"x","priority":0,"weight":100}]
STRATUM_VARDIFF_ENABLED=false
```

Static review: `docs/ui/upstream-resilience-review.html`. Architecture: `docs/architecture/upstream-resilience-alpha-6.md`.

Alpha.6 remains an internal protocol release. Provider fixtures, Prisma/database integration, distributed health, shared upstream multiplexing, load testing, and Docker verification remain release blockers.
