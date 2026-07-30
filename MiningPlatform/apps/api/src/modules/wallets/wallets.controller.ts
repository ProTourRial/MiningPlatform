import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('wallets')
@Controller({ path: 'wallets', version: '1' })
export class WalletsController {
  @Get('status')
  getStatus() {
    return { module: 'wallets', status: 'scaffolded' };
  }
}
