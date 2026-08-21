/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { feePercentFromPartsPerMillion } from './modules/fees/fee-policy.js';

test('converts parts per million to exact decimal percent strings', () => {
  assert.equal(feePercentFromPartsPerMillion(0), '0');
  assert.equal(feePercentFromPartsPerMillion(5000), '0.5');
  assert.equal(feePercentFromPartsPerMillion(3750), '0.375');
  assert.equal(feePercentFromPartsPerMillion(12_500), '1.25');
  assert.equal(feePercentFromPartsPerMillion(1_000_000), '100');
});

test('rejects invalid fee parts per million', () => {
  assert.throws(() => feePercentFromPartsPerMillion(-1), /between 0 and 1000000/);
  assert.throws(() => feePercentFromPartsPerMillion(1_000_001), /between 0 and 1000000/);
  assert.throws(() => feePercentFromPartsPerMillion(0.5), /integer/);
});
