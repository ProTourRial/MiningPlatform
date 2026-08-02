/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });
}

export function hashBackupCode(code: string, pepper: string): string {
  if (pepper.length < 32) throw new Error('Backup-code pepper must contain at least 32 characters');
  return createHmac('sha256', pepper).update(code.replace(/\s+/g, '').toUpperCase()).digest('hex');
}

export function findBackupCodeIndex(code: string, hashes: readonly string[], pepper: string): number {
  const candidate = Buffer.from(hashBackupCode(code, pepper));
  return hashes.findIndex((hash) => {
    const expected = Buffer.from(hash);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
