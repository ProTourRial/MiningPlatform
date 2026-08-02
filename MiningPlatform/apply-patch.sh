#!/usr/bin/env bash
# MiningPlatform | Author: Abia Nugrahanto
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

command -v node >/dev/null 2>&1 || {
  echo "Node.js tidak ditemukan. Instal Node.js lalu jalankan ulang patch dari folder MiningPlatform." >&2
  exit 1
}

required_files=(
  "DELETE_FILES.txt"
  "scripts/apply-delete-manifest.mjs"
  "scripts/check-v030-upgrade.mjs"
  "scripts/verify-release-manifest.mjs"
  "installed-release-manifest.json"
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || {
    echo "File patch wajib tidak ditemukan: $file" >&2
    exit 1
  }
done

node scripts/apply-delete-manifest.mjs
node scripts/check-v030-upgrade.mjs
mv -f installed-release-manifest.json release-manifest.json
node scripts/verify-release-manifest.mjs .

echo "MiningPlatform v0.3.0 patch installed and manifest verified."
echo "Next: pnpm install --frozen-lockfile; pnpm db:generate; pnpm typecheck; pnpm test; pnpm build"
