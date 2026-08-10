/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 * This time "Abia" was tired to fixing decorator
 */

import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

export const AUTH_ROLES_KEY = 'mining:auth:roles';
export const AUTH_SCOPES_KEY = 'mining:auth:scopes';

export type ControlPlaneRole = 'USER' | 'ADMIN' | 'OWNER';

export interface AuthPrincipal {
  userId: string;
  email: string;
  role: ControlPlaneRole;
  sessionId: string;
  authenticationType: 'access-token' | 'api-key';
  scopes: readonly string[];
}

export const Roles = (...roles: ControlPlaneRole[]) => SetMetadata(AUTH_ROLES_KEY, roles);
export const Scopes = (...scopes: string[]) => SetMetadata(AUTH_SCOPES_KEY, scopes);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<{ auth?: AuthPrincipal }>();
    if (!request.auth) throw new Error('AuthPrincipal is unavailable; AuthGuard is required');
    return request.auth;
  },
);
