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
}

export class RedisStreamEventConsumer {
  private readonly client: RedisClientType;
  private readonly stream: string;
  private readonly batchSize: number;
  private readonly blockMilliseconds: number;
  private readonly options: RedisStreamConsumerOptions;

  private constructor(options: RedisStreamConsumerOptions) {
    this.options = options;
    this.client = createClient({ url: options.url });
    this.stream = options.stream ?? 'mining:domain-events';
    this.batchSize = options.batchSize ?? 100;
    this.blockMilliseconds = options.blockMilliseconds ?? 5_000;
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
      const responses = await this.client.xReadGroup(
        this.options.group,
        this.options.consumer,
        { key: this.stream, id: '>' },
        { COUNT: this.batchSize, BLOCK: this.blockMilliseconds },
      );
      if (!responses) continue;

      for (const response of responses) {
        for (const message of response.messages) {
          const raw = message.message.event;
          if (!raw) {
            await this.client.xAck(this.stream, this.options.group, message.id);
            continue;
          }
          const event = JSON.parse(raw) as DomainEvent;
          await handler(event);
          await this.client.xAck(this.stream, this.options.group, message.id);
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
