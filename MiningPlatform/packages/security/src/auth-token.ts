/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  role: 'USER' | 'ADMIN' | 'OWNER';
  email: string;
  type: 'access';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signature(input: string, secret: string): Buffer {
  if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_JWT_SECRET must contain at least 32 bytes');
  return createHmac('sha256', secret).update(input).digest();
}

export function signAccessToken(
  input: Omit<AccessTokenClaims, 'type' | 'iat' | 'exp'>,
  secret: string,
  lifetimeSeconds: number,
  now = Math.floor(Date.now() / 1_000),
): string {
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 3_600) {
    throw new Error('Access-token lifetime must be between 60 and 3600 seconds');
  }
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson({ ...input, type: 'access', iat: now, exp: now + lifetimeSeconds });
  const body = `${header}.${payload}`;
  return `${body}.${signature(body, secret).toString('base64url')}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  expected: { issuer: string; audience: string },
  now = Math.floor(Date.now() / 1_000),
): AccessTokenClaims {
  const [headerRaw, payloadRaw, signatureRaw, extra] = token.split('.');
  if (extra !== undefined || !headerRaw || !payloadRaw || !signatureRaw) throw new Error('Malformed access token');

  const body = `${headerRaw}.${payloadRaw}`;
  const actual = Buffer.from(signatureRaw, 'base64url');
  const expectedSignature = signature(body, secret);
  if (actual.length !== expectedSignature.length || !timingSafeEqual(actual, expectedSignature)) {
    throw new Error('Invalid access-token signature');
  }

  const header = JSON.parse(Buffer.from(headerRaw, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported access-token header');
  const claims = JSON.parse(Buffer.from(payloadRaw, 'base64url').toString('utf8')) as AccessTokenClaims;
  if (
    claims.type !== 'access' ||
    typeof claims.sub !== 'string' ||
    typeof claims.sid !== 'string' ||
    typeof claims.email !== 'string' ||
    !['USER', 'ADMIN', 'OWNER'].includes(claims.role) ||
    claims.iss !== expected.issuer ||
    claims.aud !== expected.audience ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= now ||
    claims.iat > now + 60
  ) {
    throw new Error('Invalid or expired access-token claims');
  }
  return claims;
}

export function generateOpaqueToken(prefix: string, bytes = 32): string {
  if (!/^[a-z][a-z0-9_]{1,15}$/i.test(prefix)) throw new Error('Invalid token prefix');
  return `${prefix}_${randomBytes(bytes).toString('base64url')}`;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
