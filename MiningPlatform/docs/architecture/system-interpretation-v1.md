# Dokumen Interpretasi Sistem v1.0

## Tujuan

MiningPlatform merupakan Mining Pool Management Platform. Sistem mengelola operasional mining, monitoring perangkat, akuntansi reward, payout, analytics, dan transparansi.

Platform bukan marketplace hashrate, penyedia kontrak cloud mining, atau layanan investasi. Seluruh mining berasal dari ASIC, GPU, CPU, FPGA, rig hybrid, atau perangkat fisik lain yang terhubung melalui Stratum.

## Fungsi utama

1. Mining Pool Management
2. Mining Farm Dashboard
3. Mining Analytics dan Simulator

Website bertindak sebagai dashboard, control plane, accounting system, dan monitoring center. Website tidak menjalankan mining dalam browser.

## Tahap operasional awal

Tahap pertama menggunakan upstream pool gateway. Stratum gateway menerima koneksi worker lalu, setelah implementasi relay selesai, meneruskan pekerjaan ke upstream pool. Reward pengguna mengikuti reward aktual yang diterima dari upstream.

## Reward

Metode MVP adalah `FOLLOW_UPSTREAM`. Sistem tidak menjamin FPPS apabila upstream memakai model berbeda. Reward harus melalui rekonsiliasi sebelum dialokasikan secara final.

## Wallet

Platform memakai internal ledger sebagai sumber saldo. Wallet blockchain hanya menjalankan penerimaan reward upstream, penyimpanan aset, dan payout.

Wallet dipisahkan menjadi hot wallet, cold wallet, dan fee wallet. Setiap blockchain menggunakan adapter dan node sendiri.

## Role

- Guest
- User
- Owner

Owner memakai akses privat, 2FA, VPN, IP allowlist, privileged session, audit log, dan server CLI. Nama route tersembunyi bukan kontrol keamanan.
