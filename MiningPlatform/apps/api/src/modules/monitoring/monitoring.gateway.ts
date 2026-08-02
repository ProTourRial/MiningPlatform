/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { prisma } from '@mining/database';
import { RedisStreamEventConsumer } from '@mining/event-bus';
import { createLogger } from '@mining/logger';
import { verifyAccessToken } from '@mining/security';
import {
  MiningEvents,
  type HashrateUpdatedPayload,
  type MinerSessionAuthorizedPayload,
  type MinerSessionDisconnectedPayload,
  type ShareAcceptedPayload,
  type ShareRejectedPayload,
} from '@mining/shared';
import type { Server, Socket } from 'socket.io';
import { authRuntimeConfig } from '../auth/auth-config.js';
import {
  developmentDashboardEnabled,
  developmentWorkerId,
  validDevelopmentToken,
} from './development-access.js';
import { MonitoringRuntimeState } from './monitoring-runtime-state.js';

const logger = createLogger('api-monitoring-gateway');

@Injectable()
@WebSocketGateway({
  namespace: '/mining',
  path: '/socket.io',
  cors: {
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class MonitoringGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  private server!: Server;

  private readonly abortController = new AbortController();
  private consumer?: RedisStreamEventConsumer;
  private consumerLoop?: Promise<void>;

  constructor(private readonly runtimeState: MonitoringRuntimeState) {}

  async handleConnection(client: Socket): Promise<void> {
    const authToken = typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : undefined;
    const cookieToken = client.handshake.headers.cookie
      ?.split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === 'mp_access')
      ?.slice(1)
      .join('=');
    const token = authToken ?? (cookieToken ? decodeURIComponent(cookieToken) : undefined);
    if (developmentDashboardEnabled() && validDevelopmentToken(token)) {
      await client.join(`worker:${developmentWorkerId()}`);
      return;
    }
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const config = authRuntimeConfig();
      const claims = verifyAccessToken(token, config.jwtSecret, { issuer: config.issuer, audience: config.audience });
      const session = await prisma.authSession.findFirst({
        where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE', deletedAt: null } },
        select: { userId: true },
      });
      if (!session) throw new Error('inactive session');
      const workers = await prisma.worker.findMany({ where: { userId: session.userId, deletedAt: null }, select: { id: true } });
      await client.join(`user:${session.userId}`);
      await Promise.all(workers.map((worker) => client.join(`worker:${worker.id}`)));
    } catch (error) {
      logger.warn({ socketId: client.id, error }, 'realtime authentication failed');
      client.disconnect(true);
    }
  }

  onModuleInit(): void {
    if (process.env.ENABLE_REALTIME_GATEWAY === 'false') {
      this.runtimeState.markDisconnected('Realtime gateway is disabled by configuration');
      return;
    }
    this.consumerLoop = this.runConsumerLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.abortController.abort();
    await this.consumer?.close().catch(() => undefined);
    await this.consumerLoop?.catch(() => undefined);
  }

  private async runConsumerLoop(): Promise<void> {
    let backoffMilliseconds = 1_000;
    while (!this.abortController.signal.aborted) {
      try {
        this.consumer = await RedisStreamEventConsumer.connect({
          url: process.env.REDIS_URL ?? 'redis://localhost:6379',
          stream: process.env.EVENT_STREAM ?? 'mining:domain-events',
          group: process.env.REALTIME_EVENT_GROUP ?? 'api-realtime-v1',
          consumer: process.env.REALTIME_EVENT_CONSUMER ?? `api-${process.pid}`,
          pendingIdleMilliseconds: 30_000,
          maximumDeliveryAttempts: 5,
        });
        this.runtimeState.markConnected();
        backoffMilliseconds = 1_000;
        await this.consumer.run(async (event) => this.emitEvent(event), this.abortController.signal);
      } catch (error) {
        if (this.abortController.signal.aborted) break;
        this.runtimeState.markDisconnected(error);
        logger.error({ error, backoffMilliseconds }, 'realtime Redis consumer failed');
        await this.consumer?.close().catch(() => undefined);
        await sleep(backoffMilliseconds, undefined, { signal: this.abortController.signal }).catch(() => undefined);
        backoffMilliseconds = Math.min(30_000, backoffMilliseconds * 2);
      }
    }
  }

  private async emitEvent(event: { eventName: string; payload: unknown }): Promise<void> {
    this.runtimeState.markEvent();
    switch (event.eventName) {
      case MiningEvents.hashrateUpdated: {
        const payload = event.payload as HashrateUpdatedPayload;
        this.server.to(`worker:${payload.workerId}`).emit('hashrate.updated', payload);
        break;
      }
      case MiningEvents.shareLocalAccepted: {
        const payload = event.payload as ShareAcceptedPayload;
        this.server.to(`worker:${payload.workerId}`).emit('share.accepted', payload);
        break;
      }
      case MiningEvents.shareLocalRejected: {
        const payload = event.payload as ShareRejectedPayload;
        if (payload.workerId) this.server.to(`worker:${payload.workerId}`).emit('share.rejected', payload);
        break;
      }
      case MiningEvents.sessionAuthorized: {
        const payload = event.payload as MinerSessionAuthorizedPayload;
        this.server.to(`worker:${payload.workerId}`).emit('worker.online', payload);
        break;
      }
      case MiningEvents.sessionDisconnected: {
        const payload = event.payload as MinerSessionDisconnectedPayload;
        if (payload.workerId) this.server.to(`worker:${payload.workerId}`).emit('worker.offline', payload);
        break;
      }
      default:
        break;
    }
  }
}
