/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';
import type { UpdateProfileDto } from './users.dto.js';

@Injectable()
export class UsersService {
  async me(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        accountType: true,
        emailVerifiedAt: true,
        createdAt: true,
        profile: true,
        security: { select: { totpEnabled: true, lastLoginAt: true, passwordChangedAt: true } },
        miningAccounts: {
          where: { deletedAt: null },
          select: { id: true, username: true, enabled: true, rewardMethod: true, platformFeePercent: true, asset: { select: { symbol: true, algorithm: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...user,
      miningAccounts: user.miningAccounts.map((account) => ({
        ...account,
        platformFeePercent: account.platformFeePercent.toString(),
      })),
    };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    await prisma.$transaction(async (tx) => {
      if (dto.displayName !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { displayName: dto.displayName.trim() } });
      }
      await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          locale: dto.locale,
          timezone: dto.timezone,
          avatarUrl: dto.avatarUrl,
          preferences: dto.preferences as Prisma.InputJsonValue | undefined,
        },
        update: {
          locale: dto.locale,
          timezone: dto.timezone,
          avatarUrl: dto.avatarUrl,
          preferences: dto.preferences as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.auditLog.create({
        data: { actorUserId: userId, action: 'USER_PROFILE_UPDATED', resourceType: 'User', resourceId: userId },
      });
    });
    return this.me(userId);
  }

  async sessions(userId: string) {
    return prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, ipHash: true, userAgentHash: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const now = new Date();
    const revoked = await prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findFirst({
        where: { id: sessionId, userId, revokedAt: null },
        select: { id: true, tokenFamilyId: true },
      });
      if (!session) return false;
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now, revokeReason: 'USER_SESSION_REVOKED' },
      });
      await tx.authRefreshToken.updateMany({
        where: { familyId: session.tokenFamilyId, status: { in: ['ACTIVE', 'ROTATED'] } },
        data: { status: 'REVOKED', revokedAt: now },
      });
      return true;
    });
    if (!revoked) throw new NotFoundException('Active session not found');
    return { revoked: true };
  }
}
