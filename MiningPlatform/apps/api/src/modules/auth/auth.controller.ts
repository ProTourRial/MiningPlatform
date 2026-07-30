import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  @Get('status')
  getStatus() {
    return { module: 'auth', status: 'scaffolded' };
  }
}
