/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'fresh' && mode !== 'upgrade') {
  throw new Error('Usage: node scripts/verify-v030-alpha2-migration.mjs <fresh|upgrade>');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const expectedAck = mode === 'fresh'
  ? 'v030-alpha2-fresh-empty-database'
  : 'v030-alpha1-upgrade-copy';
if (process.env.MIGRATION_TEST_ACK !== expectedAck) {
  throw new Error(`Set MIGRATION_TEST_ACK=${expectedAck} after confirming the database is disposable`);
}

const psqlUrl = new URL(process.env.DATABASE_URL);
psqlUrl.searchParams.delete('schema');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = join(root, 'packages/database/prisma/migrations');
const targetMigration = '20260803040000_auth_session_rotation_hardening';
const targetDirectory = join(migrationsRoot, targetMigration);
const parkedDirectory = join(dirname(migrationsRoot), `.${targetMigration}.disabled`);
if (!existsSync(targetDirectory)) throw new Error(`Missing migration: ${targetMigration}`);
if (existsSync(parkedDirectory)) throw new Error(`Remove stale parked migration directory: ${parkedDirectory}`);

function run(command, args, options = {}) {
  process.stdout.write(`\n> ${command} ${options.redactArgs ? '[arguments redacted]' : args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 1}`);
}

function psql(args) {
  run(
    'psql',
    [psqlUrl.toString(), '--set', 'ON_ERROR_STOP=1', ...args],
    { redactArgs: true },
  );
}

psql(['--command', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);

if (mode === 'upgrade') {
  renameSync(targetDirectory, parkedDirectory);
  try {
    run('pnpm', ['db:migrate:deploy']);
    run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);
  } finally {
    renameSync(parkedDirectory, targetDirectory);
  }
}

run('pnpm', ['db:migrate:deploy']);
run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);
psql([
  '--command',
  'SELECT "tokenFamilyId" FROM "AuthSession" LIMIT 0; SELECT "familyId", "status" FROM "AuthRefreshToken" LIMIT 0;',
]);
process.stdout.write(`\nv0.3.0-alpha.2 ${mode} migration verification completed successfully.\n`);
