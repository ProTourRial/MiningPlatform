import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('rewards')
@Controller({ path: 'rewards', version: '1' })
export class RewardsController {
  @Get('status')
  getStatus() {
    return { module: 'rewards', status: 'scaffolded' };
  }
}
