#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-plan}"
shift || true

exec node "$SCRIPT_DIR/miningplatform-structure-maintenance.mjs" "$COMMAND" "$@"
