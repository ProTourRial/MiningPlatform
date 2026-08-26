/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { MiningEvents } from '@mining/shared';
import {
  assertSupportedMiningEvent,
  supportedMiningEvents,
  supportedMiningProjectionEvents,
} from './supported-events.js';

test('workerDeviceDetected is accepted by the mining projection event gate', () => {
  assert.equal(supportedMiningEvents.has(MiningEvents.workerDeviceDetected), true);
  assert.doesNotThrow(() => assertSupportedMiningEvent(MiningEvents.workerDeviceDetected, 1));
});

test('unsupported event versions are rejected before projection', () => {
  assert.throws(
    () => assertSupportedMiningEvent(MiningEvents.workerDeviceDetected, 2),
    /Unsupported event version/,
  );
});

test('accounting events are not claimed by the mining projection', () => {
  assert.equal(supportedMiningEvents.has(MiningEvents.contributionAccepted), false);
  assert.equal(supportedMiningEvents.has(MiningEvents.settlementImported), false);
});

test('RandomX accepted evidence is owned by the worker but cannot silently enter BTC projection', () => {
  assert.equal(supportedMiningEvents.has(MiningEvents.randomXShareAccepted), true);
  assert.equal(supportedMiningProjectionEvents.has(MiningEvents.randomXShareAccepted), false);
  assert.throws(
    () => assertSupportedMiningEvent(MiningEvents.randomXShareAccepted, 1),
    /Unsupported mining event/,
  );
});

test('upstream resilience events are accepted by the mining projection event gate', () => {
  for (const eventName of [
    MiningEvents.upstreamPoolSelected,
    MiningEvents.upstreamFailoverStarted,
    MiningEvents.upstreamFailoverCompleted,
    MiningEvents.upstreamFailoverFailed,
    MiningEvents.upstreamHealthChanged,
    MiningEvents.workerDifficultyChanged,
  ]) {
    assert.equal(supportedMiningEvents.has(eventName), true);
    assert.doesNotThrow(() => assertSupportedMiningEvent(eventName, 1));
  }
});
