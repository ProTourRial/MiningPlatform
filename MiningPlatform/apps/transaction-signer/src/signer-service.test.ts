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
  type SignerRequestV1,
  type SigningManifestV1,
} from '@mining/signer-protocol';
import { TransactionSignerService } from './signer-service.js';

const destination = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const change = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';

function fixture() {
  const decoded = {
    fee: 0.000008,
    tx: {
      vout: [
        { value: 0.001, scriptPubKey: { address: destination } },
        { value: 0.01, scriptPubKey: { address: change } },
      ],
    },
  };
  const psbt = 'cHNidP8BA-isolated-signer-test';
  const manifest: SigningManifestV1 = {
    version: 1,
    requestId: 'signing-request-1234',
    payoutId: 'payout-request-1234',
    asset: 'BTC',
    network: 'mainnet',
    keyReference: 'treasury-key-1234',
    destination,
    destinationAmountAtomic: '100000',
    reservedNetworkFeeAtomic: '1000',
    actualNetworkFeeAtomic: '800',
    psbtDigest: sha256Hex(psbt),
    unsignedTransactionDigest: sha256Hex(canonicalJson(decoded.tx)),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const request: SignerRequestV1 = {
    manifest,
    manifestDigest: digestSigningManifest(manifest),
    psbt,
  };
  return { decoded, request };
}

test('isolated signer verifies manifest, destination, fee, and owned change before signing', async () => {
  const { decoded, request } = fixture();
  const calls: string[] = [];
  const service = new TransactionSignerService(
    new Map([['treasury-key-1234', 'signing-wallet']]),
    (walletName) => ({
      async call<T>(method: string): Promise<T> {
        assert.equal(walletName, 'signing-wallet');
        calls.push(method);
        if (method === 'decodepsbt') return decoded as T;
        if (method === 'getaddressinfo') return { ismine: true } as T;
        if (method === 'walletprocesspsbt') {
          return { psbt: 'signed-psbt', complete: true } as T;
        }
        throw new Error(`Unexpected method ${method}`);
      },
    }),
  );
  const response = await service.sign(request);
  assert.equal(response.requestId, request.manifest.requestId);
  assert.equal(response.signedPsbt, 'signed-psbt');
  assert.equal(response.complete, true);
  assert.deepEqual(calls, ['decodepsbt', 'getaddressinfo', 'walletprocesspsbt']);
});

test('isolated signer rejects a malicious extra output before walletprocesspsbt', async () => {
  const { decoded, request } = fixture();
  const calls: string[] = [];
  const service = new TransactionSignerService(
    new Map([['treasury-key-1234', 'signing-wallet']]),
    () => ({
      async call<T>(method: string): Promise<T> {
        calls.push(method);
        if (method === 'decodepsbt') return decoded as T;
        if (method === 'getaddressinfo') return { ismine: false } as T;
        throw new Error(`Unexpected method ${method}`);
      },
    }),
  );
  await assert.rejects(service.sign(request), /not owned by signer wallet/);
  assert.equal(calls.includes('walletprocesspsbt'), false);
});

test('isolated signer rejects unknown key references and modified PSBTs', async () => {
  const { request } = fixture();
  const service = new TransactionSignerService(new Map(), () => ({
    async call<T>(): Promise<T> {
      throw new Error('RPC must not be called for a rejected request');
    },
  }));
  await assert.rejects(service.sign(request), /not allowlisted/);
  await assert.rejects(
    service.sign({ ...request, psbt: `${request.psbt}-modified` }),
    /digest does not match/,
  );
});
