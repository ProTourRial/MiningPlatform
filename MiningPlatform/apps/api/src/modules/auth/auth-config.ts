/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface AuthRuntimeConfig {
  jwtSecret: string;
  encryptionKey: string;
  issuer: string;
  audience: string;
  accessTokenSeconds: number;
  refreshTokenDays: number;
  exposeTestTokens: boolean;
  secureCookies: boolean;
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function authRuntimeConfig(): AuthRuntimeConfig {
  const jwtSecret = process.env.AUTH_JWT_SECRET ?? '';
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY ?? '';
  if (Buffer.byteLength(jwtSecret) < 32) throw new Error('AUTH_JWT_SECRET must contain at least 32 bytes');
  if (Buffer.from(encryptionKey, 'base64url').length !== 32) {
    throw new Error('AUTH_ENCRYPTION_KEY must be a 32-byte base64url value');
  }
  return {
    jwtSecret,
    encryptionKey,
    issuer: process.env.AUTH_TOKEN_ISSUER ?? 'mining-platform',
    audience: process.env.AUTH_TOKEN_AUDIENCE ?? 'mining-platform-control-plane',
    accessTokenSeconds: boundedInteger('AUTH_ACCESS_TOKEN_SECONDS', 900, 60, 3_600),
    refreshTokenDays: boundedInteger('AUTH_REFRESH_TOKEN_DAYS', 30, 1, 90),
    exposeTestTokens: process.env.NODE_ENV !== 'production' || process.env.AUTH_EXPOSE_TEST_TOKENS === 'true',
    secureCookies: process.env.NODE_ENV === 'production' && process.env.AUTH_SECURE_COOKIES !== 'false',
  };
}
