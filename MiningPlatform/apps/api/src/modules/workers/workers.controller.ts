/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PLATFORM_DEFAULTS } from '@mining/shared';

@ApiTags('workers')
@Controller({ path: 'workers', version: '1' })
export class WorkersController {
  @Get('status')
  getStatus() {
    return {
      module: 'workers',
      status: 'alpha',
      currentAlgorithm: PLATFORM_DEFAULTS.algorithm,
      hardwareSupport: PLATFORM_DEFAULTS.supportedHardwareTypes,
      detectionMethods: ['USER_DECLARED', 'STRATUM_USER_AGENT', 'MONITORING_AGENT', 'MINER_API'],
      limitation: 'Current share validation is Bitcoin SHA-256. Other algorithms require separate adapters.',
    };
  }
}
