/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const skipInstall = args.has('--skip-install');
const skipBuild = args.has('--skip-build');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function run(command, commandArgs) {
  process.stdout.write(`\n> ${command} ${commandArgs.join(' ')}\n`);
  const result = spawnSync(command, commandArgs, { cwd: new URL('..', import.meta.url), stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(`Node.js ${process.versions.node}; package manager ${packageJson.packageManager}.\n`);
run('node', ['scripts/check-alpha6-upgrade.mjs']);
run('node', ['scripts/verify-release-manifest.mjs', '.']);
if (!skipInstall) run('pnpm', ['install', '--frozen-lockfile']);
run('pnpm', ['db:generate']);
run('pnpm', ['typecheck']);
run('pnpm', ['test']);
if (!skipBuild) run('pnpm', ['build']);
process.stdout.write('\nAlpha.6 release verification completed successfully.\n');
