import { addDecimalStrings, parsePositiveDecimal } from './difficulty.js';
import type { HashrateShare, HashrateWindowResult } from './types.js';

const DIFFICULTY_HASHES = 4_294_967_296n;

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
  const decimalPlaces = 12;
  const scale = 10n ** BigInt(decimalPlaces);
  let scaledDifficulty = 0n;
  for (const share of included) {
    const parsed = parsePositiveDecimal(share.difficulty);
    scaledDifficulty += (parsed.numerator * scale) / parsed.denominator;
  }
  const hashesPerSecond = (scaledDifficulty * DIFFICULTY_HASHES) / (scale * BigInt(windowSeconds));

  return {
    windowSeconds,
    shareCount: included.length,
    accumulatedDifficulty: included.length === 0 ? '0' : addDecimalStrings(included.map((share) => share.difficulty), decimalPlaces),
    hashesPerSecond: hashesPerSecond.toString(),
  };
}
