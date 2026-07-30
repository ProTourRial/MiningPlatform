/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { addDecimalStrings, parsePositiveDecimal } from './difficulty.js';
import type { HashrateShare, HashrateWindowResult } from './types.js';

const DIFFICULTY_HASHES = 4_294_967_296n;
const DECIMAL_PLACES = 12;
const SCALE = 10n ** BigInt(DECIMAL_PLACES);

function scaledDifficulty(value: string): bigint {
  if (value === '0') return 0n;
  const parsed = parsePositiveDecimal(value);
  return (parsed.numerator * SCALE) / parsed.denominator;
}

export function calculateHashrateFromAccumulatedDifficulty(
  accumulatedDifficulty: string,
  shareCount: number,
  windowSeconds: number,
): HashrateWindowResult {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('Hashrate window must be a positive integer');
  }
  if (!Number.isInteger(shareCount) || shareCount < 0) {
    throw new Error('Share count must be a non-negative integer');
  }
  const hashesPerSecond = (scaledDifficulty(accumulatedDifficulty) * DIFFICULTY_HASHES) /
    (SCALE * BigInt(windowSeconds));

  return {
    windowSeconds,
    shareCount,
    accumulatedDifficulty,
    hashesPerSecond: hashesPerSecond.toString(),
  };
}

export function calculateHashrateWindow(
  shares: readonly HashrateShare[],
  windowSeconds: number,
  at = new Date(),
): HashrateWindowResult {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('Hashrate window must be a positive integer');
  }
  const start = at.getTime() - windowSeconds * 1_000;
  const included = shares.filter((share) => share.acceptedAt.getTime() > start && share.acceptedAt.getTime() <= at.getTime());
  const accumulatedDifficulty = included.length === 0
    ? '0'
    : addDecimalStrings(included.map((share) => share.difficulty), DECIMAL_PLACES);
  return calculateHashrateFromAccumulatedDifficulty(accumulatedDifficulty, included.length, windowSeconds);
}
