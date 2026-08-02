/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomBytes } from 'node:crypto';

export function generateAccountToken(bytes = 32): { token: string; tokenHash: string } {
  const token = randomBytes(bytes).toString('base64url');
  return { token, tokenHash: hashAccountToken(token) };
}

export function hashAccountToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
