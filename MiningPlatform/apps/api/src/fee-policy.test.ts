/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { feePercentFromBasisPoints } from './modules/fees/fee-policy.js';

test('converts basis points to exact decimal percent strings', () => {
  assert.equal(feePercentFromBasisPoints(0), '0');
  assert.equal(feePercentFromBasisPoints(50), '0.5');
  assert.equal(feePercentFromBasisPoints(125), '1.25');
  assert.equal(feePercentFromBasisPoints(10_000), '100');
});

test('rejects invalid fee basis points', () => {
  assert.throws(() => feePercentFromBasisPoints(-1), /between 0 and 10000/);
  assert.throws(() => feePercentFromBasisPoints(10_001), /between 0 and 10000/);
  assert.throws(() => feePercentFromBasisPoints(0.5), /integer/);
});
