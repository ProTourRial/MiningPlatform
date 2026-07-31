/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
export declare const MAX_UINT256: bigint;
export declare const DIFFICULTY_ONE_TARGET: bigint;
interface Rational {
    numerator: bigint;
    denominator: bigint;
}
export declare function parsePositiveDecimal(value: string): Rational;
export declare function targetFromDifficulty(difficulty: string): bigint;
export declare function targetFromCompactBits(bitsHex: string): bigint;
export declare function formatDifficultyForHash(hashValue: bigint, decimalPlaces?: number): string;
export declare function addDecimalStrings(values: readonly string[], decimalPlaces?: number): string;
export {};
