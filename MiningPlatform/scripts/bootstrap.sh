#!/usr/bin/env sh
# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Replace all placeholder secrets before continuing."
fi

corepack enable
pnpm install
pnpm db:generate

echo "Bootstrap complete. Start infrastructure with: docker compose up -d postgres redis minio"
