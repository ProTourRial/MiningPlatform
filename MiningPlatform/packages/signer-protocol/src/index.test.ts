/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalJson,
  createSignerSignature,
  digestSigningManifest,
  validateSigningManifest,
  verifySignerSignature,
  type SigningManifestV1,
} from './index.js';

function manifest(): SigningManifestV1 {
  return {
    version: 1,
    requestId: 'signing-request-1234',
    payoutId: 'payout-request-1234',
    asset: 'BTC',
    network: 'mainnet',
    keyReference: 'treasury-key-1234',
    destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    destinationAmountAtomic: '100000',
    reservedNetworkFeeAtomic: '1000',
    actualNetworkFeeAtomic: '800',
    psbtDigest: 'a'.repeat(64),
    unsignedTransactionDigest: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

test('canonical JSON and manifest digest are property-order independent', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  const first = manifest();
  const reordered = Object.fromEntries(Object.entries(first).reverse()) as SigningManifestV1;
  assert.equal(digestSigningManifest(first), digestSigningManifest(reordered));
});

test('manifest validation enforces expiry and reserved fee cap', () => {
  const valid = manifest();
  assert.doesNotThrow(() => validateSigningManifest(valid));
  assert.throws(
    () => validateSigningManifest({ ...valid, actualNetworkFeeAtomic: '1001' }),
    /exceeds/,
  );
  assert.throws(
    () => validateSigningManifest({ ...valid, expiresAt: new Date(Date.now() - 1).toISOString() }),
    /expired/,
  );
});

test('HMAC signer authentication binds timestamp, nonce, and body digest', () => {
  const input = {
    secret: 'signer-test-secret-that-is-at-least-thirty-two-bytes',
    timestamp: String(Date.now()),
    nonce: 'nonce-value-1234',
    bodyDigest: 'c'.repeat(64),
  };
  const signature = createSignerSignature(input);
  assert.equal(verifySignerSignature({ ...input, signature }), true);
  assert.equal(verifySignerSignature({ ...input, nonce: 'nonce-value-5678', signature }), false);
});
