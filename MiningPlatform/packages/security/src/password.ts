/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const FORMAT = 'scrypt';
const VERSION = 'v1';
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function derive(
  value: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(value, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function positiveInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${field} in password hash`);
  return parsed;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must contain between 12 and 128 characters');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must contain uppercase, lowercase, and numeric characters');
  }
}

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  assertPasswordPolicy(password);
  const derived = await derive(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    FORMAT,
    VERSION,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [format, version, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw, extra] = encodedHash.split('$');
  if (extra !== undefined || format !== FORMAT || version !== VERSION || !saltRaw || !hashRaw) return false;

  try {
    const cost = positiveInteger(costRaw ?? '', 'cost');
    const blockSize = positiveInteger(blockRaw ?? '', 'block size');
    const parallelization = positiveInteger(parallelRaw ?? '', 'parallelization');
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
