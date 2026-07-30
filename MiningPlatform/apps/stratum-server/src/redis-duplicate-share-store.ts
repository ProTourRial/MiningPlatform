/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createClient, type RedisClientType } from 'redis';
import type { DuplicateShareStore } from '@mining/mining-core';

export class RedisDuplicateShareStore implements DuplicateShareStore {
  private readonly client: RedisClientType;
  private readonly prefix: string;

  private constructor(url: string, prefix: string) {
    this.client = createClient({ url });
    this.prefix = prefix;
  }

  static async connect(url: string, prefix = 'mining:share-fingerprint:'): Promise<RedisDuplicateShareStore> {
    const store = new RedisDuplicateShareStore(url, prefix);
    await store.client.connect();
    return store;
  }

  async reserve(fingerprint: string, expiresAt: Date): Promise<boolean> {
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1_000));
    const result = await this.client.set(`${this.prefix}${fingerprint}`, '1', { NX: true, EX: ttlSeconds });
    return result === 'OK';
  }

  async release(fingerprint: string): Promise<void> {
    await this.client.del(`${this.prefix}${fingerprint}`);
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
