/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateVardiffDecision,
  DEFAULT_VARDIFF_POLICY,
} from './index.js';

const baseInput = {
  currentDifficulty: 100,
  upstreamFloor: 1,
  lastRetargetAtSeconds: 0,
  nowSeconds: 90,
};

test('waits for retarget interval and minimum samples', () => {
  const early = calculateVardiffDecision({
    ...baseInput,
    nowSeconds: 89,
    shareTimestampsSeconds: [0, 15, 30, 45],
  });
  assert.equal(early.action, 'NO_CHANGE');
  assert.equal(early.reason, 'WAITING_FOR_INTERVAL');

  const samples = calculateVardiffDecision({
    ...baseInput,
    shareTimestampsSeconds: [0, 15, 30],
  });
  assert.equal(samples.action, 'NO_CHANGE');
  assert.equal(samples.reason, 'WAITING_FOR_SAMPLES');
});

test('retargets when observed shares are too fast', () => {
  const decision = calculateVardiffDecision({
    ...baseInput,
    shareTimestampsSeconds: [0, 5, 10, 15],
  });
  assert.equal(decision.action, 'RETARGET');
  assert.equal(decision.reason, 'RETARGETED');
  assert.equal(decision.previousDifficulty, 100);
  assert.equal(decision.nextDifficulty, 300);
  assert.equal(decision.observedShareIntervalSeconds, 5);
});

test('retargets down when shares are too slow but respects minimum difficulty', () => {
  const decision = calculateVardiffDecision(
    {
      currentDifficulty: 100,
      upstreamFloor: 1,
      shareTimestampsSeconds: [0, 60, 120, 180],
      lastRetargetAtSeconds: 0,
      nowSeconds: 90,
    },
    DEFAULT_VARDIFF_POLICY,
  );
  assert.equal(decision.action, 'RETARGET');
  assert.equal(decision.nextDifficulty, 25);

  const floor = calculateVardiffDecision({
    currentDifficulty: 10,
    upstreamFloor: 8,
    shareTimestampsSeconds: [0, 600, 1200, 1800],
    lastRetargetAtSeconds: 0,
    nowSeconds: 90,
  });
  assert.equal(floor.nextDifficulty, 8);
});

test('clamps maximum adjustment factor', () => {
  const decision = calculateVardiffDecision({
    ...baseInput,
    shareTimestampsSeconds: [0, 0.001, 0.002, 0.003],
  });
  assert.equal(decision.action, 'RETARGET');
  assert.equal(decision.nextDifficulty, 400);
  assert.equal(decision.adjustmentFactor, 4);
});

test('does not retarget inside hysteresis band', () => {
  const decision = calculateVardiffDecision({
    ...baseInput,
    shareTimestampsSeconds: [0, 14.5, 29, 43.5],
  });
  assert.equal(decision.action, 'NO_CHANGE');
  assert.equal(decision.reason, 'WITHIN_HYSTERESIS');
  assert.equal(decision.nextDifficulty, 100);
});

test('rejects invalid temporal or policy input', () => {
  assert.throws(() =>
    calculateVardiffDecision({
      ...baseInput,
      nowSeconds: -1,
      shareTimestampsSeconds: [0, 15, 30, 45],
    }),
  );
  assert.throws(() =>
    calculateVardiffDecision(
      {
        ...baseInput,
        shareTimestampsSeconds: [0, 15, 30, 45],
      },
      { ...DEFAULT_VARDIFF_POLICY, maximumAdjustmentFactor: 0.5 },
    ),
  );
});
