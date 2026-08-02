/** MiningPlatform — Author: Abia Nugrahanto */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';

@Injectable()
export class AdminService {
  async overview(actorUserId: string) {
    await this.assertSecondFactor(actorUserId);
    const [users, workers, activeSessions, upstreamPools, recentAudit] = await Promise.all([
      prisma.user.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.worker.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.upstreamPool.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.auditLog.findMany({ orderBy: { occurredAt: 'desc' }, take: 25 }),
    ]);
    return { users, workers, activeSessions, upstreamPools, recentAudit, generatedAt: new Date().toISOString() };
  }

  async users(actorUserId: string) {
    await this.assertSecondFactor(actorUserId);
    return prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        security: { select: { totpEnabled: true, lastLoginAt: true, lockedUntil: true } },
        _count: { select: { workers: true, authSessions: true, apiKeys: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateUserStatus(actorUserId: string, targetUserId: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.assertSecondFactor(actorUserId);
    const target = await prisma.user.findFirst({ where: { id: targetUserId, deletedAt: null } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Owner status cannot be changed through this endpoint');
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { status } });
      if (status === 'SUSPENDED') {
        const sessions = await tx.authSession.findMany({
          where: { userId: target.id, revokedAt: null },
          select: { tokenFamilyId: true },
        });
        await tx.authSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'ADMIN_SUSPENDED_USER' },
        });
        const familyIds = [...new Set(sessions.map((session) => session.tokenFamilyId))];
        if (familyIds.length > 0) {
          await tx.authRefreshToken.updateMany({
            where: { familyId: { in: familyIds }, status: { in: ['ACTIVE', 'ROTATED'] } },
            data: { status: 'REVOKED', revokedAt: now },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'ADMIN_USER_STATUS_CHANGED',
          resourceType: 'User',
          resourceId: target.id,
          metadata: { previousStatus: target.status, nextStatus: status },
        },
      });
    });
    return { id: target.id, status };
  }

  private async assertSecondFactor(userId: string): Promise<void> {
    const security = await prisma.userSecurity.findUnique({ where: { userId }, select: { totpEnabled: true } });
    if (!security?.totpEnabled) throw new ForbiddenException('Administrator access requires TOTP 2FA');
  }
}
