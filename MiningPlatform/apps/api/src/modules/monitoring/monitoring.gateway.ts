import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { RedisStreamEventConsumer } from '@mining/event-bus';
import {
  MiningEvents,
  type HashrateUpdatedPayload,
  type MinerSessionAuthorizedPayload,
  type MinerSessionDisconnectedPayload,
  type ShareAcceptedPayload,
  type ShareRejectedPayload,
} from '@mining/shared';
import type { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  namespace: '/mining',
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

  async onModuleInit(): Promise<void> {
    this.consumer = await RedisStreamEventConsumer.connect({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      stream: process.env.EVENT_STREAM ?? 'mining:domain-events',
      group: process.env.REALTIME_EVENT_GROUP ?? 'api-realtime-v1',
      consumer: process.env.REALTIME_EVENT_CONSUMER ?? `api-${process.pid}`,
    });
    void this.consumer.run(async (event) => {
      switch (event.eventName) {
        case MiningEvents.hashrateUpdated:
          this.server.emit('hashrate.updated', event.payload as HashrateUpdatedPayload);
          break;
        case MiningEvents.shareLocalAccepted:
          this.server.emit('share.accepted', event.payload as ShareAcceptedPayload);
          break;
        case MiningEvents.shareLocalRejected:
          this.server.emit('share.rejected', event.payload as ShareRejectedPayload);
          break;
        case MiningEvents.sessionAuthorized:
          this.server.emit('worker.online', event.payload as MinerSessionAuthorizedPayload);
          break;
        case MiningEvents.sessionDisconnected:
          this.server.emit('worker.offline', event.payload as MinerSessionDisconnectedPayload);
          break;
        default:
          break;
      }
    }, this.abortController.signal).catch(() => {
      this.abortController.abort();
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.abortController.abort();
    await this.consumer?.close();
  }
}
