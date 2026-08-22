/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalJson,
  digestSigningManifest,
  sha256Hex,
  verifySignerSignature,
  type SignerRequestV1,
  type SigningManifestV1,
} from '@mining/signer-protocol';
import { IsolatedSignerClient } from './signer-client.js';

test('wallet signer client authenticates and verifies the isolated signer response', async () => {
  const secret = 'wallet-signer-test-secret-at-least-thirty-two-bytes';
  const psbt = 'unsigned-psbt';
  const manifest: SigningManifestV1 = {
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
    psbtDigest: sha256Hex(psbt),
    unsignedTransactionDigest: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const request: SignerRequestV1 = {
    manifest,
    manifestDigest: digestSigningManifest(manifest),
    psbt,
  };
  const fetchImplementation = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = String(init?.body);
    assert.equal(body, canonicalJson(request));
    assert.equal(
      verifySignerSignature({
        secret,
        timestamp: String(headers.get('x-mining-timestamp')),
        nonce: String(headers.get('x-mining-nonce')),
        bodyDigest: sha256Hex(body),
        signature: String(headers.get('x-mining-signature')),
      }),
      true,
    );
    const signedPsbt = 'signed-psbt';
    return new Response(
      JSON.stringify({
        requestId: manifest.requestId,
        manifestDigest: request.manifestDigest,
        signedPsbt,
        signedPsbtDigest: sha256Hex(signedPsbt),
        complete: true,
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const response = await new IsolatedSignerClient({
    url: 'https://signer.internal',
    sharedSecret: secret,
    fetchImplementation,
  }).sign(request);
  assert.equal(response.signedPsbt, 'signed-psbt');
  assert.equal(response.complete, true);
});

test('wallet signer client rejects a response bound to another request', async () => {
  const secret = 'wallet-signer-test-secret-at-least-thirty-two-bytes';
  const manifest = {
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
    psbtDigest: sha256Hex('unsigned-psbt'),
    unsignedTransactionDigest: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } satisfies SigningManifestV1;
  const request = {
    manifest,
    manifestDigest: digestSigningManifest(manifest),
    psbt: 'unsigned-psbt',
  } satisfies SignerRequestV1;
  const client = new IsolatedSignerClient({
    url: 'https://signer.internal',
    sharedSecret: secret,
    fetchImplementation: (async () =>
      new Response(
        JSON.stringify({
          requestId: 'different-request',
          manifestDigest: request.manifestDigest,
          signedPsbt: 'signed-psbt',
          signedPsbtDigest: sha256Hex('signed-psbt'),
          complete: true,
        }),
        { status: 200 },
      )) as typeof fetch,
  });
  await assert.rejects(client.sign(request), /does not match/);
});
