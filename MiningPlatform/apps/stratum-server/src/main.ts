/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { loadStratumConfig } from './config.js';
import { StratumServer } from './server.js';

const config = loadStratumConfig();
const server = await StratumServer.create(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}

await server.listen();
