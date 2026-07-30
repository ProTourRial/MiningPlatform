import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  @Get('status')
  getStatus() {
    return { module: 'users', status: 'scaffolded' };
  }
}
