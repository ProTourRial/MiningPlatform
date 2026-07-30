/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { UpstreamStratumSimulator } from '@mining/upstream-stratum';

const port = Number(process.env.UPSTREAM_SIMULATOR_PORT ?? 3334);
if (!Number.isInteger(port) || port <= 0) throw new Error('UPSTREAM_SIMULATOR_PORT must be a positive integer');

const simulator = new UpstreamStratumSimulator({
  host: process.env.UPSTREAM_SIMULATOR_HOST ?? '127.0.0.1',
  port,
  username: process.env.UPSTREAM_USERNAME ?? 'upstream.account',
  password: process.env.UPSTREAM_PASSWORD ?? 'x',
  difficulty: process.env.UPSTREAM_SIMULATOR_DIFFICULTY ?? '0.000001',
  rejectShares: process.env.UPSTREAM_SIMULATOR_REJECT_SHARES === 'true',
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void simulator.close().finally(() => process.exit(0)));
}

await simulator.listen();
console.log(`Upstream Stratum simulator listening on 127.0.0.1:${simulator.port}`);
