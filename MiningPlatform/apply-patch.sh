#!/usr/bin/env bash
# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
set -euo pipefail
cd "$(dirname "$0")"
node scripts/apply-delete-manifest.mjs
node scripts/check-alpha5-upgrade.mjs
