/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface RateEntry { count: number; resetAt: number }

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private static readonly entries = new Map<string, RateEntry>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      route?: { path?: string };
    }>();
    const now = Date.now();
    const key = `${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}:${request.route?.path ?? 'auth'}`;
    const existing = AuthRateLimitGuard.entries.get(key);
    const entry = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : existing;
    entry.count += 1;
    AuthRateLimitGuard.entries.set(key, entry);
    if (entry.count > 10) {
      throw new HttpException('Too many authentication attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (AuthRateLimitGuard.entries.size > 10_000) {
      for (const [candidate, value] of AuthRateLimitGuard.entries) {
        if (value.resetAt <= now) AuthRateLimitGuard.entries.delete(candidate);
      }
    }
    return true;
  }
}
