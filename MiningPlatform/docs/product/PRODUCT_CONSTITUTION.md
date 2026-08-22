# MiningPlatform Product Constitution

- Status: **Canonical product constitution**
- Owner: Abia Nugrahanto
- Adopted: 2026-08-13
  Horizon: 5–10 years

## Authority

[`../../PROJECT_VISION.md`](../../PROJECT_VISION.md) adalah lapisan dokumentasi tertinggi dan otoritas visi proyek. Product Constitution ini menerjemahkan visi tersebut menjadi positioning operasional, invariant, urutan investasi, release gate, dan change control yang dapat diterapkan oleh engineering.

Di bawah Project Vision, dokumen ini menjadi acuan utama untuk keputusan produk, arsitektur, keamanan, urutan investasi, dan release gate MiningPlatform. Jika roadmap, UI copy, konfigurasi, atau dokumen lama bertentangan dengan dokumen ini, dokumen ini menang sampai konflik diselesaikan melalui ADR baru yang disetujui pemilik proyek. Dokumen ini tidak boleh mengubah atau mempersempit Project Vision tanpa persetujuan eksplisit pemilik proyek.

Dokumen release tetap menjadi sumber kebenaran tentang fitur yang benar-benar sudah diimplementasikan dan divalidasi. Visi dalam dokumen ini tidak boleh dipresentasikan sebagai kemampuan produksi sebelum release gate terkait lulus.

## Pernyataan visi

MiningPlatform adalah **Mining Pool Management Platform / Mining-to-Reward Platform** independen. Platform menjadikan hashrate dari hardware fisik pengguna sebagai input, event dan immutable ledger sebagai pusat kebenaran, serta reward dan payout sebagai output ekonomi. Web, API, desktop, mobile, admin, notification, news, dan support adalah antarmuka terhadap ekosistem yang sama; website bukan keseluruhan produknya.

Alur akhir sistem:

```text
User
  → Account dan Alias
  → Worker
  → MiningPlatform Stratum Network
  → Pool Routing / MiningPlatform Own Pool
  → Share Validation
  → Event Plane
  → Contribution dan Reward Engine
  → Immutable Double-Entry Ledger
  → Conversion (bila diperlukan)
  → Available Balance
  → Payout
  → Blockchain
```

## Positioning dan batas produk

MiningPlatform:

- menerima mining nyata dari ASIC, GPU, CPU, FPGA, rig hybrid, atau hardware kompatibel lain;
- mengelola worker, mining session, share, telemetry, reward, saldo, conversion, dan payout;
- memulai dengan Stratum gateway menuju upstream pool;
- dibangun modular agar algoritma atau blockchain tertentu dapat beralih ke pool milik MiningPlatform;
- dapat memperoleh pendapatan dari service/platform fee dan layanan mining terkait yang transparan.

MiningPlatform bukan:

- cloud mining atau penjual kontrak hashrate;
- skema investasi yang menjanjikan keuntungan tetap;
- browser miner;
- cryptocurrency exchange penuh;
- tempat deposit pengguna pada milestone awal;
- salinan merek, tampilan, copy, desain, atau kode unMineable, NiceHash, maupun referensi lain.

Conversion hanya mendukung hasil mining. Simulator adalah estimasi dengan asumsi dan timestamp yang jelas, bukan janji keuntungan.

## Model bisnis

Default fee awal MiningPlatform adalah **0,5% dari gross mining reward**.

Aturan fee:

1. Fee disimpan sebagai konfigurasi/versioned policy, bukan hard-coded di perhitungan finansial.
2. Fee dapat berbeda berdasarkan aset, algoritma, jaringan, campaign, referral, atau tier pengguna.
3. Setiap settlement harus memperlihatkan gross reward, upstream/pool cost, platform fee, conversion/network cost, referral adjustment, dan net reward.
4. Perubahan fee harus diaudit, memiliki effective time, dan tidak boleh mengubah settlement historis.
5. Referral discount atau commission hanya diakui dari pendapatan yang sudah settled.
6. Model bisnis tidak boleh bergantung pada deposit investasi atau janji ROI.

Pendapatan lanjutan dapat berasal dari premium analytics, API tier, enterprise/farm management, optimized routing, dan partnership yang tetap konsisten dengan positioning mining.

## Invariant yang tidak boleh dilanggar

### Mining

- Accepted lokal dan accepted upstream adalah fakta yang berbeda.
- Share harus dapat ditelusuri ke worker, session, job, difficulty, validation result, upstream decision, dan correlation ID.
- Duplicate, stale, malformed, unauthorized, dan low-difficulty share tidak boleh menghasilkan kontribusi finansial yang valid.
- Pool Adapter Layer mengisolasi provider dan memungkinkan multi-upstream serta own-pool evolution.
- Hashrate berasal dari share/difficulty/time dan telemetry nyata, bukan angka dekoratif.

### Accounting

- Dashboard balance bukan sumber kebenaran.
- Semua nilai finansial berasal dari immutable double-entry journal yang seimbang.
- Share accepted tidak otomatis menjadi saldo spendable.
- Reward harus melewati contribution calculation, upstream settlement, fee policy, rekonsiliasi, dan journal posting.
- Koreksi dilakukan dengan reversal/adjustment entry; fakta historis tidak diedit.
- Setiap payout dapat ditelusuri mundur sampai share dan upstream result, dan sebaliknya.

### Wallet dan payout

- API atau frontend tidak memegang private key dan tidak melakukan signing.
- Signing terisolasi dengan hot/warm/cold policy, limits, allowlist, approval, dan emergency circuit breaker.
- Lifecycle payout: eligibility → policy/risk check → balance reservation → batching → approval/signing → broadcast → confirmation → reconciliation.
- Scheduler dan provider operation wajib idempotent; retry tidak boleh membuat double payout.
- Perubahan payout address memerlukan step-up authentication, audit, dan cooldown yang sesuai risiko.
- Step-up payout harus session-bound, scope-bound, berumur pendek, disimpan dalam bentuk hash, sekali pakai, dan tahan replay faktor.
- Validasi checksum/network hanya membuktikan format alamat, bukan kepemilikan private key.
- Route registration-only tidak boleh membuat payout; route dan address history harus immutable/versioned untuk audit.
- Payout nyata tetap mati sampai treasury, ledger, risk/compliance, reconciliation, recovery, dan incident-response gate lulus.

### Event dan data

- Integrasi antar-domain menggunakan versioned domain events dan idempotent consumers.
- Database transaction dan event publication memakai transactional outbox bila atomicity diperlukan.
- Realtime dashboard berasal dari projection/read model melalui WebSocket/SSE, bukan polling tabel transaksi inti.
- Data pribadi, farm, worker, IP, wallet, payout, credential metadata, dan security event menggunakan least privilege.
- Statistik publik bersifat agregat dan tidak membocorkan informasi privat pengguna.

### Operasi dan keamanan

- Sensitive actions menggunakan step-up authentication dan separation of duties sesuai risiko.
- Logs, metrics, traces, audit trail, IDs lintas-domain, alerting, SLO, incident timeline, backup, dan restore drill adalah bagian produk.
- Internal ledger direkonsiliasi dengan upstream pool, conversion provider, treasury wallet, blockchain, dan payout record.
- Selisih menghasilkan reconciliation exception; tidak boleh dipaksa cocok atau dibulatkan secara tersembunyi.
- Dana nyata tidak diaktifkan hanya karena satu transaksi uji berhasil dikirim.

## Bounded contexts target

1. Identity & Access
2. Account, Alias & Organization
3. Worker & Farm Management
4. Mining Gateway & Regional Routing
5. Share Validation & Job Lifecycle
6. Pool Integration & Own-Pool Adapters
7. Worker Telemetry & Monitoring
8. Contribution, Reward & Settlement
9. Immutable Ledger & Balance Projection
10. Conversion, Pricing & Treasury Exposure
11. Asset, Network & Payout Route Catalog
12. Treasury, Wallet & Payout
13. Referral & Growth Economics
14. Risk, Fraud & Compliance
15. Simulator & Calculation Engine
16. Developer API, SDK & Webhooks
17. Dashboard & Transparency Read Models
18. Notifications
19. Admin/Owner Operations
20. Support, Content & News
21. Audit, Observability & Platform Operations

Logical bounded context tidak mewajibkan satu microservice per context. Pemisahan deployment dilakukan ketika throughput, security isolation, availability, atau ownership membutuhkannya.

## Pengalaman pengguna akhir

Onboarding utama harus sesederhana:

```text
Daftar / masuk
  → pilih hardware dan algoritma
  → pilih reward asset dan network
  → buat alias serta worker
  → hasilkan konfigurasi miner (.bat/.sh/app)
  → hubungkan hardware
  → worker otomatis muncul
  → pantau hashrate, share, reward, dan payout
```

Alias dipakai untuk routing dengan format seperti `Alias.WorkerName`; alias bukan password. Account flow adalah jalur utama. Compatibility/quick-start flow hanya dipertahankan jika dapat diamankan dan direkonsiliasi.

Dashboard target menampilkan balance, pending/confirmed reward, estimated earnings, hashrate per algoritma, worker online/degraded/offline/unknown, share terbaru, payout eligibility, next auto-payout, referral earnings, payment history, security alert, incident, dan event timeline.

## Urutan investasi wajib

1. Product constitution, architecture, event contracts, security invariants, dan release discipline.
2. Production Mining Plane: protocol correctness, authentication, share validation, multi-upstream, recovery, VarDiff, telemetry, load/failure testing.
3. Production Control Plane: account/alias, worker credentials, sessions, RBAC, step-up security, API keys, payout-address policy, audit.
4. Accounting: contribution, reward settlement, fee policy, immutable ledger, projections, reconciliation, traceability.
5. Calculation engine, simulator, read models, monitoring, admin, transparency, dan notifications.
6. Referral dan account-level reward configuration.
7. Payout simulation, lalu manual controlled payout.
8. Treasury isolation, controlled payout, conversion, dan risk/compliance gates.
9. Auto payout, multi-network, multi-chain, dan multi-asset reward distribution.
10. Public API, SDK, webhook, desktop supervisor, dan mobile monitoring.
11. Enterprise/farm management, regional Stratum, intelligent routing, community layer, dan own-pool evaluation.

Bagian yang menyentuh uang tidak boleh melompati fondasi mining, accounting, security, dan reconciliation.

## Release gates menuju milestone produksi pertama

### Gate A — Mining truth

- Real miner dapat subscribe, authorize, menerima job, submit, dan memperoleh keputusan upstream yang benar.
- Provider fixtures, multi-upstream failover, reconnect/session recovery, VarDiff, rate limits, serta regional/capacity behavior tervalidasi.
- Hashrate dan worker state dapat dibuktikan dari data nyata.

### Gate B — Identity dan control

- Account/alias, worker credential, session rotation, 2FA/step-up, scoped API keys, RBAC, audit, dan tenant isolation tervalidasi.
- Perubahan sensitif aman terhadap replay, takeover, brute force, dan concurrency.

### Gate C — Financial truth

- Contribution → reward → fee → ledger → balance seluruhnya deterministic, idempotent, seimbang, dan dapat ditelusuri.
- Upstream settlement dan internal liability direkonsiliasi dengan exception workflow.
- Default fee 0,5% diterapkan melalui policy yang versioned dan transparan.

### Gate D — Controlled funds

- Payout simulation dan manual pilot lulus sebelum automation.
- Signing terisolasi, approval dan separation of duties aktif, wallet/node/provider direkonsiliasi.
- Risk, sanctions/jurisdiction review, incident response, backup/restore, emergency stop, dan recovery drill disetujui.

### Gate E — Production operations

- CI, migration, contract, integration, end-to-end, security, dependency, load, stress, soak, failover, chaos, backup, dan rollback gates hijau.
- Observability, on-call ownership, runbook, SLO, incident communication, support, privacy, terms, dan public transparency tersedia.
- Operasi dana nyata mendapat persetujuan eksplisit; tidak aktif secara default hanya karena deployment berhasil.

## Definisi milestone “proyek selesai”

Milestone produksi pertama tercapai ketika miner nyata dapat:

1. mendaftar dan mengamankan akun;
2. membuat alias/worker dan menghubungkan hardware;
3. menghasilkan accepted share yang tervalidasi dan direkonsiliasi;
4. melihat worker, hashrate, contribution, gross reward, fee 0,5%, net reward, dan status settlement;
5. menerima payout aman ke blockchain;
6. menelusuri seluruh jalur melalui audit trail tanpa ketergantungan pada edit database manual.

Pada titik itu MiningPlatform berubah dari proyek pembangunan menjadi produk yang terus dioperasikan dan dikembangkan. “Selesai” tidak berarti inovasi berhenti.

## Horizon setelah produksi pertama

- multi-algorithm: SHA-256 lalu Scrypt, RandomX, KawPow, Etchash, Autolykos, Equihash, atau algoritma lain berdasarkan keputusan produk;
- multi-chain dan reward distribution ke satu atau beberapa aset;
- intelligent routing berdasarkan lokasi, latency, health, profitability, fee, dan risk;
- desktop configuration generator yang berevolusi menjadi verified miner supervisor;
- mobile monitoring-first dengan financial action hanya setelah device/risk security matang;
- enterprise farm management, organizations, teams, delegation, fleet grouping, bulk configuration, dan consolidated accounting;
- API/infrastructure service untuk mitra B2B;
- dataset anonim dan governed untuk diagnostics, forecasting, fraud detection, dan optimization;
- own-pool infrastructure ketika user base, hashrate, liquidity, node operations, dan economics membenarkannya;
- news/support lalu community layer hanya setelah moderation, trust, dan scam/impersonation protection tersedia.

## Flywheel bisnis

```text
Miner bergabung
  → hashrate, data, dan reward volume bertambah
  → routing, conversion, dan payout makin efisien
  → biaya serta pengalaman makin kompetitif
  → transparansi, referral, API, dan reputasi menarik miner/farm baru
  → volume bertambah kembali
```

Aset jangka panjang MiningPlatform adalah Stratum network, basis user/worker, ledger, historical mining dataset, integrations, treasury capability, API ecosystem, brand, dan kemampuan operasional. UI adalah etalase; mesin tersebut adalah bisnisnya.

## Aturan penggunaan referensi

unMineable digunakan sebagai referensi utama pola mining-to-reward: account/alias, worker monitoring, reward-asset conversion, calculator, auto payout, payment history, referral, API, multi-network, news/support, desktop, dan mobile monitoring. NiceHash dapat menjadi referensi skala pengalaman mining dan monitoring.

Implementasi MiningPlatform harus original, independen, dan auditable. Target diferensiasinya adalah arsitektur domain yang eksplisit, event-driven workflow, immutable ledger, traceability, modular pool adapters, auditable reward calculation, observability kuat, API-first design, dan jalur evolusi menuju own pool.

## Change control

Perubahan terhadap positioning, default fee, custody, deposit, reward method, ledger invariant, payout activation gate, atau urutan investasi finansial memerlukan:

1. ADR dengan konteks, risiko, alternatives, dan migration plan;
2. persetujuan eksplisit pemilik proyek;
3. update dokumen ini, roadmap, konfigurasi, test, dan public disclosure terkait;
4. bukti bahwa settlement historis tetap dapat direproduksi dan diaudit.
