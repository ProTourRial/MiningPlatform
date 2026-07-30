/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectMinerIdentity } from './detector.js';

test('detects common ASIC firmware from Stratum user agent', () => {
  const result = detectMinerIdentity({ userAgent: 'Braiins OS/24.04', algorithm: 'SHA256' });
  assert.equal(result.detectedType, 'ASIC');
  assert.equal(result.confidence, 'HIGH');
  assert.deepEqual(result.algorithmCapabilities, ['SHA256']);
});

test('detects common GPU miner software', () => {
  const result = detectMinerIdentity({ userAgent: 'T-Rex/0.26.8', algorithm: 'KAWPOW' });
  assert.equal(result.detectedType, 'GPU');
  assert.equal(result.softwareVersion, '0.26.8');
});

test('keeps ambiguous software honest', () => {
  const result = detectMinerIdentity({ userAgent: 'XMRig/6.22.2' });
  assert.equal(result.detectedType, 'UNKNOWN');
  assert.deepEqual(result.possibleTypes, ['CPU', 'GPU']);
  assert.equal(result.confidence, 'LOW');
});

test('monitoring observations override ambiguous Stratum signatures', () => {
  const result = detectMinerIdentity({
    userAgent: 'cgminer/4.11.1',
    algorithm: 'SHA256',
    observations: [{ hardwareType: 'ASIC', vendor: 'Bitmain', model: 'S19', count: 2, source: 'MINER_API' }],
  });
  assert.equal(result.detectedType, 'ASIC');
  assert.equal(result.deviceCount, 2);
  assert.equal(result.detectionSource, 'MINER_API');
  assert.equal(result.confidence, 'HIGH');
});

test('multiple observed hardware types become a hybrid rig', () => {
  const result = detectMinerIdentity({
    observations: [
      { hardwareType: 'CPU', count: 1, source: 'MONITORING_AGENT' },
      { hardwareType: 'GPU', vendor: 'NVIDIA', count: 6, source: 'MONITORING_AGENT' },
    ],
  });
  assert.equal(result.detectedType, 'HYBRID');
  assert.equal(result.deviceCount, 7);
});
