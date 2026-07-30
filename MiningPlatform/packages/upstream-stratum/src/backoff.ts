/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export function exponentialBackoffMs(
  attempt: number,
  baseMs = 250,
  maximumMs = 30_000,
  jitterRatio = 0,
  random = Math.random,
): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error('Backoff attempt must be a non-negative integer');
  const raw = Math.min(maximumMs, baseMs * 2 ** attempt);
  if (jitterRatio <= 0) return raw;
  const spread = raw * Math.min(jitterRatio, 1);
  return Math.max(0, Math.round(raw - spread + random() * spread * 2));
}
