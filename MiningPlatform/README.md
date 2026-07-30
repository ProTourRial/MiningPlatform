# MiningPlatform

MiningPlatform adalah monorepo untuk Mining Pool Management Platform. Sistem mengelola koneksi worker, share, hashrate, reward, internal ledger, payout, monitoring farm, simulator, dan transparansi publik.

Platform ini bukan cloud mining dan tidak menjual kontrak hashrate. Mining dilakukan oleh ASIC atau GPU fisik melalui protokol Stratum.

## Baseline MVP

- Aset: BTC
- Algoritma: SHA-256
- Model: upstream pool gateway
- Reward: `FOLLOW_UPSTREAM`
- Fee platform: 2%
- Payout: harian
- Hardware: ASIC
- Ledger: double-entry immutable journal
- Monitoring: Stratum dan agent opsional
- Role: Guest, User, Owner
- Deposit pengguna: tidak tersedia pada MVP

## Struktur

```text
apps/
  web/                 Next.js dashboard dan landing page
  api/                 NestJS REST API
  stratum-server/      TCP Stratum gateway
  mining-worker/       Share aggregation dan reward jobs
  wallet-worker/       Payout dan wallet jobs
  scheduler/           Scheduled reconciliation jobs
  monitoring-agent/    Agent opsional untuk telemetri miner
packages/
  database/            Prisma schema dan client
  shared/              Type, constant, dan event contract
  ledger/              Aturan double-entry ledger
  reward-engine/       Kontrak perhitungan reward
  blockchain-adapters/ Adapter blockchain
  stratum-protocol/    Type dan parser Stratum
  config/              Validasi konfigurasi
  logger/              Structured logging
  security/            Utility keamanan
  validation/          Schema validasi bersama
infrastructure/
  docker/ nginx/ postgres/ monitoring/ blockchain-nodes/ backups/
docs/
  architecture/ adr/ api/ database/ security/ flowcharts/ erd/ deployment/ operations/
```

## Menjalankan Lokal

1. Pasang Node.js 20.9 atau lebih baru dan pnpm 10.
2. Salin environment file.

```bash
cp .env.example .env
```

3. Ganti seluruh nilai rahasia pada `.env`.
4. Pasang dependency dan buat Prisma Client.

```bash
pnpm install
pnpm db:generate
```

5. Jalankan PostgreSQL, Redis, dan MinIO.

```bash
docker compose up -d postgres redis minio
```

6. Jalankan migrasi dan seed.

```bash
pnpm db:migrate
pnpm db:seed
```

7. Jalankan aplikasi.

```bash
pnpm dev
```

Web: `http://localhost:3000`  
API: `http://localhost:4000/api/v1`  
Swagger: `http://localhost:4000/docs`

## Peringatan Produksi

- `PAYOUTS_ENABLED` harus tetap `false` sampai wallet RPC, rekonsiliasi, idempotency, approval, dan audit diuji.
- Jangan simpan private key atau seed phrase dalam repository, database aplikasi, atau environment biasa.
- Owner wajib memakai 2FA, VPN, IP allowlist, dan step-up authentication.
- Redis bukan sumber kebenaran untuk saldo. PostgreSQL journal menjadi sumber kebenaran.
- Stratum gateway pada fase ini masih skeleton. Jangan mengarahkannya ke miner produksi sebelum validator dan upstream relay selesai.

## Dokumen Acuan

Mulai dari `docs/architecture/system-interpretation-v1.md` dan `docs/architecture/mvp-boundary.md`.
