# Runbook Penataan Struktur MiningPlatform

## Tujuan

Paket script ini memisahkan tiga jenis tindakan:

1. `plan`: memeriksa proyek dan membuat laporan tanpa mengubah source;
2. `cleanup`: menghapus dependency, cache, hasil build, generated Prisma, log, dan tree report;
3. `organize`: menjalankan penataan berisiko rendah;
4. `all`: menjalankan cleanup lalu organize.

Perintah yang dapat mengubah file tetap berjalan sebagai dry-run sampai flag `--apply` atau `-Apply` diberikan.

## Perubahan yang diotomatisasi

- membersihkan `node_modules`, `.turbo`, `.next`, `dist`, `coverage`, `.cache`, `*.tsbuildinfo`, `*.log`, Prisma generated client, dan `PROJECT_TREE.txt`;
- menambahkan pola generated artifact ke `.gitignore` dan `.dockerignore`;
- menghapus workflow `.github` nested hanya bila identik dengan workflow root;
- memindahkan `apps/upstream-simulator` ke `tools/upstream-simulator`;
- menambahkan `tools/*` ke `pnpm-workspace.yaml`;
- memperbarui path importer dalam source dan lockfile;
- mengelompokkan script ke `scripts/ci`, `scripts/db`, `scripts/dev`, `scripts/ops`, dan `scripts/release`;
- memindahkan `APPLY_PATCH.md` dan `DIRECT_OVERWRITE.md` ke `docs/releases/<versi>/`;
- menghapus DTO duplikat hanya jika kedua file byte-identical;
- mengarsipkan `release-manifest.json` karena manifest lama menjadi tidak valid setelah path source berubah;
- membuat backup dan change manifest di `.artifacts/`.

## Perubahan yang sengaja tidak diotomatisasi

- penggabungan ADR yang isi keputusannya berbeda;
- penggabungan DTO yang isinya berbeda;
- pemindahan `wallet-worker` atau `monitoring-agent` ke `prototypes`;
- penghapusan package `validation`, `state-machine`, atau package lain;
- pengubahan service Docker Compose;
- pengubahan schema database atau migration.

Tindakan tersebut membutuhkan pemeriksaan import, runtime, Docker, CI, dan acceptance criteria secara terpisah.

## Persiapan

Jalankan dari root repository yang berisi `.github/` dan folder `MiningPlatform/`, atau dari root monorepo yang langsung berisi `package.json`.

Pastikan tersedia:

- Node.js sesuai `package.json`;
- pnpm sesuai `packageManager`;
- Git;
- PowerShell 7 pada Windows, atau Bash pada Linux/macOS/Git Bash.

Buat branch khusus:

```bash
git checkout main
git pull
git checkout -b chore/structure-cleanup-alpha3
```

Commit atau stash semua perubahan tracked sebelum mode apply.

## Penempatan script

Salin tiga file berikut ke satu folder, misalnya repository root:

```text
miningplatform-structure-maintenance.mjs
run-miningplatform-maintenance.ps1
run-miningplatform-maintenance.sh
```

## Tahap 1 — Audit tanpa perubahan

### PowerShell

```powershell
.\run-miningplatform-maintenance.ps1 -Command plan -Root .
```

### Bash

```bash
./run-miningplatform-maintenance.sh plan --root .
```

Periksa:

```text
MiningPlatform/.artifacts/structure-maintenance-plan.txt
MiningPlatform/.artifacts/structure-maintenance-plan.json
```

Fokuskan pemeriksaan pada:

- status nested workflow;
- DTO duplikat identik atau berbeda;
- ADR-0009 ganda;
- daftar generated directory dan file;
- keberadaan folder yang akan dipindahkan.

## Tahap 2 — Dry-run cleanup

### PowerShell

```powershell
.\run-miningplatform-maintenance.ps1 -Command cleanup -Root .
```

### Bash

```bash
./run-miningplatform-maintenance.sh cleanup --root .
```

Output `[DRY-RUN]` menunjukkan file yang akan dihapus. Belum ada perubahan nyata.

## Tahap 3 — Terapkan cleanup

### PowerShell

```powershell
.\run-miningplatform-maintenance.ps1 -Command cleanup -Root . -Apply
```

### Bash

```bash
./run-miningplatform-maintenance.sh cleanup --root . --apply
```

Script membuat backup dan manifest di:

```text
MiningPlatform/.artifacts/structure-backup/<timestamp>/
MiningPlatform/.artifacts/last-structure-maintenance.json
```

Generated artifacts seperti `node_modules`, `.next`, `dist`, dan `.turbo` sengaja tidak dibackup karena dapat diregenerasi dan ukurannya sangat besar. Backup tetap dibuat untuk source atau dokumen yang dipindahkan pada mode `organize`. Opsi `-NoBackup` atau `--no-backup` hanya digunakan bila Anda sengaja tidak memerlukan backup perubahan struktur source.

## Tahap 4 — Instal ulang dan validasi kondisi awal

Masuk ke monorepo:

```powershell
cd .\MiningPlatform
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Jangan lanjut ke organize bila kondisi source awal belum dapat dibangun.

## Tahap 5 — Dry-run organize

Kembali ke root repository.

### PowerShell

```powershell
.\run-miningplatform-maintenance.ps1 -Command organize -Root .
```

### Bash

```bash
./run-miningplatform-maintenance.sh organize --root .
```

Perhatikan pesan `[MANUAL]`. Script tidak akan menghapus nested workflow, DTO, atau ADR bila kontennya berbeda.

## Tahap 6 — Terapkan organize

### PowerShell

```powershell
.\run-miningplatform-maintenance.ps1 -Command organize -Root . -Apply
```

### Bash

```bash
./run-miningplatform-maintenance.sh organize --root . --apply
```

Alternatif satu kali untuk cleanup dan organize:

```powershell
.\run-miningplatform-maintenance.ps1 -Command all -Root . -Apply
```

```bash
./run-miningplatform-maintenance.sh all --root . --apply
```

## Tahap 7 — Regenerasi dependency dan lockfile

Karena workspace path berubah dari `apps/upstream-simulator` menjadi `tools/upstream-simulator`, jalankan:

```bash
cd MiningPlatform
pnpm install
```

Kemudian pastikan perubahan `pnpm-lock.yaml` hanya terkait importer/path workspace yang dipindahkan.

Setelah stabil, validasi frozen lockfile:

```bash
pnpm install --frozen-lockfile
```

## Tahap 8 — Validasi penuh

```bash
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Opsional, script dapat menjalankan rangkaian ini otomatis:

```powershell
.\run-miningplatform-maintenance.ps1 -Command all -Root . -Apply -Validate
```

```bash
./run-miningplatform-maintenance.sh all --root . --apply --validate
```

Untuk diagnosis yang lebih jelas, validasi manual bertahap lebih disarankan daripada `--validate` pada eksekusi pertama.

## Tahap 9 — Regenerasi release manifest

`release-manifest.json` lama dipindahkan ke `.artifacts/previous-release/<versi>/` karena checksum dan daftar path sudah tidak berlaku.

Regenerasi setelah semua pemeriksaan lulus:

```bash
pnpm release:manifest
pnpm release:manifest:verify
```

Pastikan script package sudah menunjuk ke `scripts/release/generate-release-manifest.mjs` dan `scripts/release/verify-release-manifest.mjs`.

## Tahap 10 — Periksa Git diff

```bash
git status --short
git diff --stat
git diff
```

Pastikan tidak ada:

- `.env` atau secret;
- database dump;
- private key;
- `node_modules`;
- `.next`, `dist`, `.turbo`, atau log;
- perubahan schema/migration yang tidak direncanakan;
- penghapusan file DTO/ADR non-identik.

## Tahap 11 — Commit bertahap

Rekomendasi commit:

```bash
git add MiningPlatform/.gitignore MiningPlatform/.dockerignore
git commit -m "chore: harden generated artifact exclusions"

git add -A MiningPlatform/tools MiningPlatform/apps/upstream-simulator MiningPlatform/pnpm-workspace.yaml MiningPlatform/pnpm-lock.yaml
git commit -m "chore: move upstream simulator to development tools"

git add -A MiningPlatform/scripts MiningPlatform/package.json MiningPlatform/docs MiningPlatform/README.md
git commit -m "chore: organize maintenance and release scripts"
```

Sesuaikan path bila monorepo berada langsung di root repository.

## Tahap 12 — Push dan CI

```bash
git push -u origin chore/structure-cleanup-alpha3
```

Buka pull request dan jalankan CI. Jangan gabungkan dengan Product Domain Alignment sampai cleanup/organization sendiri lulus lint, typecheck, test, build, dan migration checks.

## Pemulihan

Script menyimpan salinan path yang diubah di:

```text
.artifacts/structure-backup/<timestamp>/files/
```

Pemulihan dilakukan dengan menyalin kembali file dari folder tersebut sesuai struktur path aslinya. Untuk pemulihan penuh dan paling aman gunakan Git:

```bash
git restore .
git clean -fd
```

Perintah `git clean -fd` menghapus seluruh file untracked. Jalankan hanya setelah memeriksa `git status --short`.
