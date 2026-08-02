/** MiningPlatform — Author: Abia Nugrahanto */
import { spawnSync } from 'node:child_process';
const mode = process.argv[2];
if (mode !== 'fresh' && mode !== 'upgrade') throw new Error('Usage: node scripts/verify-v030-alpha1-migration.mjs <fresh|upgrade>');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const expectedAck = mode === 'fresh' ? 'v030-alpha1-fresh-empty-database' : 'alpha6-upgrade-copy';
if (process.env.MIGRATION_TEST_ACK !== expectedAck) throw new Error(`Set MIGRATION_TEST_ACK=${expectedAck} after confirming the database is disposable`);

function run(command, args) {
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('pnpm', ['db:migrate:deploy']);
run('pnpm', ['--filter', '@mining/database', 'exec', 'prisma', 'migrate', 'status']);
process.stdout.write(`\nv0.3.0-alpha.1 ${mode} migration verification completed successfully.\n`);
