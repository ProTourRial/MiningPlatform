# MiningPlatform | Author: Abia Nugrahanto
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $ProjectRoot

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js tidak ditemukan. Instal Node.js lalu jalankan ulang patch dari folder MiningPlatform."
  }

  $RequiredFiles = @(
    "DELETE_FILES.txt",
    "scripts/apply-delete-manifest.mjs",
    "scripts/check-v030-upgrade.mjs",
    "scripts/verify-release-manifest.mjs",
    "installed-release-manifest.json"
  )

  foreach ($File in $RequiredFiles) {
    if (-not (Test-Path $File)) {
      throw "File patch wajib tidak ditemukan: $File"
    }
  }

  node scripts/apply-delete-manifest.mjs
  if ($LASTEXITCODE -ne 0) { throw "Gagal menerapkan DELETE_FILES.txt." }

  node scripts/check-v030-upgrade.mjs
  if ($LASTEXITCODE -ne 0) { throw "Pemeriksaan struktur upgrade v0.3.0 gagal." }

  Move-Item -Force "installed-release-manifest.json" "release-manifest.json"

  node scripts/verify-release-manifest.mjs .
  if ($LASTEXITCODE -ne 0) { throw "Verifikasi release manifest gagal." }

  Write-Host "MiningPlatform v0.3.0 patch installed and manifest verified."
  Write-Host "Next: pnpm install --frozen-lockfile; pnpm db:generate; pnpm typecheck; pnpm test; pnpm build"
}
finally {
  Pop-Location
}
