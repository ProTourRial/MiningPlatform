/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { decimalToScaledInteger, scaledIntegerToDecimal } from './accounting-service.js';

test('converts contribution decimals to exact scaled integers', () => {
  assert.equal(decimalToScaledInteger('1.25', 12), 1_250_000_000_000n);
  assert.equal(decimalToScaledInteger('0.000000000001', 12), 1n);
  assert.equal(scaledIntegerToDecimal(1_250_000_000_000n, 12), '1.250000000000');
});

test('rejects precision loss in accounting conversions', () => {
  assert.throws(() => decimalToScaledInteger('0.0000000000001', 12), /exceeds supported scale/);
});
