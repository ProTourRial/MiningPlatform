# Direct Overwrite Recovery — MiningPlatform v0.3.0 r1

Author: Abia Nugrahanto

Paket ini dibuat untuk folder MiningPlatform besar yang sudah berisi `node_modules`, `.next`, `dist`, cache, log, atau progress lokal.

## Perilaku paket

- Menimpa file source/configuration MiningPlatform dengan v0.3.0 Identity & Access.
- Tidak menghapus `node_modules`, `.env`, database, backup, upload, atau file tambahan milik pengguna.
- Memverifikasi hanya file yang dikelola rilis melalui `managed-source-manifest.json`.
- Mengabaikan file tambahan sehingga folder 1 GB tidak menyebabkan checksum gagal.
- Menambahkan kembali `scripts/apply-delete-manifest.mjs` yang hilang pada paket awal.

## Penggunaan Windows

1. Tutup server Node, terminal dev, dan editor yang sedang melakukan build.
2. Buat salinan folder MiningPlatform sebagai backup.
3. Ekstrak ZIP ini ke folder induk yang sama dan pilih **Replace files in destination**.
4. Buka PowerShell di folder MiningPlatform.
5. Jalankan:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\repair-existing-install.ps1
```

Opsional, untuk membuang hanya cache/build lama tanpa menghapus source atau `node_modules`:

```powershell
.\repair-existing-install.ps1 -CleanGeneratedArtifacts
```

## Penggunaan Linux/macOS

```bash
bash repair-existing-install.sh
# atau hanya membersihkan build/cache:
bash repair-existing-install.sh --clean-generated
```

## Setelah source terverifikasi

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```

Jangan menjalankan incremental patch alpha.6 apabila folder Anda berasal dari alpha.3 atau status versinya tidak pasti. Paket direct overwrite ini membawa source v0.3.0 lengkap dan lebih aman untuk kondisi tersebut.
