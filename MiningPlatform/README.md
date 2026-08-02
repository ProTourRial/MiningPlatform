# MiningPlatform

MiningPlatform adalah monorepo TypeScript untuk upstream mining gateway, worker management, monitoring, reward accounting foundation, double-entry ledger, dan control plane berbasis web.

Platform bukan cloud mining dan tidak menjual kontrak hashrate. Mining dilakukan oleh CPU, GPU, FPGA, ASIC, rig hybrid, atau perangkat fisik lain yang kompatibel dengan algoritma dan protokol aktif.

## Status rilis

```text
Version:      0.3.0
Release Name: Identity & Access
Schema:       7
Migration:    20260731190000_identity_access
```

Rilis ini menambahkan Control Plane untuk identitas pengguna, keamanan akun, sesi, worker, credential, RBAC, API key lifecycle, audit log, dan dashboard produksi dasar. Mining Plane alpha.6 tetap tersedia.

Rilis belum boleh digunakan untuk dana nyata. Reward settlement, wallet signing, dan payout tetap nonaktif.

## Kemampuan utama

### Identity & Account Security

- registrasi akun;
- verifikasi email;
- login dan logout;
- JWT access token;
- refresh-token rotation;
- session inventory dan revocation;
- forgot/reset/change password;
- TOTP 2FA;
- backup codes satu kali pakai;
- profile, locale, timezone, dan account type;
- permission-based RBAC;
- audit log.

### Worker Control Plane

- worker CRUD berbasis ownership;
- worker status dan statistik;
- universal hardware declaration;
- credential create, rotate, revoke, expire;
- one-time secret display;
- created-by dan last-used metadata;
- API key lifecycle management.

### Mining Plane

- downstream Stratum V1;
- worker authentication terpisah dari web password;
- SHA-256d share validation;
- upstream TCP/TLS;
- multi-upstream failover foundation;
- provider-scoped job lifecycle;
- durable outbox dan Redis event transport;
- hashrate windows 1m, 5m, 15m, 1h, 24h;
- CPU/GPU/FPGA/ASIC/HYBRID hardware profile.

## Pemisahan credential

```text
Web User
├── email + password
├── TOTP / backup codes
└── UserSession + JWT

Mining Worker
└── WorkerCredential
    ├── credential ID
    └── separate one-time secret
```

Web password tidak pernah dipakai untuk `mining.authorize`. Worker secret tidak dapat dipakai untuk login website.

## Struktur utama

```text
apps/
  web/                 Next.js landing page dan production dashboard foundation
  api/                 NestJS Identity, Users, Workers, Credentials, Audit, System
  stratum-server/      Downstream gateway dan upstream resilience
  upstream-simulator/  Local upstream simulator
  mining-worker/       Durable projection dan hashrate
  outbox-worker/       PostgreSQL outbox dispatcher
  scheduler/           Central periodic jobs
  monitoring-agent/    Universal inventory/telemetry foundation
  wallet-worker/       Disabled wallet boundary scaffold
packages/
  database/            Prisma schema, migration, seed, generated client
  security/            Password, JWT, TOTP, encryption, backup code, permission helpers
  shared/              Versioned event contracts
  mining-core/         Bitcoin header and share validation
  upstream-stratum/    Pool adapters, failover, queue, VarDiff foundation
  event-bus/           Redis Stream and in-memory transport
  ledger/              Double-entry invariants
  reward-engine/       FOLLOW_UPSTREAM foundation only
```

## Persyaratan

- Node.js 22.12 atau lebih baru;
- pnpm 10.13.1;
- PostgreSQL dan Redis untuk Control Plane runtime;
- Docker opsional untuk integration environment, belum wajib untuk review source/UI.

## Instalasi

```bash
cp .env.example .env
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm db:generate
```

Konfigurasi secret minimum:

```env
AUTH_JWT_SECRET=replace-with-at-least-32-random-characters
AUTH_ENCRYPTION_KEY=replace-with-32-byte-base64-or-64-hex-key
AUTH_BACKUP_CODE_PEPPER=replace-with-long-random-secret
SENSITIVE_VALUE_HMAC_KEY=replace-with-long-random-secret
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://mining:mining@localhost:5432/mining_platform
```

Development dapat menggunakan `IDENTITY_DELIVERY_MODE=console`. Production menolak adapter console dan secret default.

## Menjalankan website dan API

```bash
pnpm --filter @mining/api dev
pnpm --filter @mining/web dev
```

Buka:

```text
Website: http://localhost:3000
API:     http://localhost:4000/api/v1
Docs:    http://localhost:4000/docs
Version: http://localhost:4000/version
```

Route website utama:

```text
/register
/login
/verify-email
/forgot-password
/reset-password
/dashboard
/dashboard/workers
/dashboard/security
/dashboard/profile
/dashboard/api
/dashboard/audit
```

## API Control Plane

```text
/auth
/users
/workers
/credentials
/api-keys
/audit
/system
/version
```

Dokumentasi: `docs/api/identity-access.md`.

## Release verification

```bash
pnpm verify:v030:static
pnpm verify:v030
```

Verifikasi lengkap menjalankan frozen install, Prisma generation, typecheck, test, dan build.

Database kosong:

```bash
MIGRATION_TEST_ACK=v030-fresh-empty-database pnpm verify:migration:v030:fresh
```

Upgrade dari salinan alpha.6:

```bash
MIGRATION_TEST_ACK=alpha6-upgrade-copy pnpm verify:migration:v030:upgrade
```

## Security boundaries

- Refresh token, verification token, reset token, backup code, API key, dan worker secret tidak disimpan plaintext.
- TOTP secret dienkripsi AES-256-GCM.
- Session PostgreSQL tetap authoritative meskipun JWT valid secara kriptografis.
- Password reset/change mencabut session aktif.
- Refresh-token reuse mencabut session.
- Raw IP tidak dipersistenkan; sistem memakai HMAC identifier.
- Production auth rate limiting membutuhkan Redis dan gagal tertutup jika Redis tidak tersedia.
- RBAC tidak menggantikan ownership check.
- API key authentication belum aktif pada v0.3.0; baru lifecycle management.

## Known gaps

- Production email provider belum diimplementasikan.
- Prisma Client v0.3.0 dan migration harus diverifikasi pada environment yang memiliki Prisma engine sesuai platform.
- PostgreSQL/Redis integration test dan Docker verification masih wajib sebelum staging.
- Owner Operations UI belum lengkap.
- Shared upstream multiplexing dan provider-captured fixture masih pending.
- Reward settlement, balance projection, wallet orchestration, dan payout belum aktif.
- Load, soak, stress, dan chaos tests belum selesai.

## Dokumentasi utama

- `docs/adr/0009-identity-access-session-rbac.md`
- `docs/architecture/identity-access-v030.md`
- `docs/api/identity-access.md`
- `docs/events/catalog.md`
- `docs/releases/v0.3.0.md`
- `docs/releases/v0.3.0-upgrade.md`
- `docs/releases/v0.3.0-validation.md`
- `docs/ui/identity-access-review.html`

## Lisensi

Proprietary. Copyright © 2026 Abia Nugrahanto. All rights reserved.
