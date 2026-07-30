/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { hmacSensitiveValue, safeEqual } from './index.js';

test('creates stable keyed identifiers without exposing the source value', () => {
  const first = hmacSensitiveValue('192.0.2.10', 'a-development-secret-key');
  const second = hmacSensitiveValue('192.0.2.10', 'a-development-secret-key');
  const otherKey = hmacSensitiveValue('192.0.2.10', 'another-development-secret');
  assert.equal(first, second);
  assert.notEqual(first, otherKey);
  assert.equal(first.includes('192.0.2.10'), false);
});

test('compares secrets without accepting different values', () => {
  assert.equal(safeEqual('token-a', 'token-a'), true);
  assert.equal(safeEqual('token-a', 'token-b'), false);
});
