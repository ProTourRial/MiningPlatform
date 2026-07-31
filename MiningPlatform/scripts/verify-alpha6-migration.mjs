/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { spawnSync } from 'node:child_process';
const mode = process.argv[2];
if (mode !== 'fresh' && mode !== 'upgrade') throw new Error('Usage: node scripts/verify-alpha6-migration.mjs <fresh|upgrade>');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const expectedAck = mode === 'fresh' ? 'alpha6-fresh-empty-database' : 'alpha5-upgrade-copy';
if (process.env.MIGRATION_TEST_ACK !== expectedAck) throw new Error(`Set MIGRATION_TEST_ACK=${expectedAck} after confirming the database is disposable`);

function run(command, args) {
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('pnpm', ['db:migrate:deploy']);
run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);
process.stdout.write(`\nAlpha.6 ${mode} migration verification completed successfully.\n`);
