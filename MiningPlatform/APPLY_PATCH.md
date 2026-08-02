# Apply MiningPlatform alpha.6 Patch

Owner: Abia Nugrahanto

This incremental patch is compatible with `0.2.0-alpha.5`.

1. Back up source and database.
2. Extract the patch over the existing `MiningPlatform` directory.
3. Run `bash apply-patch.sh` or `.\apply-patch.ps1`.
4. Verify the downloaded ZIP with its `.sha256` file before extraction.
5. Run `pnpm verify:alpha6` in an environment with registry access and the correct Prisma engine.
5. Verify fresh and alpha.5-upgrade migrations on disposable databases.

No files require deletion in alpha.6. The structured delete manifest remains present so the patch mechanism is consistent between releases.
