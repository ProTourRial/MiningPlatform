/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { prisma } from '@mining/database';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../auth/permissions.guard';

@ApiTags('audit')
@ApiBearerAuth()
@Controller({ path: 'audit', version: '1' })
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class AuditController {
  @Get()
  @RequirePermissions('audit.read')
  async list(@CurrentPrincipal() principal: AuthPrincipal, @Query('limit') limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 200);
    return prisma.auditLog.findMany({
      where: { actorUserId: principal.userId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        category: true,
        outcome: true,
        action: true,
        resourceType: true,
        resourceId: true,
        metadata: true,
        occurredAt: true,
      },
    });
  }
}
