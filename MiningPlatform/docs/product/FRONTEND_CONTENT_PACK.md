# Frontend Content Pack

- **Status:** Documentation-only content pack
- **Branch:** `feat/frontend-content-pack`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Landing, FAQ, transparency, payout, wallet, auto-withdrawal, referral MP05, error/loading/empty states, dan security notifications
- **Out of scope:** React components, API implementation, RandomX, migration, accounting backend, manifest, dan `CHANGELOG.md`

> Copy ini harus mengikuti state backend. Jangan menampilkan “paid”, “active”, atau “verified” jika state sebenarnya masih gated, pending, registration-only, atau belum diverifikasi.

## 1. Voice and terminology

Gunakan bahasa yang jelas, tenang, dan tidak menjanjikan profit. Bedakan **payout destination** dari wallet deposit, pool treasury, dan wallet donasi. Hindari istilah “default wallet” jika yang dimaksud adalah address payout akun.

| Do                                | Jangan gunakan                                  |
| --------------------------------- | ----------------------------------------------- |
| `BTC payout destination`          | `default wallet`                                |
| `BEP20 payout destination`        | `wallet` tanpa network                          |
| `Payout is gated`                 | `Payout ready` saat executor belum aktif        |
| `Preference saved; not effective` | `Auto-withdrawal active` hanya karena toggle ON |
| `Address format validated`        | `Wallet ownership verified` tanpa proof         |
| `Reward pending maturity`         | `Available balance` untuk reward immature       |
| `Site donation beneficiary`       | `MP05 fallback wallet`                          |

## 2. Landing page

### Hero

**Headline:**

> Mining yang dapat dipantau, dihitung, dan diaudit.

**Subheadline:**

> Hubungkan worker fisik Anda melalui Stratum, pantau kualitas share dan hashrate, lalu lacak reward dari settlement sampai payout. MiningPlatform bukan cloud mining dan tidak menjanjikan keuntungan tetap.

**Primary CTA — alpha:** `Lihat status platform`
**Primary CTA — production:** `Mulai setup miner`
**Secondary CTA:** `Cara kerja` · `Lihat transparansi`

### Trust cards

- **Worker fisik:** `Mining berasal dari perangkat Anda sendiri.`
- **Share tervalidasi:** `Accepted share dibedakan dari share stale, duplicate, atau rejected.`
- **Reward terlacak:** `Gross reward, fee, referral, dan net reward memiliki jejak settlement.`
- **Payout terkendali:** `Payout mengikuti eligibility, approval, blockchain confirmation, dan reconciliation.`

### Alpha banner

> **Alpha — payout nyata belum aktif.** Anda dapat meninjau alur dan menyiapkan worker/destination, tetapi jangan mengirim dana atau menghubungkan perangkat produksi sebelum route dan payout gate dinyatakan `ACTIVE`.

### Product boundary

> MiningPlatform mengelola mining gateway dan reward workflow. Platform tidak menjual kontrak cloud mining, tidak menerima deposit investasi, dan tidak menjamin ROI. Estimasi simulator hanyalah estimasi dengan asumsi dan timestamp.

## 3. FAQ

| Pertanyaan                                                | Jawaban                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apakah MiningPlatform cloud mining?                       | Tidak. Hashrate berasal dari hardware fisik Anda melalui koneksi mining yang dikonfigurasi. Platform tidak menjual kontrak hashrate atau menjanjikan pendapatan tetap.                                                   |
| Apakah accepted share langsung menjadi saldo?             | Tidak. Accepted share harus melewati settlement, fee policy, ledger posting, dan reconciliation sebelum dapat menjadi available balance.                                                                                 |
| Apa perbedaan payout destination dan deposit wallet?      | Payout destination adalah address milik akun Anda untuk menerima payout pada asset/network tertentu. Deposit wallet, pool treasury, dan wallet donasi adalah peran berbeda dan tidak boleh saling menggantikan otomatis. |
| Apakah BTC address dapat dipakai pada BEP20?              | Tidak. BTC address hanya untuk Bitcoin Network. BEP20 hanya untuk BNB Smart Chain dan asset/token yang route-nya mendukung BEP20.                                                                                        |
| Apakah checksum berarti wallet sudah terbukti milik saya? | Tidak. Checksum hanya memvalidasi format. Ownership confirmation memerlukan metode tambahan atau status risk yang disetujui.                                                                                             |
| Mengapa wallet baru belum dapat menerima payout?          | Address baru dapat berada dalam ownership review, cooldown, atau withdrawal lock. Payout tetap gated sampai seluruh policy lulus.                                                                                        |
| Apakah auto-withdrawal ON langsung mengirim dana?         | Tidak. Toggle hanya menyimpan preference. `Effective` tetap false bila executor, route, address, maturity, risk, approval, atau global payout gate belum aktif.                                                          |
| Apa itu MP05?                                             | MP05 adalah kode referral default. Bagian beneficiary 0,125% diarahkan ke wallet donasi situs sesuai policy. MP05 bukan fallback wallet, bukan deposit wallet, dan bukan payout destination akun pengguna.               |
| Bagaimana fee dihitung?                                   | Fee standar platform adalah 0,50%. Dengan referral valid, fee miner adalah 0,375% dan 0,125% menjadi beneficiary referral/donasi dari gross reward, setelah reward settled.                                              |
| Mengapa reward saya pending?                              | Reward dapat menunggu settlement, maturity/finality, reorg review, reconciliation, atau risk hold. Detail status dan next action ditampilkan pada reward/payout detail.                                                  |
| Apa yang terjadi saat timeout?                            | Jangan membuat request baru dengan idempotency key berbeda sebelum status request sebelumnya diperiksa. Sistem harus mencegah duplicate reservation atau payout.                                                         |

## 4. Transparency page

### Intro copy

> Halaman transparansi menampilkan data agregat dengan timestamp dan status freshness. Data privat seperti full wallet address, saldo individual, IP, credential, dan lokasi farm tidak dipublikasikan.

### Card copy

| Card            | Label                         | Supporting copy                                                                |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Pool hashrate   | `Pool hashrate`               | `Dihitung dari accepted share pada window <window>.`                           |
| Worker aktif    | `Active workers`              | `Worker yang mengirim telemetry/share dalam <window>.`                         |
| Share quality   | `Accepted / rejected / stale` | `Sumber: share validation dan upstream response.`                              |
| Pool luck       | `Pool luck`                   | `Perbandingan expected dan actual block pada window <window>; bukan prediksi.` |
| Template age    | `Template age`                | `Waktu sejak job/template terakhir diperbarui.`                                |
| Upstream status | `Upstream status`             | `Status per provider/region dengan last checked timestamp.`                    |
| Uptime          | `Service uptime`              | `Window, exclusions, dan incident link harus terlihat.`                        |
| Payout state    | `Payout availability`         | `Route dan executor dapat tetap gated selama alpha.`                           |

### Empty state

> **Belum ada data produksi pada environment ini.** Data akan muncul setelah pipeline aktif dan memiliki sumber telemetry yang tervalidasi. Terakhir diperiksa: `<timestamp UTC>`.

Jangan menggunakan angka `0` untuk membedakan “belum ada data” dari “data terukur bernilai nol”.

## 5. Payout status and history

### Status copy

| State                               | Badge                  | Copy                                                                                        |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `PENDING_SETTLEMENT`                | `Pending settlement`   | `Reward belum selesai direkonsiliasi dengan sumber settlement.`                             |
| `PENDING_MATURITY`                  | `Waiting for maturity` | `Reward belum mencapai confirmation/maturity policy.`                                       |
| `BELOW_MINIMUM_PAYOUT`              | `Below minimum`        | `Available balance belum mencapai minimum payout untuk route ini.`                          |
| `NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS` | `Destination required` | `Tambahkan dan verifikasi payout destination yang sesuai asset/network.`                    |
| `COOLDOWN`                          | `Wallet cooldown`      | `Payout ditahan sampai cooldown destination berakhir.`                                      |
| `WITHDRAWAL_LOCK_ACTIVE`            | `Withdrawal locked`    | `Payout sementara dikunci setelah perubahan wallet atau review risiko.`                     |
| `PAYOUT_PAUSED`                     | `Payout paused`        | `Payout dipause untuk melindungi saldo dan integritas transaksi.`                           |
| `ROUTE_UNAVAILABLE`                 | `Route unavailable`    | `Route ini belum tersedia untuk payout nyata.`                                              |
| `ELIGIBLE`                          | `Eligible`             | `Balance dan policy dasar lulus; request tetap memerlukan idempotency dan gate berikutnya.` |
| `PROCESSING`                        | `Processing`           | `Request sedang diproses; jangan kirim ulang dengan key berbeda.`                           |
| `COMPLETED`                         | `Completed`            | `Transaction telah mencapai confirmation policy dan tercatat pada history.`                 |
| `FAILED`                            | `Failed`               | `Payout gagal. Lihat reason, retryability, dan recovery action.`                            |

### Payout empty state

> **Belum ada payout.** Setelah reward settled, destination aktif, threshold tercapai, dan payout gate tersedia, histori payout akan muncul di sini.

### Payout gated callout

> Payout nyata belum aktif atau sedang dipause. Tidak ada dana yang dikirim dari halaman ini. Periksa route status, wallet destination, maturity, eligibility, dan incident status sebelum mencoba lagi.

## 6. Wallet destination

### Form labels and helper copy

- **Field:** `Payout destination address`
- **Field:** `Asset and network`
- **BTC helper:** `Gunakan address pada Bitcoin Network. BTC address tidak dapat digunakan sebagai BEP20 destination.`
- **BEP20 helper:** `Gunakan address pada BNB Smart Chain untuk asset/token yang mendukung BEP20. Pastikan wallet atau exchange tujuan menerima token melalui network ini.`
- **Checksum helper:** `Format dan checksum akan divalidasi server-side. Valid checksum bukan bukti kepemilikan private key.`
- **Ownership helper:** `Destination dapat memerlukan signed challenge, micro-transfer, atau review sesuai route risk policy.`
- **Cooldown helper:** `Perubahan destination memicu cooldown dan withdrawal lock. Payout tidak otomatis dialihkan ke address lain.`

### Confirmation dialog

> Anda akan menyimpan payout destination `<masked address>` pada `<asset> / <network>`. Periksa network dan wallet tujuan. Address atau network yang salah dapat menyebabkan transfer tidak dapat dipulihkan. Setelah perubahan, withdrawal lock dan cooldown dapat berlaku.

**CTA:** `Simpan destination`
**Cancel:** `Batalkan`

### Success copy

> Destination tersimpan untuk akun ini. Status saat ini: `<status>`. Payout belum tentu aktif. Lihat cooldown, ownership, route, dan next action di bawah.

### Failure copy

- `Invalid address`: `Format address tidak valid untuk network yang dipilih.`
- `Network mismatch`: `Address ini tidak dapat digunakan pada network tersebut. Pilih address atau network yang sesuai.`
- `Checksum failed`: `Checksum address gagal divalidasi. Tidak ada perubahan yang disimpan.`
- `Cooldown active`: `Destination belum dapat diaktifkan sampai <timestamp UTC>.`
- `Step-up required`: `Verifikasi keamanan diperlukan sebelum mengubah payout destination.`

## 7. Auto-withdrawal

### Toggle copy

**OFF:** `Auto-withdrawal tidak aktif`
`Preference saat ini OFF. Tidak ada scheduler payout yang dipicu oleh preference ini.`

**ON but gated:** `Preference tersimpan — belum efektif`
`Auto-withdrawal belum mengirim dana karena masih ada blocker: <blockers>.`

**Effective:** `Auto-withdrawal aktif`
`Payout akan mengikuti threshold, maturity, risk, approval, route, dan emergency pause policy.`

### Confirmation dialog

> Mengaktifkan preference tidak menjamin payout langsung. Payout tetap hanya berjalan jika destination aktif, balance settled/reconciled, threshold tercapai, risk check lulus, dan payout executor tersedia.

## 8. Referral MP05

### Referral panel

> Kode referral **MP05** mengarahkan bagian beneficiary referral sebesar **0,125% dari gross reward** ke **wallet donasi situs**. MP05 bukan payout destination akun, bukan deposit wallet, dan bukan fallback wallet pengguna.

### Fee breakdown copy

- `Platform fee standar: 0,50%`
- `Fee miner dengan referral valid: 0,375%`
- `Beneficiary referral/donasi: 0,125% dari gross reward`
- `Applies: setelah reward settled; policy version <version>`

Jika attribution belum valid atau sudah kedaluwarsa, tampilkan fee standar dan jangan membuat beneficiary liability.

## 9. Error, loading, and empty states

### Loading

> `Memuat data terbaru…` > `Last updated: <timestamp>`

Untuk financial data, tampilkan skeleton atau stale-data banner; jangan mengganti data sementara menjadi `0` tanpa label.

### Generic errors

| Error   | User copy                                       | Next action                                          |
| ------- | ----------------------------------------------- | ---------------------------------------------------- |
| `401`   | `Sesi Anda berakhir.`                           | `Masuk kembali`                                      |
| `403`   | `Anda tidak memiliki akses untuk tindakan ini.` | `Kembali` / contact support                          |
| `409`   | `Data berubah sebelum tindakan selesai.`        | `Muat ulang dan tinjau perubahan`                    |
| `412`   | `Versi data sudah berubah.`                     | `Muat data terbaru sebelum menyimpan`                |
| `429`   | `Terlalu banyak percobaan.`                     | `Coba lagi setelah <retry-after>`                    |
| `503`   | `Layanan dependency sedang tidak tersedia.`     | `Coba lagi nanti; lihat status layanan`              |
| Timeout | `Permintaan belum memiliki hasil final.`        | `Periksa status sebelum retry`                       |
| Unknown | `Terjadi kesalahan tak terduga.`                | `Simpan request ID <request-id> dan hubungi support` |

### Empty states

- **No worker:** `Belum ada worker. Buat worker pertama untuk mendapatkan konfigurasi mining.`
- **No reward:** `Belum ada reward settled. Hubungkan worker dan tunggu settlement.`
- **No wallet:** `Belum ada payout destination. Tambahkan destination sesuai asset/network.`
- **No payout:** `Belum ada payout. Payout akan muncul setelah eligibility dan route gate lulus.`
- **No referral:** `Belum ada attribution/referral reward settled.`
- **No transparency data:** `Data agregat belum tersedia pada environment ini.`

## 10. Security notifications

| Trigger              | Title                                  | Message                                                                                                            | CTA                  |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- |
| New login            | `Login baru terdeteksi`                | `Login baru dari <device/region safe label> pada <timestamp>. Jika bukan Anda, cabut session dan ubah credential.` | `Review sessions`    |
| Step-up success      | `Verifikasi keamanan berhasil`         | `Tindakan sensitif telah diverifikasi untuk request ini.`                                                          | `Lihat activity`     |
| Step-up failed       | `Verifikasi keamanan gagal`            | `Percobaan tidak berhasil. Jangan bagikan kode verifikasi kepada siapa pun.`                                       | `Try again`          |
| Wallet changed       | `Payout destination berubah`           | `Destination akun berubah dan withdrawal lock/cooldown berlaku sampai <timestamp>.`                                | `Review wallet`      |
| Withdrawal lock      | `Payout sementara dikunci`             | `Payout dikunci untuk melindungi akun setelah perubahan destination atau review risiko.`                           | `View details`       |
| Credential rotated   | `Worker credential dirotasi`           | `Credential lama tidak lagi berlaku. Simpan credential baru secara aman; secret hanya ditampilkan sekali.`         | `View worker`        |
| Payout paused        | `Payout dipause`                       | `Payout sementara dihentikan untuk melindungi integritas saldo dan transaksi.`                                     | `View status`        |
| Suspicious action    | `Aktivitas sensitif memerlukan review` | `Kami menahan tindakan ini sampai pemeriksaan keamanan selesai.`                                                   | `Contact support`    |
| Potential compromise | `Lindungi akun Anda`                   | `Jika Anda menduga credential atau wallet compromise, hentikan payout dan hubungi security support.`               | `Open security help` |

Security notification tidak boleh menampilkan full address, token, private key, worker secret, atau detail yang membantu attacker.

## 11. Content acceptance checklist

- [ ] Semua copy membedakan payout destination dari deposit/treasury/donation wallet.
- [ ] MP05 selalu dijelaskan sebagai beneficiary referral/donasi, bukan fallback user wallet.
- [ ] BTC dan BEP20 menyebut network secara eksplisit dan tidak menyiratkan interchangeability.
- [ ] Wallet ownership, checksum, cooldown, withdrawal lock, dan wrong-network risk terlihat sebelum submit.
- [ ] Auto-withdrawal membedakan preference `ON` dari effective payout.
- [ ] Payout gated/pending/maturity/reorg/failed state memiliki copy dan next action.
- [ ] Error/loading/empty state tidak menampilkan angka palsu atau fake success.
- [ ] Security notification tidak membocorkan secret atau full sensitive identifier.
- [ ] Semua CTA mengarah ke endpoint/route yang benar-benar tersedia; jika belum ada, CTA disabled atau berlabel target.
- [ ] Content review mengikat versi copy ke API contract dan state-machine version.

No React component or backend implementation change is authorized by this documentation-only branch.
