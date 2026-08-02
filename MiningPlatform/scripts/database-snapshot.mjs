/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
const suppliedPath = process.argv[3];
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (mode !== 'backup' && mode !== 'restore') {
  throw new Error('Usage: node scripts/database-snapshot.mjs <backup|restore> [snapshot.dump]');
}

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const snapshotPath = resolve(suppliedPath ?? `backups/mining-platform-${timestamp}.dump`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === 'backup') {
  mkdirSync(dirname(snapshotPath), { recursive: true });
  run('pg_dump', [
    '--format=custom',
    '--compress=9',
    '--no-owner',
    '--no-privileges',
    '--file', snapshotPath,
    databaseUrl,
  ]);
  process.stdout.write(`Database snapshot created: ${snapshotPath}\n`);
} else {
  if (process.env.DATABASE_RESTORE_ACK !== 'restore-disposable-or-approved-target') {
    throw new Error('Set DATABASE_RESTORE_ACK=restore-disposable-or-approved-target after confirming the restore target');
  }
  run('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    '--dbname', databaseUrl,
    snapshotPath,
  ]);
  process.stdout.write(`Database snapshot restored: ${snapshotPath}\n`);
}
