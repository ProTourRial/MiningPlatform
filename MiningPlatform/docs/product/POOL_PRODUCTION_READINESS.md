# Pool Production Readiness

- **Status:** Planning baseline; bukan bukti kesiapan produksi
- **Owner keputusan:** Pemilik produk dan operator MiningPlatform
- **Scope dokumen:** Product, operations, UX/content, legal/compliance preparation, dan manual verification
- **Scope yang sengaja tidak disentuh:** RandomX, migration, `packages/database/prisma/schema.prisma`, `apps/randomx-gateway/**`, `packages/randomx/**`, `packages/upstream-stratum/**`, `CHANGELOG.md`, managed/release manifest, dan accounting implementation
- **Frontend review target:** `feat/professional-frontend-redesign`

> Dokumen ini menjadi acuan perencanaan. Tidak ada bagian di dalamnya yang boleh dipresentasikan sebagai fitur aktif sebelum implementasi, test, operational evidence, dan approval gate terkait lulus.

## 1. Product readiness boundary

MiningPlatform harus mempertahankan batas yang sudah ditetapkan oleh Product Constitution: accepted share bukan otomatis saldo spendable, perubahan saldo hanya melalui immutable double-entry journal, dan payout harus melewati eligibility, reservation, approval, signing, broadcast, confirmation, serta reconciliation.

Pada fase alpha, jalur yang boleh disebut tersedia adalah **development/upstream gateway dan control-plane foundation**. Jalur yang belum boleh diaktifkan untuk dana nyata adalah conversion, custody, payout executor, wallet signing, dan auto-withdrawal. Penamaan UI harus mengikuti status `FOUNDATION`, `PILOT`, `ACTIVE`, `REGISTRATION_ONLY`, atau `DISABLED`; jangan memakai kata “ready”, “paid”, atau “earning” jika hanya ada schema atau preference.

### Definition of Done milestone produksi pertama

Milestone produksi pertama hanya tercapai bila satu trace terkontrol berikut dapat dibuktikan dengan correlation ID, automated tests, operational evidence, dan runbook:

```text
Account → Alias → Worker → Session → Job → Share
→ Upstream acceptance → Contribution → Settlement
→ Fee snapshot → Posted ledger → Reconciled balance
→ Payout eligibility → Reservation → Approval
→ Isolated signing → Broadcast → Confirmation
→ Blockchain reconciliation → User-visible payment history
```

Setiap transition wajib memiliki retry/idempotency policy, failure state, alert, audit event, dan cara recovery. Deployment berhasil atau satu transaksi manual berhasil tidak cukup untuk menyatakan milestone selesai.

## 2. Reward scheme decision record

### 2.1 Status saat ini

Pada upstream gateway, MiningPlatform tetap menggunakan `FOLLOW_UPSTREAM`. Platform belum boleh menyebut dirinya menggunakan PPLNS, PROP, PPS, atau FPPS sebelum memiliki pool-owned block discovery, share accounting, reward-period state machine, settlement source, variance policy, dan reconciliation evidence.

### 2.2 Perbandingan skema

| Skema | Cara menghitung | Risiko operator | Kelebihan pengguna | Kekurangan | Keputusan awal |
|---|---|---:|---|---|---|
| **PPLNS** | Reward block dibagikan berdasarkan share valid pada window N terakhir | Sedang–tinggi; pendapatan mengikuti luck | Lebih tahan pool hopping dan lazim untuk pool | Pendapatan tidak rata; perlu definisi window, cutoff, orphan, dan share difficulty | **Direkomendasikan untuk own-pool setelah block/reorg evidence lulus** |
| **PROP** | Reward dibagi proporsional terhadap share pada round tertentu | Tinggi terhadap pool hopping dan round variance | Paling mudah dijelaskan dan diaudit | Miner dapat berpindah saat round hampir selesai; operator menanggung round risk | **Opsional untuk mode transparansi/pilot dengan batasan jelas** |
| **PPS** | Setiap share valid dibayar berdasarkan probabilitas block dan block subsidy | Sangat tinggi; operator menanggung variance dan treasury exposure | Pendapatan lebih stabil dan mudah diprediksi | Membutuhkan modal, reserve, anti-abuse, dan pricing yang kuat | **Tidak diaktifkan pada milestone pertama** |
| **FPPS** | PPS ditambah estimasi transaction fee share | Sangat tinggi; perlu model fee dan validasi estimasi | Potensi payout lebih tinggi dan stabil | Model lebih kompleks; fee estimation dan variance dapat diperdebatkan | **Post-production setelah PPS governance lulus** |

### 2.3 Keputusan produk

1. **Fase gateway:** gunakan `FOLLOW_UPSTREAM`; gross reward bersumber dari settlement upstream yang dapat direkonsiliasi.
2. **Fase own-pool pertama:** gunakan **PPLNS** sebagai default kandidat karena lebih selaras dengan risk sharing daripada PPS/FPPS. Keputusan final harus dituangkan dalam ADR setelah data hashrate, expected variance, treasury, dan target miner tersedia.
3. **PROP:** boleh disediakan sebagai mode pilot jika round lifecycle, cutoff, share difficulty normalization, dan pool-hopping disclosure sudah teruji.
4. **PPS/FPPS:** hanya setelah reserve treasury, payout limit, expected-loss model, fraud controls, dan approval owner tersedia.

### 2.4 Acceptance criteria reward scheme

- Skema aktif memiliki versioned policy dengan `effectiveFrom`, parameter, dan scope aset/algoritma.
- Setiap share dapat ditelusuri ke worker, session, job, difficulty, round/reward period, dan decision upstream.
- Perhitungan menggunakan integer atomic units atau decimal policy yang deterministik; tidak ada float untuk posting finansial.
- Rounding, minimum share difficulty, duplicate, stale, orphan, rejected, dan late share memiliki expected-result fixture.
- Reward period yang sudah posted tidak dapat diedit; koreksi hanya melalui reversal/adjustment entry.
- Hasil skema dapat direproduksi dari snapshot input dan exchange/price data yang digunakan.
- Dashboard memperlihatkan gross reward, upstream cost, platform fee, referral adjustment, net reward, status settlement, dan alasan pending.

## 3. Minimum payout, maturity, orphan, dan reorg policy

### 3.1 Prinsip umum

Minimum payout harus menjadi properti **asset + network + payout route**, bukan satu angka global. Nilainya harus terlihat sebelum pengguna mengaktifkan payout, memiliki effective date, dan tidak mengubah histori payout yang sudah dibuat. Perubahan policy baru berlaku untuk payout yang belum direservasi.

Konfigurasi saat ini mencantumkan baseline `MINIMUM_PAYOUT_BTC=0.001` dan `PAYOUT_CONFIRMATIONS_BTC=3`; angka tersebut diperlakukan sebagai konfigurasi awal, bukan janji publik. Nilai produksi wajib ditetapkan setelah simulasi network fee, custody cost, operator reserve, dan pengalaman pengguna.

### 3.2 Policy yang diusulkan

| Item | BTC native | BEP20 untuk aset/token yang kompatibel | Acceptance condition |
|---|---|---|---|
| Wallet default | BTC native address sebagai pilihan utama saat payout asset BTC | BEP20 sebagai pilihan jaringan default untuk aset yang memang mendukung BEP20; jangan menampilkan untuk aset yang tidak kompatibel | Route catalog aktif, validator network benar, dan warning network tampil |
| Minimum payout | Awal: 0.001 BTC; dapat diubah melalui versioned route policy | Asset-denominated threshold per token, dihitung terhadap gas/operational cost dan reserve | Threshold, timestamp, fee, dan next eligibility terlihat di UI/API |
| Maturity | Untuk coinbase reward own-pool: default 100 block confirmations sebelum spendable | Tidak menggunakan coinbase maturity; menunggu balance settlement dan route risk checks | Status `IMMATURE`, `PENDING_SETTLEMENT`, dan `SPENDABLE` dibedakan |
| Payout confirmations | Baseline awal 3; dapat dinaikkan berdasarkan risk policy | Usulan awal 12 block confirmations; harus dikalibrasi terhadap chain risk dan provider | Confirmation count, source node, dan finality policy tercatat |
| Address change | Step-up, cooldown, audit, one-active-address | Step-up, cooldown, audit, network-specific validation, dan memo/tag jika diperlukan | Address checksum tidak dianggap sebagai proof of ownership |
| Auto-withdrawal | Default OFF pada akun baru | Default OFF pada akun baru | Tidak efektif bila route, executor, risk, atau reconciliation belum ACTIVE |

> “Default wallet” berarti default UX selection, bukan izin untuk mengirim dana tanpa verifikasi. Pengguna tetap harus mengonfirmasi bahwa address dan network sesuai dengan wallet/exchange tujuan.

### 3.3 Orphan dan reorg

- Reward dari block yang belum matang tidak boleh masuk ke spendable balance.
- Jika block menjadi orphan, reward terkait tetap pending atau dibalik sesuai source settlement; platform tidak boleh mempertahankannya sebagai saldo final.
- Reorg menghasilkan event baru dan reversal/adjustment journal; fakta historis tidak dihapus.
- Reorg depth, detection timeout, dan finality policy wajib versioned per asset/network.
- Payout yang sudah direservasi tetapi belum dibroadcast harus dievaluasi ulang jika saldo sumber terkena reorg.
- Payout yang sudah dibroadcast tidak boleh “dibatalkan” secara internal; status harus mengikuti blockchain, provider, dan reconciliation outcome.
- Semua exception masuk ke queue operator dengan severity, owner, deadline, dan audit trail.

## 4. Fee matrix

| Skenario | Gross reward | Platform fee | Referral discount/commission | Net user reward | Catatan |
|---|---:|---:|---:|---:|---|
| Standar | 100% | **0,50%** | 0% | **99,50%** sebelum biaya upstream/network lain | Policy default terversi |
| Referral valid | 100% | **0,375%** dibebankan ke miner | **0,125%** dari gross reward kepada beneficiary | **99,625%** sebelum biaya lain | Hanya dari reward yang sudah settled |
| Referral tidak valid/kedaluwarsa | 100% | **0,50%** | 0% | **99,50%** sebelum biaya lain | Attribution tidak boleh berubah retroaktif |
| Fee/network/upstream tambahan | 100% | Mengikuti route policy | Mengikuti referral policy | Gross dikurangi seluruh komponen yang ditampilkan | Tidak boleh ada potongan tersembunyi |

Acceptance criteria fee:

- UI/API memperlihatkan gross, platform fee, referral amount, upstream cost, network/conversion cost, dan net.
- Policy menggunakan basis points/PPM atau atomic integer, bukan pembulatan UI.
- Snapshot fee disimpan pada setiap allocation/settlement sehingga histori tidak berubah saat policy baru aktif.
- Referral hanya membayar beneficiary dari fee yang benar-benar sudah settled dan tidak dapat menciptakan saldo dari share pending.
- Total posting selalu seimbang: user allocation + platform fee + referral liability + clearing/source amount.
- Test mencakup zero amount, minimum amount, rounding, duplicate delivery, retry, reversal, dan referral attribution conflict.

## 5. Payout nyata acceptance criteria

Payout nyata tidak boleh diaktifkan hanya dengan mengubah `PAYOUTS_ENABLED=true`. Gate berikut harus disetujui secara eksplisit oleh owner, finance/treasury, security, dan operations.

| Gate | Requirement | Evidence minimum |
|---|---|---|
| Balance eligibility | Hanya saldo `POSTED`, `RECONCILED`, tidak terkena hold, dan melewati threshold yang dapat eligible | Query/read model, invariant test, sample trace |
| Reservation | Atomic reservation mencegah double payout dan menangani concurrent request | Concurrency test, idempotency record, recovery test |
| Risk checks | Address/network, cooldown, sanctions/risk policy, velocity, account state, dan manual hold diperiksa | Decision log dan negative test |
| Approval | Manual pilot memakai separation of duties dan minimal dua approval untuk hot-wallet movement di atas limit | Approval audit dan operator runbook |
| Signing | Private key tidak berada di web/API/database/log; signer terisolasi dan menerima intent terverifikasi | Threat model, signer test, access review |
| Broadcast | Raw transaction hanya dibroadcast setelah policy lulus; retry tidak membuat transaksi ganda | Provider/node evidence, tx idempotency, failure simulation |
| Confirmation | Confirmation/finality dipantau dari node redundan; state machine menangani dropped/replaced/reorg | Blockchain fixture dan monitoring alert |
| Reconciliation | Internal ledger, payout record, node, wallet balance, dan blockchain tx cocok; selisih menjadi exception | Reconciliation report dan correction workflow |
| Recovery | Ada emergency stop, retry budget, manual recovery, backup restore, dan incident communication | Game-day evidence dan signed runbook |
| User disclosure | UI memperlihatkan status, threshold, fee, destination fingerprint, tx hash, confirmation, dan failure reason | Screenshot, API contract, content review |

Auto payout baru dapat diaktifkan setelah manual pilot terkontrol lulus, bukan sebelum itu.

## 6. Operational pool specification

### 6.1 SLA dan SLO target

Target di bawah adalah **internal production target** untuk direncanakan dan diukur. Tidak boleh dipublikasikan sebagai SLA kontraktual sebelum tersedia 90 hari evidence dan persetujuan legal.

| Surface | Target | Measurement |
|---|---:|---|
| Stratum regional endpoint | 99,90% monthly availability | Successful authenticated sessions dan connection health, per region |
| Control Plane/API | 99,95% monthly availability | Synthetic checks untuk health, login, worker read, dan dashboard read |
| Realtime monitoring | 99,90% event delivery availability | Event lag, disconnect rate, dan projection freshness |
| Accepted share intake | 99,95% durable intake availability | Accepted local share yang tersimpan durable atau masuk explicit failure state |
| Payout processing | 99,50% eligible requests selesai atau berstatus actionable dalam 24 jam | Payout state machine dan exception aging |
| Incident response | Sev-1 acknowledgement ≤15 menit | On-call log dan incident timeline |
| Recovery target | RPO ≤5 menit untuk operational events; RTO ≤30 menit control plane | Backup/restore and failover drill |

Scheduled maintenance, upstream outage yang terbukti berasal dari provider, force majeure, chain halt, dan tindakan keamanan darurat harus memiliki definisi pengecualian yang tertulis.

### 6.2 Rencana node Bitcoin Core redundan

- Operasikan minimal dua node Bitcoin Core pada failure domain berbeda; jangan berbagi host, disk, dan jalur jaringan tunggal.
- Pisahkan node query/validation dari node broadcast/signing boundary. API tidak boleh langsung memegang wallet private key.
- Verifikasi block hash, height, chain tip, mempool acceptance, fee estimate, dan transaction status dari lebih dari satu node sebelum final state.
- Sediakan node warm standby dengan data yang dapat dikejar, alert ketika lag melewati threshold, dan prosedur failover yang diuji.
- Batasi RPC melalui private network, mTLS atau equivalent access control, allowlist, secret rotation, dan audit.
- Dokumentasikan policy untuk pruned versus full node; payout/reconciliation tidak boleh bergantung pada asumsi data historis yang tidak tersedia.
- Uji node restart, disk pressure, chain reindex, network partition, stale tip, mempool divergence, dan reorg.

### 6.3 Rencana PostgreSQL/Redis HA

**PostgreSQL:** gunakan primary + standby pada failure domain terpisah, streaming replication dengan lag alert, connection pooler, managed backups plus periodic restore test, PITR/WAL retention, migration rehearsal pada disposable clone, dan explicit failover ownership. Financial tables memerlukan constraint, serializable/appropriate isolation, idempotency keys, immutable audit, serta read model yang dapat dibangun ulang.

**Redis:** gunakan managed Redis atau Sentinel/Cluster sesuai workload; bedakan cache, duplicate reservation, event transport, dan ephemeral coordination. Redis tidak boleh menjadi sumber kebenaran saldo atau payout. Jika Redis hilang, sistem harus fail safe: boleh menahan aksi sensitif atau kembali ke Postgres-backed guard, tetapi tidak boleh menghasilkan double credit/double payout.

### 6.4 Backup, disaster recovery, DDoS, dan monitoring

- Backup encrypted untuk PostgreSQL, object storage, configuration metadata, dan audit evidence; secret backup menggunakan key management terpisah.
- Lakukan restore drill berkala dan ukur RPO/RTO, bukan hanya membuat file dump.
- Simpan backup pada region/account terpisah dengan retention dan access review; uji bahwa backup tidak mengandung private key plaintext.
- Tempatkan Stratum dan HTTP di edge/DDoS protection, dengan connection limits, per-IP/per-credential rate limit, reputation controls, TLS, dan regional health routing.
- Gunakan structured logs, metrics, traces, error tracking, alert routing, on-call, incident timeline, dan status-page workflow.
- Dashboard operator harus membedakan service down, upstream degraded, database lag, event backlog, payout hold, dan blockchain lag.

### 6.5 Minimum metric catalog

| Domain | Metric wajib | Alert contoh |
|---|---|---|
| Pool performance | Pool hashrate, worker hashrate, accepted/rejected/stale/duplicate share, share latency | Reject/stale melewati baseline; worker drop mendadak |
| Luck | Expected blocks, actual blocks, luck per window, variance | Luck anomaly; block accounting mismatch |
| Template/job | Template age, job age, clean-job rate, stale template ratio | Template age terlalu tinggi; job stream berhenti |
| Block propagation | Found-to-first-seen, first-seen-to-node-confirmed, peer propagation | Propagation delay di atas target |
| Upstream | Connection state, reconnect, failover, submit response, provider latency | Primary/backup unhealthy; error burst |
| Accounting | Gross reward, settled reward, fee, referral liability, clearing, user liability | Journal imbalance; liability tidak cocok dengan source |
| Payout | Eligible, reserved, approved, signed, broadcast, confirmed, failed, exception age | Queue menua; duplicate attempt; signer unavailable |
| Infrastructure | CPU, memory, disk, DB/Redis lag, event backlog, WebSocket disconnect | Capacity threshold atau recovery budget terlampaui |

## 7. Frontend/UX review notes

Catatan berikut ditujukan untuk diterapkan pada branch `feat/professional-frontend-redesign`; dokumen ini tidak mengubah branch tersebut.

### 7.1 Urutan menu dashboard yang disarankan

1. **Overview** — ringkasan hashrate, worker online, accepted/rejected share, reward pending/confirmed, dan incident banner.
2. **Workers** — daftar worker, status, hashrate, share quality, telemetry, credentials, dan setup instructions.
3. **Mining Setup** — hardware, algorithm, asset/network, region/port, worker name, copy configuration, dan troubleshooting.
4. **Rewards** — gross reward, fee, referral, pending/settled/reconciled status, reward-period detail, dan trace link.
5. **Payouts** — eligibility, threshold, active destination, auto-withdrawal state, payout history, tx hash, dan exception reason.
6. **Wallet destinations** — address/network management, cooldown, fingerprint, memo/tag, and step-up actions.
7. **Analytics/Simulator** — estimates only, with timestamp and assumptions.
8. **Referrals** — attribution, commission pending/settled, and abuse/eligibility notice.
9. **API & Integrations** — keys, scopes, webhook, examples, and rate limits.
10. **Security** — 2FA, sessions, credential rotation, recovery, and audit.
11. **Transparency & Status** — public metrics, uptime, incidents, fee policy, and release status.
12. **Settings/Support** — profile, notifications, docs, support, terms, privacy, and contact.

Navigation should keep **Overview, Workers, Mining Setup, Rewards, and Payouts** visible as the primary path. Admin/owner operations must be separated from miner-facing navigation.

### 7.2 Landing page copy draft

**Hero headline:**

> Operasi mining yang dapat diverifikasi.

**Hero subcopy:**

> Hubungkan worker fisik Anda, validasi share melalui Stratum, pantau performa farm, dan lacak reward dari accepted work sampai payout. MiningPlatform tidak menjual cloud mining atau saldo investasi.

**Primary CTA saat alpha:** `Lihat status alpha`
**Primary CTA saat production:** `Mulai setup miner`
**Secondary CTA:** `Baca cara kerja` / `Lihat transparansi`

**Trust strip:** `Hardware fisik` · `Share tervalidasi` · `Ledger double-entry` · `Payout dapat diaudit`

**Alpha disclosure:**

> Payout nyata belum aktif pada rilis alpha. Jangan kirim perangkat produksi atau dana nyata sebelum status route dan payout gate berubah menjadi ACTIVE.

### 7.3 FAQ copy draft

| Pertanyaan | Jawaban yang disarankan |
|---|---|
| Apakah ini cloud mining? | Tidak. Mining dilakukan oleh perangkat fisik Anda melalui Stratum. MiningPlatform tidak menjual kontrak hashrate atau menjanjikan keuntungan tetap. |
| Apa yang terjadi setelah worker terhubung? | Worker menerima job, mengirim share, dan server memvalidasi share tersebut. Accepted share belum otomatis menjadi saldo spendable; reward harus melewati settlement dan reconciliation. |
| Kapan reward dapat dibayar? | Reward harus settled, posted ke ledger, melewati minimum payout, risk check, dan route payout yang aktif. Selama alpha, payout dapat tetap gated. |
| Mengapa hashrate di dashboard berbeda dari miner? | Dashboard dapat menampilkan reported hashrate dan calculated hashrate dari accepted share. Keduanya memiliki sumber dan window pengukuran berbeda. |
| Apa perbedaan BTC dan BEP20? | BTC adalah network Bitcoin native. BEP20 adalah network BNB Smart Chain untuk aset yang kompatibel. Address, fee, confirmation, dan dukungan wallet harus cocok; network yang salah dapat menyebabkan kehilangan dana. |
| Apakah checksum membuktikan wallet milik saya? | Tidak. Checksum hanya memvalidasi format address. Anda tetap bertanggung jawab memastikan address dan network benar-benar dikendalikan atau didukung oleh wallet tujuan. |
| Apakah auto-withdrawal langsung mengirim dana? | Tidak selalu. Preference dapat tersimpan, tetapi efektivitasnya bergantung pada address aktif, route, risk gate, payout executor, approval, dan global payout gate. |
| Apa yang terjadi saat reorg atau orphan? | Reward yang belum final tetap pending. Jika reward sebelumnya terkena reorg, platform membuat koreksi melalui event/reversal yang dapat diaudit; histori tidak dihapus. |

### 7.4 Transparency page copy draft

> Statistik publik menampilkan data agregat dan timestamp pembaruan. Data privat seperti IP, lokasi farm, credential, address lengkap, dan saldo individu tidak dipublikasikan.

Kartu yang sebaiknya tersedia:

- Pool hashrate dan window perhitungan.
- Worker aktif dan definisi “aktif”.
- Accepted/rejected/stale share rate.
- Pool luck dan expected-versus-actual blocks.
- Template age dan block propagation.
- Upstream status per region/provider.
- Uptime bulan berjalan dan incident history.
- Fee policy aktif dan effective time.
- Payout route/status tanpa membocorkan user balance.
- Last updated, data delay, dan status `development/pilot/production`.

Jika data belum tersedia, gunakan copy spesifik: `Belum ada data produksi pada environment ini — terakhir diperbarui <timestamp>`. Hindari angka `0` yang dapat disalahartikan sebagai aktivitas nol.

### 7.5 Payout and wallet copy draft

**Payout status:**

> Payout hanya dapat dibuat dari balance yang settled, reconciled, dan memenuhi minimum route. Status `Pending` berarti belum spendable; status `Eligible` berarti lolos aturan saldo, route, dan risk check; status `Processing` berarti reservation/approval sedang berjalan.

**BTC destination:**

> BTC native — gunakan address pada Bitcoin Network. Periksa prefix, fingerprint, dan wallet tujuan sebelum menyimpan. Address baru memiliki cooldown dan memerlukan step-up verification.

**BEP20 destination:**

> BEP20 — hanya gunakan untuk aset yang secara eksplisit mendukung BNB Smart Chain/BEP20. Pastikan exchange atau wallet tujuan menerima aset tersebut melalui BEP20. Network yang salah dapat membuat dana tidak dapat dipulihkan.

**Auto-withdrawal:**

> Auto-withdrawal default OFF. Mengaktifkan preference tidak menjamin payout langsung; payout tetap tunduk pada threshold, route availability, risk review, approval, dan global payout gate.

### 7.6 Screenshot dan contoh tampilan yang diinginkan

| Screenshot | Tujuan | Elemen wajib |
|---|---|---|
| Landing desktop | Menjelaskan positioning | Hero, CTA setup, trust strip, alpha disclosure, pipeline |
| Landing mobile | Memastikan readability dan conversion | Menu collapse, CTA sticky/visible, no horizontal overflow |
| Overview populated | Menunjukkan nilai dashboard | Worker status, hashrate, accepted share, reward state, incident banner |
| Overview empty state | Menuntun miner baru | “Belum ada worker”, CTA setup, contoh konfigurasi, help link |
| Mining setup wizard | Mengurangi time-to-first-share | Hardware → algorithm → asset/network → region/port → worker → copy config |
| Worker detail | Operasional farm | Current/average hashrate, share quality, uptime, temperature/power bila ada |
| Reward detail | Transparansi finansial | Gross, fee, referral, net, settlement, ledger trace, pending reason |
| Payout eligible | Kepercayaan payout | Threshold, available balance, route, fee, confirmation, CTA request |
| Payout gated | Menghindari misleading UI | Blocker list, status badge, next action, no fake submit button |
| Wallet address cooldown | Security UX | Masked address, fingerprint, network, cooldown timer, audit/step-up |
| Transparency page | Public trust | Aggregate cards, timestamps, uptime, incidents, fee policy |
| Error/loading states | Reliability perception | Skeleton, retry, request ID, actionable message, support link |
| Responsive 320/375/768/1440 px | Cross-device quality | No clipped cards, readable tables, accessible focus and touch target |

## 8. Legal and compliance preparation drafts

> Draft berikut adalah bahan kerja produk dan bukan nasihat hukum. Sebelum publikasi atau custody, minta review penasihat hukum di setiap wilayah operasi.

### 8.1 Privacy Policy — outline minimum

1. **Scope and controller:** entitas operator, domain, service, dan contact privacy.
2. **Data collected:** account/email, session/security events, worker metadata, hashrate/share/telemetry, payout destination fingerprint, support records, API logs, and device/browser data.
3. **Purpose:** authentication, mining accounting, fraud/security, payout, support, service improvement, compliance, and incident response.
4. **Data minimization:** raw private key, seed phrase, plaintext worker secret, dan full address exposure tidak boleh disimpan atau ditampilkan tanpa kebutuhan terotorisasi.
5. **Retention:** schedule per kategori; audit/ledger/payout records memiliki retensi lebih panjang daripada ephemeral telemetry.
6. **Sharing:** infrastructure, email, blockchain node/provider, conversion/payout provider, legal authority, dan processor dengan contractual controls.
7. **International transfers:** region, safeguards, dan subprocessor disclosure.
8. **User rights:** access, correction, deletion where legally possible, restriction, export, objection, and complaint channel.
9. **Security:** encryption, least privilege, access logging, incident response, and limitations of security guarantees.
10. **Cookies/analytics:** purpose, consent, opt-out, and retention.
11. **Children/prohibited jurisdictions:** age and jurisdiction restrictions.
12. **Change notice:** effective date and material-change communication.

### 8.2 Terms of Service — outline minimum

- Eligibility, legal capacity, prohibited jurisdictions, sanctions, and acceptable use.
- Description of mining gateway, supported algorithms/assets/routes, and feature availability.
- Clear statement bahwa platform bukan cloud mining, exchange penuh, atau janji ROI.
- User responsibility atas hardware, software miner, wallet address, network selection, tax, electricity, dan legal compliance.
- Reward, fee, referral, conversion, threshold, settlement, and correction rules.
- Payout conditions, custody boundary, risk review, delay/hold/refusal rights, and blockchain irreversibility.
- Account security, worker credentials, API keys, sessions, 2FA, and unauthorized access reporting.
- Service availability, maintenance, upstream/provider dependency, force majeure, and data delay.
- Intellectual property, third-party asset names/logos, feedback, and acceptable use.
- Suspension/termination, dormant account policy, dispute resolution, limitation of liability, governing law, and contact.
- Versioning, effective date, and how material changes are communicated.

### 8.3 Risk disclosure copy

> Mining dan payout aset digital memiliki risiko teknis, pasar, jaringan, custody, keamanan, reorg, orphan, provider, likuiditas, pajak, dan perubahan regulasi. Hashrate atau estimasi simulator bukan janji pendapatan. Accepted share tidak selalu menjadi reward spendable. Payout dapat tertunda, ditahan, ditolak, atau memerlukan verifikasi tambahan. Address dan network yang salah dapat menyebabkan transfer tidak dapat dipulihkan. Selama alpha, payout nyata masih gated dan pengguna tidak boleh mengirim dana atau menghubungkan perangkat produksi tanpa pemberitahuan bahwa route tersebut telah ACTIVE.

### 8.4 KYC/AML, sanctions, dan tax review checklist

- Tentukan legal entity, beneficial owner, operating jurisdictions, dan jurisdictions yang dilarang.
- Tentukan apakah model upstream gateway, custody, conversion, referral, atau payout memerlukan licensing/registration.
- Buat risk-based KYC tiers untuk account, payout, high-value movement, suspicious behavior, dan operator access.
- Pilih sanctions screening provider dan definisikan screening event, false-positive handling, escalation, retention, dan audit.
- Buat AML transaction monitoring: velocity, structuring, address reuse, rapid payout-address change, abnormal worker/share patterns, and linked accounts.
- Definisikan source-of-funds/source-of-reward evidence untuk payout dan conversion.
- Tinjau travel rule, data sharing, privacy, processor contracts, dan cross-border transfer.
- Definisikan tax reporting, reward income records, transaction history export, withholding, dan jurisdiction-specific obligations.
- Tinjau consumer disclosures untuk fee, conversion rate, minimum payout, spread, network fee, and lost-address risk.
- Dapatkan sign-off legal/compliance sebelum menerima dana nyata, mengaktifkan conversion, atau menawarkan payout otomatis.

## 9. Manual test checklist

Checklist berikut sengaja hanya meminta verifikasi manual dan evidence capture; tidak mengubah kode.

| ID | Area | Skenario | Expected result | Evidence | Status |
|---|---|---|---|---|---|
| M-01 | Registrasi | Daftar dengan data valid | Account dibuat, status verification terlihat, tidak ada token sensitif di UI/log | Screenshot + request ID | ☐ |
| M-02 | Registrasi | Email invalid/duplikat/password lemah | Error spesifik dan tidak membocorkan account existence berlebihan | Screenshot | ☐ |
| M-03 | Login | Login valid | Session/access flow berhasil, redirect aman | Screenshot + log | ☐ |
| M-04 | Login | Password salah berulang | Rate limit/lock policy berlaku, pesan tidak membocorkan detail | Screenshot + audit event | ☐ |
| M-05 | Logout | Logout current session | Token/session tidak lagi dapat mengakses protected route | Request evidence | ☐ |
| M-06 | Session | Refresh session normal | Refresh berhasil dan rotation berjalan sesuai policy | Network capture sanitized | ☐ |
| M-07 | Session | Replay refresh token | Family/session dicabut atau ditolak; incident tercatat | Audit event | ☐ |
| M-08 | Worker | Membuat worker | Worker tampil hanya pada akun pemilik, status awal jelas | Screenshot | ☐ |
| M-09 | Worker | Rename/delete worker | Ownership check, confirmation, audit, dan UI state konsisten | Screenshot + audit | ☐ |
| M-10 | Credential | Create credential | Secret hanya tampil sekali; plaintext tidak muncul lagi | Sanitized capture | ☐ |
| M-11 | Credential | Rotate credential | Credential lama invalid, credential baru dapat dipakai sesuai delay | Miner/log evidence | ☐ |
| M-12 | Credential | Revoke credential | Connection/auth baru ditolak; audit tercatat | Log + screenshot | ☐ |
| M-13 | Wallet | Menyimpan BTC address valid | Network/checksum benar, masked read, cooldown, step-up | Screenshot | ☐ |
| M-14 | Wallet | BTC address invalid/wrong network | Ditolak sebelum persistence; pesan actionable | Screenshot | ☐ |
| M-15 | Wallet | Menyimpan BEP20 address pada route kompatibel | Network warning, route policy, cooldown, dan fingerprint tampil | Screenshot | ☐ |
| M-16 | Wallet | Address change selama cooldown | Aktivasi/payout ditolak sampai cooldown selesai | Screenshot + API result | ☐ |
| M-17 | Wallet | Address ganda/active address | One-active-address rule konsisten dan audit tersedia | DB/API evidence | ☐ |
| M-18 | Auto payout | Toggle OFF → ON | Preference tersimpan; effective status dan blocker list jujur | Screenshot | ☐ |
| M-19 | Auto payout | ON saat executor/global gate mati | Tidak ada payout request; UI menampilkan gated reason | Screenshot + audit | ☐ |
| M-20 | Referral | Kode valid saat onboarding | Attribution sticky; fee 0,375% dan beneficiary 0,125% hanya setelah settled | Reward fixture/screenshot | ☐ |
| M-21 | Referral | Kode invalid/attempt override | Tidak ada discount/commission yang tidak sah; audit/event jelas | Screenshot | ☐ |
| M-22 | Payout eligibility | Balance pending/immature | Tidak eligible dan alasan terlihat | Screenshot | ☐ |
| M-23 | Payout eligibility | Balance settled di bawah threshold | Tidak dapat request; threshold/next action terlihat | Screenshot | ☐ |
| M-24 | Payout eligibility | Balance settled di atas threshold | Eligible hanya bila route/risk/hold lulus | Screenshot | ☐ |
| M-25 | Transparency | Membuka halaman publik | Data agregat, timestamp, status environment, dan privacy boundary terlihat | Screenshot | ☐ |
| M-26 | Transparency | Data belum tersedia | Empty state menjelaskan alasan; tidak menggunakan angka 0 yang misleading | Screenshot | ☐ |
| M-27 | Responsive | 320, 375, 768, 1440 px | Tidak ada overflow/clipping; table/card dapat dipakai | Screenshot per breakpoint | ☐ |
| M-28 | Loading | Slow API/WebSocket unavailable | Skeleton/loading dan retry actionable; tidak ada stale claim tanpa timestamp | Screen recording | ☐ |
| M-29 | Error | 401/403/409/429/5xx | Copy berbeda sesuai error, request ID/support path tersedia | Screenshot + response | ☐ |
| M-30 | Accessibility | Keyboard/focus/contrast/labels | Primary flow dapat digunakan tanpa mouse dan label screen-reader masuk akal | Accessibility notes | ☐ |

### Manual test exit criteria

Checklist hanya lulus jika seluruh item P0 tidak memiliki status `Fail`, evidence disanitasi dari secret/address penuh, environment dan commit dicatat, serta defect severity/owner/due date ditetapkan. Test manual tidak menggantikan integration, load, chaos, security, migration, atau provider compatibility test.

## 10. Release decision checklist

Sebelum public production pilot, owner harus menandai semua item berikut:

- [ ] Reward method dan fee policy memiliki ADR, effective date, fixture, dan public disclosure.
- [ ] Minimal satu upstream produksi dan fallback memiliki protocol fixture serta soak/failover evidence.
- [ ] Share-to-settlement-to-ledger trace lulus duplicate, retry, rounding, reversal, dan reconciliation tests.
- [ ] Payout manual pilot lulus eligibility, reservation, approval, isolated signing, broadcast, confirmation, dan reconciliation.
- [ ] BTC native route dan BEP20-compatible route memiliki validator, threshold, confirmation, cooldown, risk, dan user copy yang benar.
- [ ] Wallet/node topology, secret management, emergency stop, incident response, dan access review lulus.
- [ ] PostgreSQL/Redis HA, backup/restore, RPO/RTO, and failover drill memiliki evidence.
- [ ] Stratum/API edge protection, rate limiting, TLS, monitoring, SLO, alerting, dan on-call aktif.
- [ ] Public dashboard, transparency, terms, privacy, risk disclosure, support, dan incident communication tersedia.
- [ ] Manual test checklist P0 lulus pada browser desktop dan mobile.
- [ ] Security assessment independen atau sign-off security internal selesai sebelum custody.
- [ ] `PAYOUTS_ENABLED` dan auto-withdrawal tetap OFF sampai semua approver menandatangani go/no-go.

## 11. Change control

Perubahan terhadap reward scheme, fee, minimum payout, maturity, reorg handling, custody, payout route, default wallet, KYC/AML scope, atau SLA memerlukan:

1. ADR yang menjelaskan konteks, alternatif, risiko, dan rollback.
2. Persetujuan pemilik produk serta stakeholder security/finance/legal yang relevan.
3. Update dokumen ini, UI copy, API contract, runbook, test fixture, dan public disclosure.
4. Bukti bahwa settlement historis dan audit trace tetap dapat direproduksi.
5. Konfirmasi bahwa perubahan tidak menyentuh area yang sedang dibekukan oleh Codex tanpa koordinasi eksplisit.

Dokumen ini sengaja dibuat sebagai perubahan dokumentasi-only pada branch `feat/product-readiness-planning` agar dapat menjadi acuan implementasi berikutnya tanpa bersaing dengan pekerjaan RandomX, migration, upstream-stratum, atau accounting backend.
