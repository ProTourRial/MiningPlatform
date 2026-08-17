/** MiningPlatform — Author: Abia Nugrahanto */
import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Roles, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  OpenReconciliationExceptionDto,
  RejectReconciliationExceptionDto,
  ResolveReconciliationExceptionDto,
  SubmitReconciliationExceptionDto,
  VersionedCommentDto,
} from './reconciliation.dto.js';
import { ReconciliationService } from './reconciliation.service.js';

@ApiTags('reconciliation')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles('ADMIN')
@Controller({ path: 'reconciliation', version: '1' })
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get('exceptions')
  list(@CurrentPrincipal() principal: AuthPrincipal, @Query('status') status?: string) {
    return this.service.list(principal, status);
  }

  @Get('exceptions/:exceptionId')
  get(@CurrentPrincipal() principal: AuthPrincipal, @Param('exceptionId') exceptionId: string) {
    return this.service.get(principal, exceptionId);
  }

  @Post(':reconciliationId/exceptions')
  open(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('reconciliationId') reconciliationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() dto: OpenReconciliationExceptionDto,
  ) {
    return this.service.open(principal, reconciliationId, dto, idempotencyKey, correlationId);
  }

  @Post('exceptions/:exceptionId/submit')
  submit(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('exceptionId') exceptionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() dto: SubmitReconciliationExceptionDto,
  ) {
    return this.service.submit(principal, exceptionId, dto, idempotencyKey, correlationId);
  }

  @Post('exceptions/:exceptionId/approve')
  approve(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('exceptionId') exceptionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() dto: VersionedCommentDto,
  ) {
    return this.service.approve(principal, exceptionId, dto, idempotencyKey, correlationId);
  }

  @Post('exceptions/:exceptionId/reject')
  reject(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('exceptionId') exceptionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() dto: RejectReconciliationExceptionDto,
  ) {
    return this.service.reject(principal, exceptionId, dto, idempotencyKey, correlationId);
  }

  @Post('exceptions/:exceptionId/resolve')
  resolve(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('exceptionId') exceptionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() dto: ResolveReconciliationExceptionDto,
  ) {
    return this.service.resolve(principal, exceptionId, dto, idempotencyKey, correlationId);
  }
}
