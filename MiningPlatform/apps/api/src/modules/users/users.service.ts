/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@mining/database';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../auth/authorization.service';
import type { UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly audit: AuditService, private readonly authorization: AuthorizationService) {}

  async me(principal: AuthPrincipal) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      include: {
        security: { select: { totpEnabled: true, recoveryCodesHash: true, passwordChangedAt: true } },
        roleAssignments: { include: { role: true } },
      },
    });
    const authorization = await this.authorization.getAuthorization(user.id);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      accountType: user.accountType,
      emailVerified: Boolean(user.emailVerifiedAt),
      locale: user.locale,
      timezone: user.timezone,
      roles: authorization.roles,
      permissions: authorization.permissions,
      security: {
        totpEnabled: user.security?.totpEnabled ?? false,
        backupCodesRemaining: user.security?.recoveryCodesHash.length ?? 0,
        passwordChangedAt: user.security?.passwordChangedAt,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async update(principal: AuthPrincipal, input: UpdateProfileDto) {
    const user = await prisma.user.update({
      where: { id: principal.userId },
      data: {
        displayName: input.displayName?.trim(),
        locale: input.locale,
        timezone: input.timezone,
        accountType: input.accountType,
      },
    });
    await this.audit.record({
      actorUserId: principal.userId,
      category: 'ACCOUNT',
      action: 'profile.updated',
      resourceType: 'User',
      resourceId: principal.userId,
      sessionId: principal.sessionId,
      metadata: { changedFields: Object.keys(input) },
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountType: user.accountType,
      locale: user.locale,
      timezone: user.timezone,
      updatedAt: user.updatedAt,
    };
  }
}
