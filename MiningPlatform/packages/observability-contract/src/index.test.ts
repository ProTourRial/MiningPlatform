/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMetricDefinition,
  listMetricsByDomain,
  OBSERVABILITY_METRICS,
  validateMetricLabels,
} from './index.js';

test('catalog contains payout, ledger, and RandomX metric domains', () => {
  assert.ok(listMetricsByDomain('payout').length >= 4);
  assert.ok(listMetricsByDomain('ledger').length >= 3);
  assert.ok(listMetricsByDomain('randomx').length >= 4);
});

test('required P0 metric names are present with expected units', () => {
  const expected = new Map([
    ['miningplatform_payout_eligibility_failures_total', 'count'],
    ['miningplatform_payout_reservation_conflicts_total', 'count'],
    ['miningplatform_payout_broadcast_failures_total', 'count'],
    ['miningplatform_ledger_reconciliation_delta_atomic', 'atomic'],
    ['miningplatform_randomx_validation_latency_seconds', 'seconds'],
    ['miningplatform_template_age_seconds', 'seconds'],
    ['miningplatform_stratum_share_rejection_rate', 'ratio'],
    ['miningplatform_wallet_balance_variance_atomic', 'atomic'],
  ]);

  for (const [name, unit] of expected) {
    const metric = getMetricDefinition(name);
    assert.ok(metric, `missing metric ${name}`);
    assert.equal(metric.unit, unit);
    assert.equal(metric.public, false);
  }
});

test('metric labels reject high-cardinality or unknown dimensions', () => {
  const valid = validateMetricLabels('miningplatform_payout_eligibility_failures_total', {
    asset: 'BTC',
    network: 'BTC',
    reason: 'below_minimum',
  });
  assert.deepEqual(valid, { valid: true });

  const requestId = validateMetricLabels('miningplatform_payout_eligibility_failures_total', {
    asset: 'BTC',
    network: 'BTC',
    reason: 'below_minimum',
    request_id: 'req-001',
  });
  assert.deepEqual(requestId, { valid: false, reason: 'unknown-label' });
});

test('metric label validator enforces complete allowlisted label sets', () => {
  const missing = validateMetricLabels('miningplatform_randomx_validation_latency_seconds', {
    result: 'accepted',
  });
  assert.deepEqual(missing, { valid: false, reason: 'missing-label' });

  const tooLong = validateMetricLabels('miningplatform_randomx_validation_latency_seconds', {
    result: 'accepted',
    region: 'r'.repeat(65),
  });
  assert.deepEqual(tooLong, { valid: false, reason: 'invalid-label-value' });
});

test('metric catalog uses safe names and bounded labels', () => {
  for (const metric of OBSERVABILITY_METRICS) {
    assert.match(metric.name, /^miningplatform_[a-z0-9_]+$/);
    assert.ok(metric.labels.length > 0);
    assert.ok(metric.labels.length <= 5);
    const forbiddenLabels = new Set([
      'user_id',
      'payout_id',
      'address',
      'tx_hash',
      'request_id',
      'correlation_id',
      'audit_id',
      'token',
    ]);
    assert.ok(!metric.labels.some((label) => forbiddenLabels.has(label)));
    assert.ok(metric.alert.action.length > 0);
  }
});
