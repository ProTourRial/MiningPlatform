import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('transparency')
@Controller({ path: 'transparency', version: '1' })
export class TransparencyController {
  @Get('status')
  getStatus() {
    return { module: 'transparency', status: 'scaffolded' };
  }
}
