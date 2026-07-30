import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('shares')
@Controller({ path: 'shares', version: '1' })
export class SharesController {
  @Get('status')
  getStatus() {
    return { module: 'shares', status: 'scaffolded' };
  }
}
