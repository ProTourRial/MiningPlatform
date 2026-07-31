/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateWorkerCredential,
  hashWorkerCredentialSecret,
  verifyWorkerCredentialSecret,
} from './worker-credential.js';

test('worker credential secret is hashed and verified without storing plaintext', async () => {
  const secret = 'mpw_test-secret-with-enough-entropy-123456789';
  const encoded = await hashWorkerCredentialSecret(secret, Buffer.alloc(16, 7));
  assert.equal(encoded.includes(secret), false);
  assert.equal(await verifyWorkerCredentialSecret(secret, encoded), true);
  assert.equal(await verifyWorkerCredentialSecret(`${secret}-wrong`, encoded), false);
});

test('malformed worker credential hashes are rejected safely', async () => {
  assert.equal(await verifyWorkerCredentialSecret('irrelevant-secret-value', 'not-a-supported-hash'), false);
});

test('generated worker credentials expose the secret once and persist only its hash', async () => {
  const generated = await generateWorkerCredential();
  assert.match(generated.credentialId, /^wc_/);
  assert.match(generated.secret, /^mpw_/);
  assert.equal(generated.secretHash.includes(generated.secret), false);
  assert.equal(await verifyWorkerCredentialSecret(generated.secret, generated.secretHash), true);
});
