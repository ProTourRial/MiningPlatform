/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { hashSensitiveValue } from '@mining/security';
import { createClient, type RedisClientType } from 'redis';
import type { RequestSecurityContext } from '../../common/auth/auth.types';

class AuthRateLimitExceeded extends HttpException {
  constructor() { super('Too many requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS); }
}

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
}

const RULES = {
  register: { scope: 'register', limit: 5, windowSeconds: 60 * 60 },
  loginIp: { scope: 'login-ip', limit: 30, windowSeconds: 15 * 60 },
  loginAccount: { scope: 'login-account', limit: 10, windowSeconds: 15 * 60 },
  accountDeliveryIp: { scope: 'account-delivery-ip', limit: 10, windowSeconds: 15 * 60 },
  accountDeliveryTarget: { scope: 'account-delivery-target', limit: 5, windowSeconds: 15 * 60 },
  tokenAction: { scope: 'token-action', limit: 20, windowSeconds: 15 * 60 },
  twoFactor: { scope: 'two-factor', limit: 10, windowSeconds: 5 * 60 },
} as const satisfies Record<string, RateLimitRule>;

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly memory = new Map<string, MemoryCounter>();
  private client?: RedisClientType;
  private connecting?: Promise<void>;

  async assertRegistration(context: RequestSecurityContext): Promise<void> {
    await this.consume(RULES.register, context.ipHash ?? 'unknown');
  }

  async assertLogin(email: string, context: RequestSecurityContext): Promise<void> {
    await Promise.all([
      this.consume(RULES.loginIp, context.ipHash ?? 'unknown'),
      this.consume(RULES.loginAccount, this.targetHash(email)),
    ]);
  }

  async assertAccountDelivery(email: string, context: RequestSecurityContext): Promise<void> {
    await Promise.all([
      this.consume(RULES.accountDeliveryIp, context.ipHash ?? 'unknown'),
      this.consume(RULES.accountDeliveryTarget, this.targetHash(email)),
    ]);
  }

  async assertTokenAction(context: RequestSecurityContext, discriminator: string): Promise<void> {
    await this.consume(RULES.tokenAction, `${context.ipHash ?? 'unknown'}:${this.targetHash(discriminator)}`);
  }

  async assertTwoFactor(context: RequestSecurityContext, userId: string): Promise<void> {
    await this.consume(RULES.twoFactor, `${context.ipHash ?? 'unknown'}:${userId}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit();
  }

  private targetHash(value: string): string {
    return hashSensitiveValue(value.trim().toLowerCase()).slice(0, 32);
  }

  private key(rule: RateLimitRule, discriminator: string): string {
    return `miningplatform:auth-rate:${rule.scope}:${discriminator}`;
  }

  private async consume(rule: RateLimitRule, discriminator: string): Promise<void> {
    const key = this.key(rule, discriminator);
    try {
      const client = await this.redis();
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, rule.windowSeconds);
      if (count > rule.limit) throw new AuthRateLimitExceeded();
      return;
    } catch (error) {
      if (error instanceof AuthRateLimitExceeded) throw error;
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('Authentication rate-limit storage is unavailable');
      }
      this.consumeMemory(key, rule);
    }
  }

  private consumeMemory(key: string, rule: RateLimitRule): void {
    const now = Date.now();
    const existing = this.memory.get(key);
    const counter = !existing || existing.expiresAt <= now
      ? { count: 1, expiresAt: now + rule.windowSeconds * 1000 }
      : { count: existing.count + 1, expiresAt: existing.expiresAt };
    this.memory.set(key, counter);
    if (counter.count > rule.limit) throw new AuthRateLimitExceeded();
    if (this.memory.size > 10_000) {
      for (const [entryKey, value] of this.memory) if (value.expiresAt <= now) this.memory.delete(entryKey);
    }
  }

  private async redis(): Promise<RedisClientType> {
    if (this.client?.isReady) return this.client;
    if (!this.connecting) {
      this.client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
      this.client.on('error', () => undefined);
      this.connecting = this.client.connect().then(() => undefined).finally(() => { this.connecting = undefined; });
    }
    await this.connecting;
    if (!this.client?.isReady) throw new Error('Redis is not ready');
    return this.client;
  }
}
