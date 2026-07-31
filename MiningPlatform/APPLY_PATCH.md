# Apply MiningPlatform alpha.5 Patch

Author: Abia Nugrahanto  
Upgrade source: `0.2.0-alpha.4`  
Upgrade target: `0.2.0-alpha.5`

## Apply

1. Back up the alpha.4 project and database.
2. Extract the patch ZIP over the existing `MiningPlatform` directory and allow replacement.
3. Remove obsolete ADR duplicates:

```bash
bash apply-patch.sh
```

Windows PowerShell:

```powershell
./apply-patch.ps1
```

4. Validate dependencies and generated code:

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```

The combined command is:

```bash
pnpm verify:alpha5
```

## Migration checks

Use disposable databases only. See `docs/releases/v0.2.0-alpha.5-upgrade.md` for the fresh-database and alpha.4-upgrade procedures.
