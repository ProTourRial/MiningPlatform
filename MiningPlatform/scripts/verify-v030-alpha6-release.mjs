/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const staticOnly = args.has('--static-only');

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

run('node', ['scripts/check-v030-alpha6.mjs']);
run('node', ['scripts/verify-release-manifest.mjs', '.']);
if (!staticOnly) {
  run('pnpm', ['lint']);
  run('pnpm', ['typecheck']);
  run('pnpm', ['test']);
  run('pnpm', ['build']);
}
process.stdout.write('\nv0.3.0-alpha.6 release verification completed successfully.\n');
