/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { getBuildInfo } from './index.js';

test('returns alpha.6 release defaults', () => {
  const result = getBuildInfo('test-binary');
  assert.equal(result.component, 'test-binary');
  assert.equal(result.version, '0.2.0-alpha.6');
  assert.equal(result.schemaVersion, 6);
  assert.equal(result.migration, '20260731110000_upstream_resilience');
});
