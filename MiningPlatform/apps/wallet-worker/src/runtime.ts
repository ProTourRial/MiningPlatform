/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { getBuildInfo } from '@mining/build-info';
import { createLogger } from '@mining/logger';

const buildInfo = getBuildInfo('wallet-worker');

const logger = createLogger('wallet-worker');
logger.info({ build: buildInfo }, 'wallet-worker build information');
logger.info(
  { status: 'scaffolded' },
  'Processes approved payouts. Broadcasting remains disabled until the blockchain adapter and approval flow are complete.',
);

setInterval(() => {
  logger.debug({ heartbeat: true }, 'wallet-worker heartbeat');
}, 60_000);
