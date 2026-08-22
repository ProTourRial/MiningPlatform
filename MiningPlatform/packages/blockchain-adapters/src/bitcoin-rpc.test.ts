/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BitcoinJsonRpcClient,
  BitcoinRpcError,
  BitcoinWatchOnlyRpcAdapter,
  atomicToBitcoinNumber,
  bitcoinToAtomic,
} from './bitcoin-rpc.js';

type RpcRequest = { method: string; params: unknown[] };

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result, error: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockClient(handler: (request: RpcRequest) => unknown) {
  const calls: RpcRequest[] = [];
  const fetchImplementation = (async (input: URL | RequestInfo, init?: RequestInit) => {
    assert.equal(new URL(input.toString()).pathname, '/wallet/watch-only');
    assert.match(String(new Headers(init?.headers).get('authorization')), /^Basic /);
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    calls.push(request);
    return rpcResponse(handler(request));
  }) as typeof fetch;
  const rpc = new BitcoinJsonRpcClient({
    url: 'https://bitcoin-node.internal',
    username: 'rpc-user',
    password: 'rpc-password',
    walletName: 'watch-only',
    fetchImplementation,
  });
  return { rpc, calls };
}

test('Bitcoin atomic conversion is exact and bounded', () => {
  assert.equal(bitcoinToAtomic('0.00000001'), 1n);
  assert.equal(bitcoinToAtomic(0.001), 100_000n);
  assert.equal(atomicToBitcoinNumber(100_000n), 0.001);
  assert.throws(() => bitcoinToAtomic('0.000000001'), /at most 8/);
  assert.throws(() => atomicToBitcoinNumber(0n), /positive/);
});

test('watch-only RPC reports a chain-bound wallet snapshot', async () => {
  const { rpc } = mockClient((request) => {
    if (request.method === 'getblockchaininfo') {
      return {
        blocks: 912_345,
        bestblockhash: 'a'.repeat(64),
        verificationprogress: 0.999999,
        initialblockdownload: false,
      };
    }
    if (request.method === 'getbalances') {
      return { mine: { trusted: 0.01 }, watchonly: { trusted: 0.002 } };
    }
    throw new Error(`Unexpected method ${request.method}`);
  });
  const snapshot = await new BitcoinWatchOnlyRpcAdapter('mainnet', rpc).getWalletSnapshot();
  assert.equal(snapshot.confirmedBalanceAtomic, 1_200_000n);
  assert.equal(snapshot.chainHeight, 912_345n);
  assert.equal(snapshot.chainTipHash, 'a'.repeat(64));
  assert.equal(snapshot.initialBlockDownload, false);
});

test('PSBT preparation proves exact destination and rejects fees above the reservation', async () => {
  const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const { rpc, calls } = mockClient((request) => {
    if (request.method === 'walletcreatefundedpsbt') {
      return { psbt: 'cHNidP8BA-test', fee: 0.000001 };
    }
    if (request.method === 'decodepsbt') {
      return {
        fee: 0.000001,
        tx: {
          vin: [{ txid: 'b'.repeat(64), vout: 0 }],
          vout: [{ value: 0.001, scriptPubKey: { address } }],
        },
      };
    }
    throw new Error(`Unexpected method ${request.method}`);
  });
  const adapter = new BitcoinWatchOnlyRpcAdapter('mainnet', rpc);
  const prepared = await adapter.preparePayout({
    address,
    amountAtomic: 100_000n,
    maximumNetworkFeeAtomic: 100n,
    feeRateSatPerVbyte: 2,
  });
  assert.equal(prepared.destinationAmountAtomic, 100_000n);
  assert.equal(prepared.actualNetworkFeeAtomic, 100n);
  assert.match(prepared.psbtDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    calls.map((call) => call.method),
    ['walletcreatefundedpsbt', 'decodepsbt'],
  );

  await assert.rejects(
    adapter.preparePayout({
      address,
      amountAtomic: 100_000n,
      maximumNetworkFeeAtomic: 99n,
    }),
    (error: unknown) => error instanceof BitcoinRpcError && /exceeds/.test(error.message),
  );
  assert.ok(calls.some((call) => call.method === 'lockunspent'));
});

test('signed PSBT finalization, mempool preflight, broadcast, and confirmation are separate RPC steps', async () => {
  const transactionId = 'c'.repeat(64);
  const { rpc, calls } = mockClient((request) => {
    if (request.method === 'finalizepsbt') return { complete: true, hex: '02000000000100' };
    if (request.method === 'testmempoolaccept') return [{ allowed: true }];
    if (request.method === 'sendrawtransaction') return transactionId;
    if (request.method === 'gettransaction') {
      return { confirmations: 3, blockhash: 'd'.repeat(64), abandoned: false };
    }
    if (request.method === 'getblockheader') return { height: 912_346 };
    throw new Error(`Unexpected method ${request.method}`);
  });
  const adapter = new BitcoinWatchOnlyRpcAdapter('mainnet', rpc);
  const finalized = await adapter.finalizeSignedPsbt('signed-psbt');
  await adapter.assertMempoolAcceptance(finalized.rawTransaction);
  assert.equal(await adapter.broadcastRawTransaction(finalized.rawTransaction), transactionId);
  const observation = await adapter.getTransactionObservation(transactionId);
  assert.equal(observation.status, 'CONFIRMED');
  assert.equal(observation.confirmations, 3);
  assert.equal(observation.blockHeight, 912_346n);
  assert.deepEqual(
    calls.map((call) => call.method),
    ['finalizepsbt', 'testmempoolaccept', 'sendrawtransaction', 'gettransaction', 'getblockheader'],
  );
});
