# MiningPlatform | Author: Abia Nugrahanto
$ErrorActionPreference = "Stop"
node scripts/apply-delete-manifest.mjs
node scripts/check-alpha6-upgrade.mjs
Write-Host "MiningPlatform alpha.6 patch structure verified. Run pnpm verify:alpha6 in the target environment."
