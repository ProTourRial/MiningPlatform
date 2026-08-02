/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { getBuildInfo } from './index.js';

test('returns v0.3.0-alpha.2 release defaults', () => {
  const result = getBuildInfo('test-binary');
  assert.equal(result.component, 'test-binary');
  assert.equal(result.version, '0.3.0-alpha.2');
  assert.equal(result.schemaVersion, 8);
  assert.equal(result.migration, '20260803040000_auth_session_rotation_hardening');
});
