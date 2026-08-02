# Apply MiningPlatform v0.3.0 Patch

Owner: Abia Nugrahanto

This incremental patch upgrades only:

```text
0.2.0-alpha.6 → 0.3.0
```

## Recommended Windows procedure

Do not apply the patch to a directory that still contains `node_modules`, `.next`, `dist`, `.turbo`, logs, or other generated artifacts. Back up the old directory first.

1. Verify the downloaded ZIP against its `.sha256` file.
2. Back up the source tree, `.env`, and database.
3. Extract the patch over the existing clean `MiningPlatform` source directory and allow replacement.
4. Open PowerShell and run:

```powershell
Set-Location "C:\path\to\MiningPlatform"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\apply-patch.ps1
```

The script automatically changes to its own directory before verification. It also checks that Node.js and all required patch files are present.

## Linux or macOS

```bash
cd /path/to/MiningPlatform
bash apply-patch.sh
```

The patch contains an incremental `release-manifest.json` for the patch payload and an `installed-release-manifest.json` for the completed repository. The installer applies the structured delete manifest, validates the v0.3.0 structure, installs the completed-release manifest, and verifies the resulting payload.

## Target-environment verification

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```

Or run:

```bash
pnpm verify:v030
```

## Database verification

Use disposable databases only:

```bash
MIGRATION_TEST_ACK=v030-fresh-empty-database pnpm verify:migration:v030:fresh
MIGRATION_TEST_ACK=alpha6-upgrade-copy pnpm verify:migration:v030:upgrade
```

No alpha.6 files require deletion in this release. `DELETE_FILES.txt` remains part of the patch contract.
