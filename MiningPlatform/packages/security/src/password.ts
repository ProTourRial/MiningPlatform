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

function derive(value: string, salt: Buffer, keyLength: number, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      value,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)),
    );
  });
}

function parsePositive(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Invalid password hash parameter');
  return parsed;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 12) throw new Error('Password must contain at least 12 characters');
  if (password.length > 256) throw new Error('Password is too long');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must include uppercase, lowercase, and numeric characters');
  }
}

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  assertPasswordPolicy(password);
  const derived = await derive(password, salt, KEY_LENGTH, COST, BLOCK_SIZE, PARALLELIZATION);
  return [FORMAT, VERSION, COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [format, version, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw, extra] = encodedHash.split('$');
  if (extra !== undefined || format !== FORMAT || version !== VERSION || !saltRaw || !hashRaw) return false;
  try {
    const expected = Buffer.from(hashRaw, 'base64url');
    const salt = Buffer.from(saltRaw, 'base64url');
    if (expected.length !== KEY_LENGTH || salt.length < 16) return false;
    const actual = await derive(
      password,
      salt,
      expected.length,
      parsePositive(costRaw),
      parsePositive(blockRaw),
      parsePositive(parallelRaw),
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
