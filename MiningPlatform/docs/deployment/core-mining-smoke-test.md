# Core Mining Smoke Test

Dokumen ini menjalankan pipeline development. Jangan gunakan konfigurasi ini pada server publik.

## Environment

Salin `.env.example` menjadi `.env`, lalu gunakan nilai berikut untuk pengembangan lokal:

```dotenv
NODE_ENV=development
STRATUM_DEV_MODE=true
STRATUM_DEV_WORKER=demo.worker1
STRATUM_DEV_PASSWORD=x
STRATUM_DEV_DIFFICULTY=0.000001
SEED_DEVELOPMENT_DATA=true
EVENT_BUS_DRIVER=redis
EVENT_STREAM=mining:domain-events
PAYOUTS_ENABLED=false
```

Saat perintah aplikasi dijalankan dari host, ubah host PostgreSQL dan Redis dari nama service Docker menjadi `localhost`.

```dotenv
DATABASE_URL=postgresql://mining:change-me@localhost:5432/mining_platform?schema=public
REDIS_URL=redis://localhost:6379
```

## Persiapan

```bash
corepack enable
pnpm install
pnpm db:generate
docker compose up -d postgres redis
pnpm --filter @mining/database migrate:deploy
pnpm db:seed
```

## Jalankan Service

Gunakan terminal terpisah.

```bash
pnpm --filter @mining/mining-worker dev
pnpm --filter @mining/api dev
pnpm --filter @mining/web dev
pnpm --filter @mining/stratum-server dev
```

## Kirim Share

```bash
pnpm smoke:stratum
```

Output berhasil:

```json
{
  "status": "ok",
  "workerName": "demo.worker1",
  "jobId": "dev-...",
  "difficulty": "0.000001",
  "nonce": "..."
}
```

## Verifikasi

- File `data/stratum/mining-events.jsonl` berisi session, job, dan share event.
- Tabel `MinerSession`, `StratumJob`, `Share`, `ShareFingerprint`, dan `HashrateSnapshot` memiliki record baru.
- Dashboard `http://localhost:3000/dashboard` menampilkan worker online dan hashrate.
- WebSocket namespace tersedia pada `http://localhost:4000/mining`.

## Kegagalan Umum

- Authorization gagal jika `STRATUM_DEV_MODE` tidak aktif atau kredensial berbeda.
- Projection gagal jika development worker belum dibuat oleh seed.
- Dashboard tidak berubah jika mining worker, API, atau Redis tidak berjalan.
- `DATABASE_URL` dengan host `postgres` hanya bekerja dari dalam jaringan Docker.
