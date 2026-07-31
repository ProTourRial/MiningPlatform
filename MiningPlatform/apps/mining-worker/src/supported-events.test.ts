/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { MiningEvents } from '@mining/shared';
import { assertSupportedMiningEvent, supportedMiningEvents } from './supported-events.js';

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
