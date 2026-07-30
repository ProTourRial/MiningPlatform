/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createClient, type RedisClientType } from 'redis';
import type { DomainEvent, EventBus, EventHandler } from './core.js';
import { InMemoryEventBus } from './core.js';

export interface RedisStreamOptions {
  url: string;
  stream?: string;
  maximumLength?: number;
}

export class RedisStreamEventBus implements EventBus {
  private readonly local = new InMemoryEventBus();
  private readonly client: RedisClientType;
  private readonly stream: string;
  private readonly maximumLength: number;

  private constructor(options: RedisStreamOptions) {
    this.client = createClient({ url: options.url });
    this.stream = options.stream ?? 'mining:domain-events';
    this.maximumLength = options.maximumLength ?? 1_000_000;
  }

  static async connect(options: RedisStreamOptions): Promise<RedisStreamEventBus> {
    const bus = new RedisStreamEventBus(options);
    await bus.client.connect();
    return bus;
  }

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    await this.client.xAdd(
      this.stream,
      '*',
      { event: JSON.stringify(event) },
      { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: this.maximumLength } },
    );
    await this.local.publish(event);
  }

  subscribe<TPayload>(eventName: string, handler: EventHandler<TPayload>): () => void {
    return this.local.subscribe(eventName, handler);
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}

export interface RedisStreamConsumerOptions extends RedisStreamOptions {
  group: string;
  consumer: string;
  batchSize?: number;
  blockMilliseconds?: number;
  pendingIdleMilliseconds?: number;
  maximumDeliveryAttempts?: number;
  deadLetterStream?: string;
}

interface StreamMessage {
  id: string;
  event?: string;
}

function parseFieldList(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (let index = 0; index + 1 < value.length; index += 2) {
    result[String(value[index])] = String(value[index + 1]);
  }
  return result;
}

function parseAutoClaim(value: unknown): StreamMessage[] {
  if (!Array.isArray(value) || !Array.isArray(value[1])) return [];
  return value[1].flatMap((entry): StreamMessage[] => {
    if (!Array.isArray(entry) || entry.length < 2) return [];
    const fields = parseFieldList(entry[1]);
    return [{ id: String(entry[0]), event: fields.event }];
  });
}

export class RedisStreamEventConsumer {
  private readonly client: RedisClientType;
  private readonly stream: string;
  private readonly batchSize: number;
  private readonly blockMilliseconds: number;
  private readonly pendingIdleMilliseconds: number;
  private readonly maximumDeliveryAttempts: number;
  private readonly deadLetterStream: string;
  private readonly attemptsKey: string;
  private readonly options: RedisStreamConsumerOptions;

  private constructor(options: RedisStreamConsumerOptions) {
    this.options = options;
    this.client = createClient({ url: options.url });
    this.stream = options.stream ?? 'mining:domain-events';
    this.batchSize = options.batchSize ?? 100;
    this.blockMilliseconds = options.blockMilliseconds ?? 5_000;
    this.pendingIdleMilliseconds = options.pendingIdleMilliseconds ?? 30_000;
    this.maximumDeliveryAttempts = options.maximumDeliveryAttempts ?? 5;
    this.deadLetterStream = options.deadLetterStream ?? `${this.stream}:dead-letter`;
    this.attemptsKey = `${this.stream}:${options.group}:delivery-attempts`;
  }

  static async connect(options: RedisStreamConsumerOptions): Promise<RedisStreamEventConsumer> {
    const consumer = new RedisStreamEventConsumer(options);
    await consumer.client.connect();
    try {
      await consumer.client.xGroupCreate(consumer.stream, options.group, '0', { MKSTREAM: true });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error;
    }
    return consumer;
  }

  async run(handler: (event: DomainEvent) => Promise<void>, signal?: AbortSignal): Promise<void> {
    while (!signal?.aborted) {
      await this.recoverPending(handler);
      const responses = await this.client.xReadGroup(
        this.options.group,
        this.options.consumer,
        { key: this.stream, id: '>' },
        { COUNT: this.batchSize, BLOCK: this.blockMilliseconds },
      );
      if (!responses) continue;

      for (const response of responses) {
        for (const message of response.messages) {
          await this.processMessage({ id: message.id, event: message.message.event }, handler);
        }
      }
    }
  }

  private async recoverPending(handler: (event: DomainEvent) => Promise<void>): Promise<void> {
    const response = await this.client.sendCommand([
      'XAUTOCLAIM',
      this.stream,
      this.options.group,
      this.options.consumer,
      String(this.pendingIdleMilliseconds),
      '0-0',
      'COUNT',
      String(this.batchSize),
    ]);
    for (const message of parseAutoClaim(response)) {
      await this.processMessage(message, handler);
    }
  }

  private async processMessage(
    message: StreamMessage,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    if (!message.event) {
      await this.deadLetter(message, 'MISSING_EVENT_FIELD', 1);
      return;
    }

    let event: DomainEvent;
    try {
      event = JSON.parse(message.event) as DomainEvent;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid event JSON';
      await this.deadLetter(message, `MALFORMED_EVENT: ${reason}`, 1);
      return;
    }

    try {
      await handler(event);
      await this.acknowledge(message.id);
    } catch (error) {
      const attempts = await this.client.hIncrBy(this.attemptsKey, message.id, 1);
      if (attempts >= this.maximumDeliveryAttempts) {
        const reason = error instanceof Error ? error.message : 'Event handler failed';
        await this.deadLetter(message, reason, attempts);
      }
    }
  }

  private async deadLetter(message: StreamMessage, reason: string, attempts: number): Promise<void> {
    await this.client.xAdd(this.deadLetterStream, '*', {
      originalStream: this.stream,
      consumerGroup: this.options.group,
      messageId: message.id,
      attempts: String(attempts),
      reason: reason.slice(0, 2_000),
      event: message.event ?? '',
      failedAt: new Date().toISOString(),
    });
    await this.acknowledge(message.id);
  }

  private async acknowledge(messageId: string): Promise<void> {
    await this.client.xAck(this.stream, this.options.group, messageId);
    await this.client.hDel(this.attemptsKey, messageId);
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
