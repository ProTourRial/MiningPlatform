import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('ledger')
@Controller({ path: 'ledger', version: '1' })
export class LedgerController {
  @Get('status')
  getStatus() {
    return { module: 'ledger', status: 'scaffolded' };
  }
}
