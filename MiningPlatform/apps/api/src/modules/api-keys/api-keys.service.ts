/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';
import { hashAccountToken, randomToken } from '@mining/security';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../auth/authorization.service';
import type { CreateApiKeyDto } from './dto/api-keys.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly audit: AuditService, private readonly authorization: AuthorizationService) {}

  async list(principal: AuthPrincipal) {
    return prisma.apiKey.findMany({
      where: { userId: principal.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, status: true, permissions: true, expiresAt: true, lastUsedAt: true, createdAt: true, revokedAt: true },
    });
  }

  async create(principal: AuthPrincipal, input: CreateApiKeyDto) {
    const authorization = await this.authorization.getAuthorization(principal.userId);
    const allowed = authorization.permissions.includes('*')
      ? input.permissions
      : input.permissions.filter((permission) => authorization.permissions.includes(permission));
    if (allowed.length !== input.permissions.length) throw new BadRequestException('API key permissions exceed the current user permissions');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('API key expiry must be in the future');
    const prefix = `mpk_${randomToken(8)}`;
    const secret = randomToken(40);
    const raw = `${prefix}.${secret}`;
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: principal.userId,
        name: input.name.trim(),
        prefix,
        secretHash: hashAccountToken(raw),
        permissions: allowed,
        expiresAt,
        createdBy: principal.userId,
      },
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'CREDENTIAL', action: 'api-key.created', resourceType: 'ApiKey', resourceId: apiKey.id, sessionId: principal.sessionId, metadata: { prefix, permissions: allowed, expiresAt: expiresAt?.toISOString() } });
    return { id: apiKey.id, name: apiKey.name, prefix, apiKey: raw, permissions: allowed, expiresAt, warning: 'API key hanya ditampilkan sekali.' };
  }

  async revoke(principal: AuthPrincipal, id: string) {
    const key = await prisma.apiKey.findFirst({ where: { id, userId: principal.userId } });
    if (!key) throw new NotFoundException('API key not found');
    await prisma.apiKey.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await this.audit.record({ actorUserId: principal.userId, category: 'CREDENTIAL', action: 'api-key.revoked', resourceType: 'ApiKey', resourceId: id, sessionId: principal.sessionId, metadata: { prefix: key.prefix } });
    return { revoked: true, id };
  }
}
