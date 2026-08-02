#!/usr/bin/env bash
# MiningPlatform | Author: Abia Nugrahanto
set -euo pipefail

CLEAN_GENERATED=false
[[ "${1:-}" == "--clean-generated" ]] && CLEAN_GENERATED=true
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

command -v node >/dev/null 2>&1 || { echo "Node.js tidak ditemukan." >&2; exit 1; }
for file in package.json pnpm-lock.yaml managed-source-manifest.json scripts/verify-managed-source.mjs scripts/check-v030-upgrade.mjs scripts/apply-delete-manifest.mjs; do
  [[ -f "$file" ]] || { echo "File pemulihan wajib tidak ditemukan: $file" >&2; exit 1; }
done

[[ "$(node -p "require('./package.json').version")" == "0.3.0" ]] || { echo "Versi source harus 0.3.0" >&2; exit 1; }

if [[ "$CLEAN_GENERATED" == true ]]; then
  echo "Membersihkan hanya artefak build/cache; source, .env, database, dan node_modules tidak dihapus."
  rm -rf .turbo apps/web/.next coverage .cache
  find apps packages scripts -type d -name dist -prune -exec rm -rf {} + 2>/dev/null || true
fi

node scripts/verify-managed-source.mjs .
node scripts/check-v030-upgrade.mjs

echo "Pemulihan source MiningPlatform v0.3.0 berhasil. File tambahan dan progress lokal tidak dihapus."
echo "Next: pnpm install --frozen-lockfile; pnpm db:generate; pnpm typecheck; pnpm test; pnpm build"
