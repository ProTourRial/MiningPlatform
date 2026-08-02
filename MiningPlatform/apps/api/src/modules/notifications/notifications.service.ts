/** MiningPlatform — Author: Abia Nugrahanto */
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@mining/database';
import { encryptSecret, hashSensitiveValue } from '@mining/security';
import { authRuntimeConfig } from '../auth/auth-config.js';
import type { CreateNotificationChannelDto } from './notifications.dto.js';

@Injectable()
export class NotificationsService {
  list(userId: string) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Notification not found');
    return { read: true };
  }

  async channels(userId: string) {
    const channels = await prisma.notificationChannel.findMany({
      where: { userId },
      select: { id: true, type: true, status: true, events: true, verifiedAt: true, createdAt: true, updatedAt: true, destinationEncrypted: true },
      orderBy: { createdAt: 'desc' },
    });
    return channels.map(({ destinationEncrypted, ...channel }) => ({
      ...channel,
      destinationFingerprint: hashSensitiveValue(destinationEncrypted).slice(0, 12),
    }));
  }

  async createChannel(userId: string, dto: CreateNotificationChannelDto) {
    const destinationEncrypted = encryptSecret(dto.destination.trim(), authRuntimeConfig().encryptionKey);
    const channel = await prisma.$transaction(async (tx) => {
      const created = await tx.notificationChannel.create({
        data: {
          userId,
          type: dto.type,
          destinationEncrypted,
          events: [...new Set(dto.events)],
        },
        select: { id: true, type: true, status: true, events: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: { actorUserId: userId, action: 'NOTIFICATION_CHANNEL_CREATED', resourceType: 'NotificationChannel', resourceId: created.id, metadata: { type: dto.type } },
      });
      return created;
    });
    return { ...channel, verificationRequired: true };
  }

  async disableChannel(userId: string, channelId: string) {
    const result = await prisma.notificationChannel.updateMany({
      where: { id: channelId, userId, status: { not: 'DISABLED' } },
      data: { status: 'DISABLED' },
    });
    if (result.count === 0) throw new NotFoundException('Active notification channel not found');
    await prisma.auditLog.create({
      data: { actorUserId: userId, action: 'NOTIFICATION_CHANNEL_DISABLED', resourceType: 'NotificationChannel', resourceId: channelId },
    });
    return { disabled: true };
  }
}
