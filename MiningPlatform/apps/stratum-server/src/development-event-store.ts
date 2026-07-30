import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DomainEvent } from '@mining/event-bus';

export interface MiningEventStore {
  append(event: DomainEvent): Promise<void>;
}

export class DevelopmentJsonlEventStore implements MiningEventStore {
  constructor(private readonly directory: string) {}

  async append(event: DomainEvent): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await appendFile(join(this.directory, 'mining-events.jsonl'), `${JSON.stringify(event)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
