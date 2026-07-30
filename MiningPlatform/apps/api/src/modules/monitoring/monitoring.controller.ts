import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service.js';

@ApiTags('monitoring')
@Controller({ path: 'monitoring', version: '1' })
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('status')
  getStatus() {
    return { module: 'monitoring', status: 'core-mining-alpha' };
  }

  @Get('development/workers/:workerId/snapshot')
  getWorkerSnapshot(@Param('workerId') workerId: string) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.monitoringService.getWorkerSnapshot(workerId);
  }
}
