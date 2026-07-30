/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { open, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma, type Prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus/core';
import type { MiningEventStore } from './event-store.js';

export class DevelopmentJsonlEventStore implements MiningEventStore {
  constructor(private readonly directory: string) {}

  async append(event: DomainEvent): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = await open(join(this.directory, 'mining-events.jsonl'), 'a', 0o600);
    try {
      await file.write(`${JSON.stringify(event)}\n`, undefined, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class PostgresOutboxEventStore implements MiningEventStore {
  async append(event: DomainEvent): Promise<void> {
    const payload = JSON.parse(JSON.stringify(event.payload)) as Prisma.InputJsonValue;
    try {
      await prisma.outboxEvent.create({
        data: {
          eventId: event.eventId,
          eventName: event.eventName,
          eventVersion: event.eventVersion,
          producer: event.producer,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          correlationId: event.correlationId,
          causationId: event.causationId,
          idempotencyKey: event.idempotencyKey,
          payload,
          occurredAt: new Date(event.occurredAt),
          status: 'PENDING',
          availableAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await prisma.outboxEvent.findUnique({ where: { eventId: event.eventId } });
      if (existing?.idempotencyKey === event.idempotencyKey && existing.eventName === event.eventName) return;
      throw error;
    }
  }
}
