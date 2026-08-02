/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(input: Buffer): string {
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    output += ALPHABET[Number.parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return output;
}

export function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20): string {
  return encodeBase32(randomBytes(bytes));
}

export function totpAt(secret: string, timestampMs = Date.now(), periodSeconds = 30, digits = 6): string {
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function verifyTotp(code: string, secret: string, options: { now?: Date; window?: number; periodSeconds?: number } = {}): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const now = (options.now ?? new Date()).getTime();
  const window = options.window ?? 1;
  const period = options.periodSeconds ?? 30;
  const actual = Buffer.from(code);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(totpAt(secret, now + offset * period * 1000, period));
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return true;
  }
  return false;
}

export function buildTotpUri(account: string, issuer: string, secret: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
