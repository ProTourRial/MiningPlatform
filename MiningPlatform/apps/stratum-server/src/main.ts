/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { printVersionAndExitIfRequested } from '@mining/build-info';

if (printVersionAndExitIfRequested('stratum-server')) {
  process.exit(0);
}

void import('./runtime.js');
