/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { hashSensitiveValue } from '@mining/security';

export interface WorkerAuthRateLimiter {
  isBlocked(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<void>;
  recordSuccess(key: string): Promise<void>;
  close?(): Promise<void>;
}

interface AttemptState {
  failures: number;
  expiresAt: number;
  blockedUntil?: number;
}

interface RedisAuthClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  exists(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  pExpire(key: string, milliseconds: number): Promise<boolean>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
  del(keys: string | readonly string[]): Promise<number>;
  quit(): Promise<unknown>;
}

export class InMemoryWorkerAuthRateLimiter implements WorkerAuthRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(
    private readonly maximumFailures: number,
    private readonly windowMs: number,
    private readonly lockMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async isBlocked(key: string): Promise<boolean> {
    const state = this.attempts.get(key);
    if (!state) return false;
    const now = this.now();
    if (state.blockedUntil && state.blockedUntil > now) return true;
    if (state.expiresAt <= now) this.attempts.delete(key);
    return false;
  }

  async recordFailure(key: string): Promise<void> {
    const now = this.now();
    const existing = this.attempts.get(key);
    const state = existing && existing.expiresAt > now
      ? existing
      : { failures: 0, expiresAt: now + this.windowMs };
    state.failures += 1;
    if (state.failures >= this.maximumFailures) state.blockedUntil = now + this.lockMs;
    this.attempts.set(key, state);
  }

  async recordSuccess(key: string): Promise<void> {
    this.attempts.delete(key);
  }
}

export class RedisWorkerAuthRateLimiter implements WorkerAuthRateLimiter {
  private constructor(
    private readonly client: RedisAuthClient,
    private readonly maximumFailures: number,
    private readonly windowMs: number,
    private readonly lockMs: number,
  ) {}

  static async connect(input: {
    redisUrl: string;
    maximumFailures: number;
    windowMs: number;
    lockMs: number;
  }): Promise<RedisWorkerAuthRateLimiter> {
    const { createClient } = await import('redis');
    const client = createClient({ url: input.redisUrl }) as unknown as RedisAuthClient;
    await client.connect();
    return new RedisWorkerAuthRateLimiter(client, input.maximumFailures, input.windowMs, input.lockMs);
  }

  private keys(key: string): { failure: string; lock: string } {
    const identifier = hashSensitiveValue(key);
    return {
      failure: `stratum:auth:failure:${identifier}`,
      lock: `stratum:auth:lock:${identifier}`,
    };
  }

  async isBlocked(key: string): Promise<boolean> {
    const { lock } = this.keys(key);
    return (await this.client.exists(lock)) > 0;
  }

  async recordFailure(key: string): Promise<void> {
    const { failure, lock } = this.keys(key);
    const failures = await this.client.incr(failure);
    if (failures === 1) await this.client.pExpire(failure, this.windowMs);
    if (failures >= this.maximumFailures) {
      await this.client.set(lock, '1', { PX: this.lockMs });
      await this.client.del(failure);
    }
  }

  async recordSuccess(key: string): Promise<void> {
    const { failure, lock } = this.keys(key);
    await this.client.del([failure, lock]);
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
