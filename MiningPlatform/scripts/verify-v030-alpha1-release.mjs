/** MiningPlatform — Author: Abia Nugrahanto */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const skipInstall = args.has('--skip-install');
const skipBuild = args.has('--skip-build');
const staticOnly = args.has('--static-only');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function run(command, commandArgs) {
  process.stdout.write(`\n> ${command} ${commandArgs.join(' ')}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(`Node.js ${process.versions.node}; package manager ${packageJson.packageManager}.\n`);
run('node', ['scripts/check-v030-alpha1.mjs']);
run('node', ['scripts/verify-release-manifest.mjs', '.']);
if (staticOnly) {
  process.stdout.write('\nv0.3.0-alpha.1 portable static verification completed successfully.\n');
  process.exit(0);
}
if (!skipInstall) run('pnpm', ['install', '--frozen-lockfile']);
run('pnpm', ['db:generate']);
run('pnpm', ['typecheck']);
run('pnpm', ['test']);
if (!skipBuild) run('pnpm', ['build']);
process.stdout.write('\nv0.3.0-alpha.1 release verification completed successfully.\n');
