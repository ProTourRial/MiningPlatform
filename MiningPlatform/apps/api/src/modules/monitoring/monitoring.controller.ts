import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('monitoring')
@Controller({ path: 'monitoring', version: '1' })
export class MonitoringController {
  @Get('status')
  getStatus() {
    return { module: 'monitoring', status: 'scaffolded' };
  }
}
