/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { Request } from 'express';
import { hmacSensitiveValue, hashSensitiveValue } from '@mining/security';
import type { RequestSecurityContext } from './auth.types';

function normalizedIp(request: Request): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  const raw = first?.trim() || request.ip || request.socket.remoteAddress;
  return raw?.replace(/^::ffff:/, '');
}

export function requestSecurityContext(request: Request): RequestSecurityContext {
  const hmacKey = process.env.SENSITIVE_VALUE_HMAC_KEY ?? 'development-sensitive-hmac-key-change-me';
  if (process.env.NODE_ENV === 'production' && hmacKey.includes('change-me')) {
    throw new Error('SENSITIVE_VALUE_HMAC_KEY must be configured in production');
  }
  const ip = normalizedIp(request);
  const userAgent = request.headers['user-agent'];
  return {
    ipHash: ip ? hmacSensitiveValue(ip, hmacKey) : undefined,
    userAgent,
    userAgentHash: userAgent ? hashSensitiveValue(userAgent) : undefined,
    countryCode: typeof request.headers['cf-ipcountry'] === 'string' ? request.headers['cf-ipcountry'] : undefined,
    city: typeof request.headers['x-mining-city'] === 'string' ? request.headers['x-mining-city'] : undefined,
    requestId: typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
  };
}
