/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@mining/database';
import { createLogger } from '@mining/logger';
import { createClient, type RedisClientType } from 'redis';

const logger = createLogger('api-health');

export interface DependencyHealth {
  status: 'ok' | 'error';
  latencyMs: number;
  message?: string;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private redis?: RedisClientType;

  async live() {
    return {
      status: 'ok' as const,
      service: 'api',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const status = postgres.status === 'ok' && redis.status === 'ok' ? 'ok' : 'error';
    return {
      status,
      service: 'api',
      dependencies: { postgres, redis },
      timestamp: new Date().toISOString(),
    };
  }


  async domain() {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1_000);
    const [pendingOutbox, staleOutbox, failedOutbox, upstreamPools, activeSessions, lockedCredentials] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      prisma.outboxEvent.count({ where: { status: { in: ['PENDING', 'PROCESSING'] }, availableAt: { lt: staleThreshold } } }),
      prisma.outboxEvent.count({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } } }),
      prisma.upstreamPool.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.minerSession.count({ where: { status: { in: ['AUTHORIZED', 'ACTIVE', 'DEGRADED'] } } }),
      prisma.workerCredential.count({ where: { lockedUntil: { gt: new Date() } } }),
    ]);
    const degraded = staleOutbox > 0 || failedOutbox > 0 || upstreamPools.some((pool) => ['DEGRADED', 'CIRCUIT_OPEN', 'OFFLINE'].includes(pool.status));
    return {
      status: degraded ? 'degraded' : 'ok',
      outbox: { pending: pendingOutbox, stale: staleOutbox, failedOrDeadLetter: failedOutbox },
      upstreamPools,
      mining: { activeSessions },
      security: { lockedWorkerCredentials: lockedCredentials },
      accounting: { enabled: false, payoutsEnabled: process.env.PAYOUTS_ENABLED === 'true' },
      timestamp: new Date().toISOString(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.isOpen) await this.redis.quit();
    await prisma.$disconnect();
  }

  private async checkPostgres(): Promise<DependencyHealth> {
    const startedAt = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      logger.error({ error }, 'PostgreSQL readiness check failed');
      return {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        message: 'PostgreSQL unavailable',
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const startedAt = Date.now();
    try {
      if (!this.redis) {
        this.redis = createClient({
          url: process.env.REDIS_URL ?? 'redis://localhost:6379',
          socket: { connectTimeout: 1_500, reconnectStrategy: false },
        });
        this.redis.on('error', () => undefined);
      }
      if (!this.redis.isOpen) await this.redis.connect();
      await this.redis.ping();
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      if (this.redis?.isOpen) await this.redis.disconnect();
      logger.error({ error }, 'Redis readiness check failed');
      return {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        message: 'Redis unavailable',
      };
    }
  }
}
