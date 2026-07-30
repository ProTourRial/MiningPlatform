import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMiningAuthorize, parseMiningConfigure, parseMiningSubmit, parseStratumLine, serializeStratumNotification } from './index.js';


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
