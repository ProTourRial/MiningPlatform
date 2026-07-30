/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMiningAuthorize,
  parseMiningConfigure,
  parseMiningNotify,
  parseMiningSetExtranonce,
  parseMiningSubmit,
  parseMiningSubscribeResult,
  parseStratumLine,
  parseStratumMessage,
  serializeStratumNotification,
} from './index.js';

test('parses version rolling configuration', () => {
  const config = parseMiningConfigure([['version-rolling'], { 'version-rolling.mask': '1fffe000' }]);
  assert.deepEqual(config.extensions, ['version-rolling']);
});

test('parses a mining.submit request', () => {
  const request = parseStratumLine('{"id":4,"method":"mining.submit","params":["demo.worker1","job-1","00000001","68a00000","00000001"]}');
  assert.equal(request.method, 'mining.submit');
  assert.equal(parseMiningSubmit(request.params).jobId, 'job-1');
});

test('rejects incomplete authorization', () => {
  assert.throws(() => parseMiningAuthorize(['demo.worker1']));
});

test('serializes server notifications with null id', () => {
  const line = serializeStratumNotification('mining.set_difficulty', [1]);
  assert.deepEqual(JSON.parse(line), { id: null, method: 'mining.set_difficulty', params: [1] });
});

test('parses upstream subscribe result', () => {
  const parsed = parseMiningSubscribeResult([[['mining.notify', 'session-1']], 'e9695791', 4]);
  assert.equal(parsed.extranonce1, 'e9695791');
  assert.equal(parsed.extranonce2Size, 4);
});

test('parses upstream set_extranonce notification', () => {
  assert.deepEqual(parseMiningSetExtranonce(['aabbccdd', 4]), { extranonce1: 'aabbccdd', extranonce2Size: 4 });
});

test('parses reference mining.notify fixture', () => {
  const fixture = parseMiningNotify([
    '4f',
    '4d16b6f85af6e2198f44ae2a6de67f78487ae5611b77c6c0440b921e00000000',
    '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff20020862062f503253482f04b8864e5008',
    '072f736c7573682f000000000100f2052a010000001976a914d23fcdf86f7e756a64a7a9688ef9903327048ed988ac00000000',
    [],
    '00000002',
    '1c2ac4af',
    '504e86b9',
    false,
  ]);
  assert.equal(fixture.jobId, '4f');
  assert.equal(fixture.previousBlockHash.length, 64);
});

test('distinguishes upstream responses from notifications', () => {
  const response = parseStratumMessage('{"id":1,"result":true,"error":null}');
  assert.equal('method' in response, false);
  const notification = parseStratumMessage('{"id":null,"method":"mining.set_difficulty","params":[2]}');
  assert.equal('method' in notification, true);
});
