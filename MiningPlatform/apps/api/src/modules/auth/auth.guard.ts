/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { prisma } from '@mining/database';
import { hashOpaqueToken, verifyAccessToken } from '@mining/security';
import { authRuntimeConfig } from './auth-config.js';
import { AUTH_ROLES_KEY, AUTH_SCOPES_KEY, type AuthPrincipal, type ControlPlaneRole } from './auth.decorators.js';

const ROLE_WEIGHT: Record<ControlPlaneRole, number> = { USER: 1, ADMIN: 2, OWNER: 3 };

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      method: string;
      auth?: AuthPrincipal;
    }>();
    const authorization = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;
    const cookieHeader = request.headers.cookie;
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    const bearer = bearerToken(authorization);
    const cookieAccessToken = cookieValue(cookie, 'mp_access');
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    if (!apiKey && !bearer && cookieAccessToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
      const originHeader = request.headers.origin;
      const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
      const configuredOrigin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
      if (!origin || origin !== configuredOrigin) throw new ForbiddenException('Invalid request origin');
    }

    const principal = apiKey
      ? await this.authenticateApiKey(apiKey)
      : await this.authenticateAccessToken(bearer ?? cookieAccessToken);
    request.auth = principal;

    const roles = this.reflector.getAllAndOverride<ControlPlaneRole[]>(AUTH_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.some((role) => ROLE_WEIGHT[principal.role] >= ROLE_WEIGHT[role])) {
      throw new ForbiddenException('Insufficient role');
    }

    const scopes = this.reflector.getAllAndOverride<string[]>(AUTH_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      scopes?.length &&
      principal.authenticationType === 'api-key' &&
      !scopes.every((scope) => principal.scopes.includes(scope) || principal.scopes.includes('*'))
    ) {
      throw new ForbiddenException('API key does not have the required scope');
    }
    return true;
  }

  private async authenticateAccessToken(token: string | undefined): Promise<AuthPrincipal> {
    if (!token) throw new UnauthorizedException('Access token is required');
    let claims;
    try {
      const config = authRuntimeConfig();
      claims = verifyAccessToken(token, config.jwtSecret, { issuer: config.issuer, audience: config.audience });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const session = await prisma.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE', deletedAt: null },
      },
      include: { user: { select: { email: true, role: true } } },
    });
    if (!session) throw new UnauthorizedException('Session is no longer active');
    return {
      userId: claims.sub,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
      authenticationType: 'access-token',
      scopes: ['*'],
    };
  }

  private async authenticateApiKey(token: string): Promise<AuthPrincipal> {
    const separator = token.indexOf('.');
    if (separator < 5) throw new UnauthorizedException('Malformed API key');
    const keyId = token.slice(0, separator);
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyId,
        secretHash: hashOpaqueToken(token),
        status: 'ACTIVE',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: { status: 'ACTIVE', deletedAt: null },
      },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (!apiKey) throw new UnauthorizedException('Invalid or expired API key');
    await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
    return {
      userId: apiKey.user.id,
      email: apiKey.user.email,
      role: apiKey.user.role,
      sessionId: `api-key:${apiKey.id}`,
      authenticationType: 'api-key',
      scopes: apiKey.scopes,
    };
  }
}
