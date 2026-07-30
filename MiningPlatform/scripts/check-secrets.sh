#!/usr/bin/env sh
# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

set -eu

if [ ! -f .env ]; then
  echo ".env is missing"
  exit 1
fi

if grep -Eq 'change-me|replace-me|replace-with' .env; then
  echo "Unsafe placeholder values remain in .env"
  exit 1
fi

echo "No known placeholder values found. Manual secret review is still required."
