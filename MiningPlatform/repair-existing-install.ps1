# MiningPlatform | Author: Abia Nugrahanto
param(
  [switch]$CleanGeneratedArtifacts
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $ProjectRoot

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js tidak ditemukan. Instal Node.js lalu jalankan ulang script ini."
  }

  $RequiredFiles = @(
    "package.json",
    "pnpm-lock.yaml",
    "managed-source-manifest.json",
    "scripts/verify-managed-source.mjs",
    "scripts/check-v030-upgrade.mjs",
    "scripts/apply-delete-manifest.mjs"
  )

  foreach ($File in $RequiredFiles) {
    if (-not (Test-Path $File)) { throw "File pemulihan wajib tidak ditemukan: $File" }
  }

  $Package = Get-Content "package.json" -Raw | ConvertFrom-Json
  if ($Package.version -ne "0.3.0") {
    throw "Versi source setelah overwrite harus 0.3.0, ditemukan: $($Package.version)"
  }

  if ($CleanGeneratedArtifacts) {
    Write-Host "Membersihkan hanya artefak build/cache; source, .env, database, dan node_modules tidak dihapus."
    $GeneratedRoots = @(".turbo", "apps/web/.next", "coverage", ".cache")
    foreach ($Path in $GeneratedRoots) {
      if (Test-Path $Path) { Remove-Item $Path -Recurse -Force }
    }
    Get-ChildItem "apps", "packages", "scripts" -Directory -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -eq "dist" } |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }

  node scripts/verify-managed-source.mjs .
  if ($LASTEXITCODE -ne 0) { throw "Verifikasi file source yang dikelola rilis gagal." }

  node scripts/check-v030-upgrade.mjs
  if ($LASTEXITCODE -ne 0) { throw "Pemeriksaan struktur MiningPlatform v0.3.0 gagal." }

  Write-Host "Pemulihan source MiningPlatform v0.3.0 berhasil. File tambahan seperti node_modules dan progress lokal tidak diperiksa atau dihapus."
  Write-Host "Langkah berikut: pnpm install --frozen-lockfile; pnpm db:generate; pnpm typecheck; pnpm test; pnpm build"
}
finally {
  Pop-Location
}
