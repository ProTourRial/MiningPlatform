/** MiningPlatform — Author: Abia Nugrahanto */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';
import { generateOpaqueToken, hashOpaqueToken } from '@mining/security';
import type { CreateApiKeyDto } from './api-keys.dto.js';

const ALLOWED_SCOPES = new Set(['workers:read', 'workers:write', 'dashboard:read', 'profile:read', 'notifications:write']);

@Injectable()
export class ApiKeysService {
  list(userId: string) {
    return prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, keyId: true, name: true, scopes: true, status: true, expiresAt: true, lastUsedAt: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateApiKeyDto) {
    const scopes = [...new Set(dto.scopes)];
    if (scopes.length === 0 || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
      throw new BadRequestException(`Allowed scopes: ${[...ALLOWED_SCOPES].join(', ')}`);
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('expiresAt must be in the future');
    const keyId = generateOpaqueToken('mpk', 12);
    const secret = generateOpaqueToken('mps', 32);
    const token = `${keyId}.${secret}`;
    const apiKey = await prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: { userId, keyId, secretHash: hashOpaqueToken(token), name: dto.name.trim(), scopes, expiresAt },
        select: { id: true, keyId: true, name: true, scopes: true, status: true, expiresAt: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: { actorUserId: userId, action: 'API_KEY_CREATED', resourceType: 'ApiKey', resourceId: created.id, metadata: { scopes } },
      });
      return created;
    });
    return { ...apiKey, token };
  }

  async revoke(userId: string, id: string) {
    const result = await prisma.apiKey.updateMany({
      where: { id, userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Active API key not found');
    await prisma.auditLog.create({ data: { actorUserId: userId, action: 'API_KEY_REVOKED', resourceType: 'ApiKey', resourceId: id } });
    return { revoked: true };
  }
}
