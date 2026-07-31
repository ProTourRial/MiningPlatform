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


function deriveSecret(
  secret: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(secret, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export interface GeneratedWorkerCredential {
  credentialId: string;
  secret: string;
  secretHash: string;
}

function positiveInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${field} in worker credential hash`);
  return parsed;
}

export async function hashWorkerCredentialSecret(secret: string, salt = randomBytes(16)): Promise<string> {
  if (secret.length < 20) throw new Error('Worker credential secret must contain at least 20 characters');
  const derived = await deriveSecret(secret, salt, KEY_LENGTH, {
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

export async function verifyWorkerCredentialSecret(secret: string, encodedHash: string): Promise<boolean> {
  const [format, version, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw, extra] = encodedHash.split('$');
  if (extra !== undefined || format !== FORMAT || version !== VERSION || !saltRaw || !hashRaw) return false;

  try {
    const cost = positiveInteger(costRaw ?? '', 'cost');
    const blockSize = positiveInteger(blockRaw ?? '', 'block size');
    const parallelization = positiveInteger(parallelRaw ?? '', 'parallelization');
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await deriveSecret(secret, salt, expected.length, {
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

export async function generateWorkerCredential(): Promise<GeneratedWorkerCredential> {
  const credentialId = `wc_${randomBytes(12).toString('base64url')}`;
  const secret = `mpw_${randomBytes(32).toString('base64url')}`;
  return {
    credentialId,
    secret,
    secretHash: await hashWorkerCredentialSecret(secret),
  };
}
