/** MiningPlatform — Author: Abia Nugrahanto */
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateApiKeyDto } from './api-keys.dto.js';
import { ApiKeysService } from './api-keys.service.js';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  list(@CurrentPrincipal() principal: AuthPrincipal) { return this.service.list(principal.userId); }

  @Post()
  create(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateApiKeyDto) {
    return this.service.create(principal.userId, dto);
  }

  @Delete(':id')
  revoke(@CurrentPrincipal() principal: AuthPrincipal, @Param('id') id: string) {
    return this.service.revoke(principal.userId, id);
  }
}
