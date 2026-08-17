# MiningPlatform Development Master Plan

Tanggal baseline: 18 Agustus 2026 (Asia/Jakarta)

Status: dokumen perencanaan aktif untuk developer.

Checkpoint implementasi: `v0.3.0-alpha.2 + Unreleased HEAD` pada branch `main`, dengan HEAD yang diaudit `c08296254571c5e37beed9e65687007000cb6a0d`.

Dokumen ini harus dibaca bersama:

- `docs/CURRENT_STATUS.md`
- `docs/roadmap.md`
- `CHANGELOG.md`
- `docs/architecture/*`
- `docs/adr/*`
- `docs/events/catalog.md`

## 1. Tujuan Produk

MiningPlatform dibangun sebagai **Mining Pool Management Platform**, bukan cloud-mining marketplace dan bukan penjualan kontrak investasi hashrate.

Sumber aktivitas adalah perangkat mining fisik pengguna:

```text
ASIC / GPU / CPU / FPGA / Hybrid
        ↓
MiningPlatform Stratum Gateway
        ↓
Local Share Validation
        ↓
Selected Upstream Pool(s)
        ↓
Accepted / Rejected Upstream Result
        ↓
Event + Projection + Hashrate
        ↓
Reward Accounting
        ↓
Ledger
        ↓
Secure Payout (future gated milestone)
```

Website/Control Plane berfungsi untuk:

- identity dan access;
- worker/credential management;
- mining monitoring;
- operational dashboard;
- reward/accounting visibility;
- payout/wallet operation hanya setelah gate finansial terpenuhi;
- notifications, audit, support, dan owner operations.

## 2. Prinsip Arsitektur yang Tidak Boleh Dilanggar

1. **Server accepted work authoritative** untuk contribution/reward. Telemetry lokal bukan bukti finansial.
2. **Ledger authoritative untuk balance.** Tidak ada service lain yang boleh mengubah user balance langsung.
3. **Financial mutation harus idempotent, auditable, reversible melalui reversal, dan reconciliable.**
4. **Wallet/signing terpisah dari application/control plane.** Private key tidak boleh berada di source repo, Redis, application DB, atau log.
5. **At-least-once event delivery berarti consumer wajib idempotent.**
6. **Production dan development boundary harus eksplisit.** Development auth/debug tidak boleh otomatis aktif di production.
7. **Worker credential terpisah dari account password.**
8. **Release readiness harus dibuktikan dengan evidence**, bukan karena UI terlihat selesai.
9. **Historical release docs dipertahankan sebagai audit trail**, tetapi current status hanya berasal dari current-status/roadmap/changelog/CI terkini.
10. **Payout tetap OFF sampai ledger, signer isolation, approval, reconciliation, legal/compliance, dan runbook lolos gate.**

## 3. Pencapaian Current HEAD

### 3.1 Mining Plane

Sudah tersedia:

- Bitcoin block header reconstruction;
- double SHA-256;
- compact target decoding;
- share target/difficulty calculation;
- achieved difficulty;
- Stratum V1 parsing;
- subscribe/authorize/notify/submit lifecycle;
- stale/duplicate/malformed/unauthorized/unknown-job/low-difficulty validation;
- Stratum upstream TCP client/simulator;
- request-response correlation;
- difficulty/extranonce/notify handling;
- provider-scoped job registry;
- multi-upstream registry;
- priority/weight selection;
- circuit breaker;
- recovery backoff+jitter;
- bounded share queue;
- explicit backpressure;
- upstream accepted/rejected lifecycle;
- conservative VarDiff foundation;
- production worker credential authentication.

### 3.2 Event and Monitoring Plane

Sudah tersedia:

- PostgreSQL transactional outbox;
- Redis Stream transport;
- pending recovery;
- retry tracking;
- malformed-event isolation;
- dead-letter foundation;
- duplicate reservation;
- idempotency contract;
- mining projection;
- rolling hashrate windows;
- authenticated WebSocket worker rooms;
- health/readiness/Prometheus endpoints;
- monitoring-agent foundation.

### 3.3 Control Plane

Sudah tersedia:

- registration;
- email verification;
- login/logout;
- password reset;
- access-token sessions;
- rotating refresh token;
- persistent token-family history;
- refresh replay detection;
- family-wide revocation;
- TOTP 2FA;
- RBAC USER/ADMIN/OWNER;
- profile;
- active-session management;
- scoped API keys;
- Worker CRUD;
- worker credential create/rotate/revoke;
- notification inbox;
- encrypted channel registry;
- transactional identity-email delivery melalui Resend adapter;
- database snapshot/restore tooling;
- disabled support-address registry tanpa user balance crediting.

### 3.4 Control Plane Frontend v1

Unreleased HEAD sudah menambahkan:

- responsive dashboard/navigation;
- authenticated operational surfaces;
- Worker management UI;
- hashrate insights;
- gated Rewards/Wallet surfaces;
- Bitcoin reward context feed;
- `/control-plane-preview` untuk deployment review;
- production same-origin API default.

## 4. Evidence yang Sudah Hijau

CI utama pada HEAD audit berhasil menjalankan:

- frozen-lockfile install;
- Prisma generation;
- database migration deploy;
- static alpha.2 assertions;
- payment-address validation;
- lint;
- typecheck;
- tests;
- build;
- release-manifest verification;
- fresh migration;
- upgrade migration.

Developer tidak boleh lagi menggunakan pernyataan lama bahwa seluruh pnpm/Prisma/PostgreSQL/Redis path belum pernah tervalidasi.

## 5. Blocker Sebelum Release Candidate v0.3 Berikutnya

### P0 — Docker E2E

Workflow tersedia tetapi belum menjadi evidence pada main.

Acceptance:

- compose config valid;
- PostgreSQL + Redis healthy;
- migrations deploy;
- API/web/nginx build and start;
- readiness endpoint hijau;
- public `/version` berhasil;
- wallet status boundary tetap menunjukkan payout tidak aktif;
- environment dibersihkan setelah run.

### P0 — Browser E2E Control Plane

Minimal scenario:

1. register;
2. verify email;
3. login;
4. refresh token rotation;
5. refresh replay simulation dan revocation;
6. logout;
7. password reset dan session revocation;
8. enable/verify TOTP;
9. Worker create/rename/delete;
10. credential create/rotate/revoke;
11. authenticated dashboard load;
12. realtime worker authorization;
13. role boundary USER vs ADMIN/OWNER.

### P0 — Selected Upstream Compatibility

Jangan hanya mengandalkan simulator.

Harus ada versioned fixture untuk upstream kandidat produksi:

- TCP/TLS connection;
- subscribe;
- authorize;
- set_difficulty;
- set_extranonce;
- notify;
- submit accepted;
- submit rejected;
- provider error codes;
- disconnect/reconnect;
- primary -> backup failover;
- stale job after clean_jobs;
- timeout;
- malformed/provider-edge behavior;
- long-session soak.

### P0 — Public Edge Hardening

- public TLS automation;
- reverse-proxy request/body/connection limits;
- distributed API rate limiting;
- IP abuse/reputation strategy;
- managed DDoS plan;
- production secret store/rotation;
- secure headers/CORS/cookie review;
- WebSocket connection/rate limits;
- audit/log privacy review.

### P1 — Notification Completion

- Telegram adapter;
- Discord adapter;
- signed webhook delivery;
- verification handshake/channel ownership;
- retry/dead-letter behavior;
- provider idempotency;
- production Resend domain/sender provisioning.

### P1 — Performance and Reliability Evidence

- Stratum load;
- API load;
- Redis Stream projection throughput;
- WebSocket fanout;
- backpressure and queue saturation;
- slow upstream;
- upstream disconnect under load;
- Redis restart/recovery;
- PostgreSQL restart/recovery;
- long-running resource/leak observation;
- baseline SLO/SLI capture.

## 6. v0.4 — Ledger and Settlement

Tujuan milestone ini adalah mengubah reward foundation menjadi accounting yang dapat dipercaya **tanpa langsung mengaktifkan payout**.

### 6.1 Accounting Sources

Setiap accounting mutation harus dapat menunjuk ke source:

- worker/share contribution;
- upstream accepted work;
- reward period/provider statement;
- platform fee;
- provider fee;
- adjustment/reversal;
- later payout reservation/settlement.

### 6.2 Journal Rules

- immutable journal entry;
- balanced debit/credit;
- asset consistency;
- no negative amount;
- one deterministic business reference;
- idempotency key;
- reversal instead of destructive mutation;
- append-only audit semantics.

### 6.3 Reward Lifecycle

Target lifecycle:

```text
ContributionObserved
        ↓
RewardPeriodOpen
        ↓
UpstreamRewardObserved
        ↓
AllocationCalculated
        ↓
JournalPosted
        ↓
BalanceProjectionUpdated
        ↓
Reconciled
        ↓
PeriodClosed
```

Failure/review states harus eksplisit.

### 6.4 Reconciliation

Reconciliation minimal:

- internal share/contribution source;
- upstream/provider reward statement;
- provider fees;
- platform fee;
- total user liabilities;
- journal balance;
- unresolved difference bucket;
- manual adjustment/reversal dengan audit reference.

### 6.5 Gate v0.4

Milestone belum selesai bila:

- consumer retry dapat double-credit;
- balance dapat dimutasi tanpa journal;
- reward tidak dapat direplay;
- provider total tidak dapat direkonsiliasi;
- reversal menghapus sejarah;
- decimal/rounding rule tidak deterministic.

## 7. v0.5 — Wallet and Secure Payout

Wallet baru dibangun setelah settlement dipercaya.

### 7.1 Wallet Boundary

Pisahkan:

```text
Control Plane / API
        ↓
Payout Orchestrator
        ↓
Signer Boundary
        ↓
Blockchain / Node / Provider
```

Signer tidak boleh menjadi generic API service.

### 7.2 Payout Lifecycle

```text
eligible
  ↓
requested / scheduled
  ↓
policy_check
  ↓
balance_reserved
  ↓
approval
  ↓
batch_build
  ↓
sign
  ↓
broadcast
  ↓
confirming
  ↓
confirmed
  ↓
ledger_settlement
```

Failure states:

- policy_hold;
- compliance_hold;
- invalid_address;
- insufficient_network_fee;
- signer_unavailable;
- broadcast_failed;
- reorg_detected;
- manual_review;
- cancelled.

### 7.3 Security Requirements

- address format/network validation;
- memo/tag validation;
- step-up auth;
- cooldown after address change;
- allowlist option;
- velocity/risk limits;
- idempotent payout request;
- balance reservation;
- signer isolation;
- hot-wallet exposure limit;
- broadcast reconciliation;
- immutable audit trail.

## 8. MiningPlatform Agent Strategy

Agent adalah future differentiator, tetapi harus tetap ringan dan trustworthy.

### 8.1 Core Principle

Pisahkan:

```text
Clean Monitoring Core
        +
Optional Desktop UI
        +
Optional Miner Supervisor
```

`monitoring-agent` tidak boleh berubah menjadi executable serba bisa yang memegang wallet, shell, miner download, payout, dan telemetry sekaligus.

### 8.2 Lightweight Goal

Target engineering:

- idle CPU mendekati nol;
- bounded RAM;
- adaptive telemetry interval;
- bounded logs/cache;
- UI tidak perlu hidup 24/7;
- headless operation first-class;
- no bundled Chromium jika lightweight native/webview architecture dipilih;
- no unnecessary admin privilege.

### 8.3 Agent Trust Boundary

Agent dipercaya untuk:

- hardware inventory;
- telemetry;
- local miner status;
- configuration UX;
- health monitoring.

Agent **tidak dipercaya** untuk menentukan:

- accepted share;
- reward;
- ledger;
- user balance;
- payout.

### 8.4 Miner Adapter Model

Target universal interface:

```text
MinerAdapter
  detect
  validate
  buildConfig
  start / stop / pause / resume (optional supervisor)
  getHashrate
  getShares
  getTemperature
  getPower
  getFans
  getMemory
  getErrors
  healthCheck
```

Normalized output:

```text
MinerTelemetry
  hashrate
  acceptedShares
  rejectedShares
  staleShares
  temperature
  power
  fan
  memory
  uptime
  efficiency
  health
```

### 8.5 Port Strategy

User boleh memiliki banyak **pilihan** port, tetapi jangan membuka banyak listener tanpa kebutuhan.

Default:

- auto-select available port;
- local miner API bind ke `127.0.0.1`/loopback;
- TLS endpoint preferred bila tersedia;
- region/latency aware endpoint selection;
- port collision detection/fallback;
- advanced manual override.

Agent IPC sebaiknya memakai local IPC/named-pipe/Unix socket bila memungkinkan daripada membuka network listener.

### 8.6 Antivirus/Trust Strategy

Tidak ada jaminan miner tidak pernah dideteksi sebagai PUA.

Karena itu keunggulan MiningPlatform harus berasal dari:

- transparent consent;
- code signing;
- published hashes;
- clean core yang tidak membundel miner secara wajib;
- optional BYOM/verified miner registry;
- no antivirus evasion;
- no silent Defender exclusion;
- no hidden mining;
- no arbitrary remote shell;
- no self-modifying executable;
- signed update manifest;
- rollback-capable updater.

## 9. Asia-First Strategy

Asia-first bukan sekadar localization.

Target infrastructure:

- regional Stratum endpoints;
- regional API/WebSocket edge;
- latency-aware selection;
- regional CDN/download mirror;
- TLS compatibility endpoint;
- fallback endpoint;
- region health visibility.

Jurisdiction-aware feature flags diperlukan untuk financial features.

Default bila legal status belum direview:

- mining monitoring boleh dinilai terpisah;
- conversion/custody/payout feature tetap disabled sampai legal review selesai.

## 10. Security Model

### Identity

- password hashing yang versioned;
- rotating sessions;
- refresh replay revocation;
- 2FA;
- step-up auth untuk sensitive changes;
- session inventory/revocation;
- scoped API keys;
- audit event untuk mutations.

### Worker

- independent worker credential;
- show secret once;
- hashed at rest;
- rotation/revocation/expiry/lock;
- rate limiting;
- no plaintext credential logging.

### Infrastructure

- least privilege per service;
- private database/Redis where possible;
- service-specific environment variables;
- no shared all-secrets `.env` injection;
- secret rotation;
- release hashes/manifest;
- dependency lockfile;
- CI validation;
- future SBOM/code-signing/reproducibility improvements.

## 11. Observability

Minimum production observability:

- API health/readiness;
- Stratum sessions;
- authorization failures;
- share accepted/rejected/stale/duplicate;
- upstream state/failover;
- queue depth/backpressure;
- event outbox lag;
- Redis Stream pending/dead-letter;
- projection lag;
- WebSocket connections;
- reward reconciliation drift;
- payout state when milestone enabled;
- signer health when milestone enabled.

Alert harus actionable dan memiliki owner/runbook.

## 12. Release Governance

Setiap release candidate harus memiliki:

- versioned release notes;
- migration path;
- fresh migration evidence;
- upgrade migration evidence;
- rollback/restore procedure;
- CI evidence;
- release manifest/checksum;
- known limitations;
- security boundary statement;
- explicit list fitur disabled/gated;
- incident/rollback contact/runbook untuk staging/production.

## 13. Developer Notes — Wajib Dibaca

1. Jangan mengaktifkan wallet/payout hanya karena model database sudah ada.
2. Jangan menjadikan telemetry Agent sebagai accounting source.
3. Jangan menulis balance langsung dari reward-engine atau wallet-worker.
4. Jangan menggunakan float untuk nilai finansial/difficulty yang memerlukan exactness tanpa explicit rule.
5. Jangan menelan upstream error dan menganggap share accepted sebelum authoritative response.
6. Jangan menghapus journal history untuk memperbaiki saldo; gunakan reversal/adjustment.
7. Jangan menambahkan generic remote-shell command ke Agent.
8. Jangan menambahkan silent antivirus exclusion.
9. Jangan membuka miner API ke `0.0.0.0` secara default.
10. Jangan menganggap semua hardware/algoritma sudah supported hanya karena taxonomy universal sudah ada.
11. Jangan menyebut Docker E2E hijau sampai workflow benar-benar dijalankan.
12. Jangan mengarang nomor release berikutnya; package version, changelog, tag, dan artifact harus sinkron.
13. Jangan menghapus alpha release history yang diperlukan sebagai audit trail.
14. Current-state docs harus menunjuk ke current CI evidence dan current HEAD.
15. Definition of Done harus berupa observable evidence, bukan daftar komponen yang kebetulan sudah dibuat.

## 14. Urutan Eksekusi Rekomendasi

### Sekarang

1. Merge documentation refresh setelah required checks hijau.
2. Jalankan Docker E2E.
3. Tambahkan browser E2E Control Plane.
4. Pilih production-upstream candidate dan capture compatibility fixtures.
5. Selesaikan provider notification yang masih scope v0.3.
6. Hardening public edge.
7. Jalankan load/soak/failure testing.
8. Buat release candidate v0.3 berikutnya hanya setelah blocker ditutup/diterima eksplisit.

### Setelah v0.3 stabil

9. v0.4 deterministic reward/accounting.
10. Ledger reconciliation dan replay trace.
11. Balance projection dari ledger.
12. Agent A0/A1 dapat berjalan paralel bila tidak mengganggu financial correctness work.

### Setelah v0.4 lolos

13. v0.5 signer/wallet/payout sandbox.
14. Security review dan treasury runbook.
15. Controlled payout pilot satu asset/network sebelum multi-chain.

### Menuju v1.0

16. Reliability/security audit.
17. Capacity/soak/chaos/DR drills.
18. Production observability/on-call.
19. Legal/compliance review untuk fitur finansial di jurisdiction target.
20. Real-funds approval hanya setelah semua gate material memiliki evidence.

## 15. Definition of Success

MiningPlatform dianggap berhasil bukan hanya ketika miner dapat terkoneksi, tetapi ketika:

- worker identity aman;
- share pipeline deterministic;
- upstream failure tidak membuat accounting bohong;
- setiap reward dapat ditelusuri;
- setiap balance dapat dijelaskan oleh ledger;
- setiap payout dapat direkonsiliasi;
- user dapat memahami status rig tanpa konfigurasi rumit;
- Agent ringan, transparent, dan tidak berperilaku seperti malware;
- operasional mempunyai monitoring, alert, rollback, dan incident process;
- financial feature tidak aktif di luar boundary legal/security yang disetujui.

Itulah baseline pengembangan yang harus dipertahankan ketika scope MiningPlatform bertambah.
