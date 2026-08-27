/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  decryptWalletArtifact,
  encryptWalletArtifact,
  parseArtifactEncryptionKey,
} from './artifact-crypto.js';

test('wallet artifacts are authenticated and encrypted with a dedicated key', () => {
  const key = parseArtifactEncryptionKey(randomBytes(32).toString('base64url'));
  const encrypted = encryptWalletArtifact('unsigned-psbt-fixture', key);
  assert.notEqual(encrypted.includes('unsigned-psbt-fixture'), true);
  assert.equal(decryptWalletArtifact(encrypted, key), 'unsigned-psbt-fixture');
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('a') ? 'b' : 'a'}`;
  assert.throws(() => decryptWalletArtifact(tampered, key));
});

test('wallet artifact key must decode to exactly 32 bytes', () => {
  assert.throws(() => parseArtifactEncryptionKey('too-short'), /32 bytes/);
});
