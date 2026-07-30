import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('workers')
@Controller({ path: 'workers', version: '1' })
export class WorkersController {
  @Get('status')
  getStatus() {
    return { module: 'workers', status: 'scaffolded' };
  }
}
