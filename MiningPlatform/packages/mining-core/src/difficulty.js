/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
export const MAX_UINT256 = (1n << 256n) - 1n;
export const DIFFICULTY_ONE_TARGET = BigInt('0x00000000ffff0000000000000000000000000000000000000000000000000000');
export function parsePositiveDecimal(value) {
    const normalized = value.trim();
    const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
    if (!match)
        throw new Error('Difficulty must be a positive decimal string');
    const whole = match[1] ?? '0';
    const fraction = match[2] ?? '';
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole}${fraction}`);
    if (numerator <= 0n)
        throw new Error('Difficulty must be greater than zero');
    return { numerator, denominator };
}
function parseNonNegativeDecimal(value) {
    const normalized = value.trim();
    const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
    if (!match)
        throw new Error('Value must be a non-negative decimal string');
    const whole = match[1] ?? '0';
    const fraction = match[2] ?? '';
    const denominator = 10n ** BigInt(fraction.length);
    return { numerator: BigInt(`${whole}${fraction}`), denominator };
}
export function targetFromDifficulty(difficulty) {
    const { numerator, denominator } = parsePositiveDecimal(difficulty);
    const target = (DIFFICULTY_ONE_TARGET * denominator) / numerator;
    return target > MAX_UINT256 ? MAX_UINT256 : target;
}
export function targetFromCompactBits(bitsHex) {
    if (!/^[0-9a-f]{8}$/i.test(bitsHex))
        throw new Error('Compact bits must be four bytes');
    const compact = Number.parseInt(bitsHex, 16) >>> 0;
    const exponent = compact >>> 24;
    const negative = (compact & 0x00800000) !== 0;
    const mantissa = compact & 0x007fffff;
    if (negative || mantissa === 0)
        throw new Error('Compact target is invalid');
    const target = exponent <= 3
        ? BigInt(mantissa) >> BigInt(8 * (3 - exponent))
        : BigInt(mantissa) << BigInt(8 * (exponent - 3));
    if (target <= 0n || target > MAX_UINT256)
        throw new Error('Compact target is outside uint256 range');
    return target;
}
export function formatDifficultyForHash(hashValue, decimalPlaces = 12) {
    if (hashValue <= 0n)
        return 'infinite';
    const scale = 10n ** BigInt(decimalPlaces);
    const scaled = (DIFFICULTY_ONE_TARGET * scale) / hashValue;
    const whole = scaled / scale;
    const fraction = (scaled % scale).toString().padStart(decimalPlaces, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
export function addDecimalStrings(values, decimalPlaces = 12) {
    const scale = 10n ** BigInt(decimalPlaces);
    let total = 0n;
    for (const value of values) {
        const { numerator, denominator } = parseNonNegativeDecimal(value);
        total += (numerator * scale) / denominator;
    }
    const whole = total / scale;
    const fraction = (total % scale).toString().padStart(decimalPlaces, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
//# sourceMappingURL=difficulty.js.map