import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  live() {
    return this.healthService.live();
  }

  @Get('live')
  liveExplicit() {
    return this.healthService.live();
  }

  @Get('ready')
  async ready() {
    const result = await this.healthService.ready();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
