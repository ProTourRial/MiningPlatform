import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('payouts')
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  @Get('status')
  getStatus() {
    return { module: 'payouts', status: 'scaffolded' };
  }
}
