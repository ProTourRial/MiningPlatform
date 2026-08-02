/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'access';
  roles?: readonly string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  [key: string]: unknown;
}

export interface JwtOptions {
  secret: string;
  issuer: string;
  audience: string;
  expiresInSeconds: number;
  now?: Date;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signature(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>, options: JwtOptions): string {
  if (options.secret.length < 32) throw new Error('JWT secret must contain at least 32 characters');
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({
    ...payload,
    iat: now,
    exp: now + options.expiresInSeconds,
    iss: options.issuer,
    aud: options.audience,
  });
  const input = `${header}.${body}`;
  return `${input}.${signature(input, options.secret).toString('base64url')}`;
}

export function verifyAccessToken(token: string, options: Omit<JwtOptions, 'expiresInSeconds'>): JwtPayload {
  if (options.secret.length < 32) throw new Error('JWT secret must contain at least 32 characters');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed access token');
  const [headerRaw, bodyRaw, signatureRaw] = parts as [string, string, string];
  const input = `${headerRaw}.${bodyRaw}`;
  const actual = Buffer.from(signatureRaw, 'base64url');
  const expected = signature(input, options.secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid access token signature');

  const header = JSON.parse(Buffer.from(headerRaw, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported access token');
  const payload = JSON.parse(Buffer.from(bodyRaw, 'base64url').toString('utf8')) as JwtPayload;
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (payload.type !== 'access' || !payload.sub || !payload.sid || !payload.jti) throw new Error('Invalid access token claims');
  if (!payload.exp || payload.exp <= now) throw new Error('Access token expired');
  if (payload.iat && payload.iat > now + 60) throw new Error('Access token issued in the future');
  if (payload.iss !== options.issuer || payload.aud !== options.audience) throw new Error('Access token audience mismatch');
  return payload;
}
