/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { FiniteStateMachine } from './index.js';

type ShareState = 'RECEIVED' | 'VALIDATING' | 'LOCAL_ACCEPTED' | 'LOCAL_REJECTED';

const machine = new FiniteStateMachine<ShareState>({
  RECEIVED: ['VALIDATING'],
  VALIDATING: ['LOCAL_ACCEPTED', 'LOCAL_REJECTED'],
  LOCAL_ACCEPTED: [],
  LOCAL_REJECTED: [],
});

test('allows declared transitions', () => {
  assert.equal(machine.transition('RECEIVED', 'VALIDATING'), 'VALIDATING');
});

test('rejects undeclared transitions', () => {
  assert.throws(() => machine.transition('RECEIVED', 'LOCAL_ACCEPTED'));
});
