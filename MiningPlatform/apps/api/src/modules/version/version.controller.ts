/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { getBuildInfo } from '@mining/build-info';
import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('version')
@Controller('version')
export class VersionController {
  @Get()
  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: 'Return release and schema build metadata' })
  getVersion() {
    return getBuildInfo('api');
  }
}
