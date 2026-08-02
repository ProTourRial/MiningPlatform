# Database Backup and Migration Rollback

MiningPlatform treats committed Prisma migrations as forward-only. A failed production migration is recovered by restoring a verified pre-migration snapshot or by deploying a new corrective migration. Do not edit a migration that has already been applied.

## Pre-migration gate

1. Stop writes or place the control plane and Stratum gateway in maintenance mode.
2. Record the current application version and the output of `pnpm --filter @mining/database exec prisma migrate status`.
3. Create a PostgreSQL custom-format snapshot:

```bash
DATABASE_URL='postgresql://...' pnpm db:snapshot -- backups/pre-v030-alpha2.dump
```

4. Restore that snapshot into a disposable PostgreSQL instance and run application smoke checks before touching production.
5. Run `pnpm verify:migration:v030-alpha2:upgrade` against a disposable copy of the production database.
6. Apply the migration with `pnpm db:migrate:deploy` only after the previous gates succeed.

## Restore procedure

The restore command is destructive. Point `DATABASE_URL` at a disposable or explicitly approved target, then set the acknowledgement value:

```bash
DATABASE_RESTORE_ACK=restore-disposable-or-approved-target \
DATABASE_URL='postgresql://...' \
pnpm db:restore -- backups/pre-v030-alpha2.dump
```

After restore, run Prisma migration status, API readiness, login/refresh integration checks, Worker CRUD smoke tests, and Stratum authorization smoke tests. Re-enable writes only after these checks pass.

## Roll-forward preference

When the database remains structurally healthy and only a localized defect exists, create a new corrective migration instead of restoring. Never run ad-hoc destructive SQL without a snapshot, review, and an audit record.
