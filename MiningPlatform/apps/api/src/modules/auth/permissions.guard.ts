/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { REQUIRED_PERMISSIONS } from '../../common/auth/permissions.decorator';
import { AuthorizationService } from './authorization.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authorization: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<{ principal: AuthPrincipal }>();
    for (const permission of required) await this.authorization.assertPermission(request.principal.userId, permission);
    return true;
  }
}
