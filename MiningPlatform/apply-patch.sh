#!/usr/bin/env bash
# MiningPlatform | Author: Abia Nugrahanto
set -euo pipefail
node scripts/apply-delete-manifest.mjs
node scripts/check-alpha6-upgrade.mjs
echo "MiningPlatform alpha.6 patch structure verified. Run pnpm verify:alpha6 in the target environment."
