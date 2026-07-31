# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node scripts/apply-delete-manifest.mjs
node scripts/check-alpha5-upgrade.mjs
