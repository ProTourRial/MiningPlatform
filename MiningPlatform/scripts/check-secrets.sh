#!/usr/bin/env sh
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
