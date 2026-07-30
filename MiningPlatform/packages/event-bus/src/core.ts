/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (
  event: DomainEvent<TPayload>,
) => Promise<void>;

export interface EventBus {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(eventName: string, handler: EventHandler<TPayload>): () => void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    const handlers = this.handlers.get(event.eventName);
    if (!handlers) return;

    for (const handler of handlers) {
      await handler(event as DomainEvent);
    }
  }

  subscribe<TPayload>(eventName: string, handler: EventHandler<TPayload>): () => void {
    const handlers = this.handlers.get(eventName) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.handlers.set(eventName, handlers);

    return () => {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) this.handlers.delete(eventName);
    };
  }
}
