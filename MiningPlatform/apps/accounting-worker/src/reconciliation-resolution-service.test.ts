/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCorrectedSettlementEvidence } from './reconciliation-resolution-service.js';

const exactEvidence = () => ({
  assetSymbol: 'btc',
  upstreamPoolKey: 'primary-btc',
  periodStart: '2026-08-21T00:00:00Z',
  periodEnd: '2026-08-21T01:00:00Z',
  sourceReference: 'provider-correction-001',
  sourceChecksum: 'a'.repeat(64),
  importIdempotencyKey: 'provider:correction:001',
  grossAtomic: 100_000n,
  upstreamFeeAtomic: 1_000n,
  networkFeeAtomic: 500n,
  receivedAtomic: 98_500n,
  toleranceAtomic: 0n,
});

test('accepts only exact corrected settlement evidence', () => {
  const result = validateCorrectedSettlementEvidence(exactEvidence());
  assert.equal(result.assetSymbol, 'BTC');
  assert.equal(result.periodStart, '2026-08-21T00:00:00.000Z');
  assert.equal(result.internalExpectedAtomic, 98_500n);
  assert.equal(result.varianceAtomic, 0n);
});

test('rejects a corrected source whose received amount still differs', () => {
  assert.throws(
    () =>
      validateCorrectedSettlementEvidence({
        ...exactEvidence(),
        receivedAtomic: 98_499n,
      }),
    /must match exactly/,
  );
});

test('rejects tolerance and non-SHA256 source identity', () => {
  assert.throws(
    () => validateCorrectedSettlementEvidence({ ...exactEvidence(), toleranceAtomic: 1n }),
    /toleranceAtomic=0/,
  );
  assert.throws(
    () => validateCorrectedSettlementEvidence({ ...exactEvidence(), sourceChecksum: 'unsafe' }),
    /SHA-256/,
  );
});
