/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashSensitiveValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSensitiveValue(value: string, key: string): string {
  if (key.length < 16) throw new Error('Sensitive-value HMAC key must contain at least 16 characters');
  return createHmac('sha256', key).update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
