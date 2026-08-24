/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BitcoinJsonRpcClient,
  BitcoinNativeMiningRpcAdapter,
  BitcoinRpcError,
  normalizeBitcoinBlockTemplate,
} from './index.js';

type RpcRequest = { method: string; params: unknown[] };

const REGTEST_TARGET = `7fffff${'00'.repeat(29)}`;
const WITNESS_COMMITMENT = `6a24aa21a9ed${'11'.repeat(32)}`;
const OBSERVED_AT = new Date('2026-08-24T01:00:00.000Z');

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result, error: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fixtureTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 0x20000000,
    rules: ['csv', 'segwit'],
    vbavailable: {},
    capabilities: ['proposal'],
    vbrequired: 0,
    previousblockhash: 'a'.repeat(64),
    transactions: [],
    coinbaseaux: { flags: '062f503253482f' },
    coinbasevalue: 5_000_000_000,
    longpollid: 'regtest-long-poll-101',
    target: REGTEST_TARGET,
    mintime: 1_700_000_000,
    mutable: ['time', 'transactions', 'prevblock'],
    noncerange: '00000000ffffffff',
    sigoplimit: 80_000,
    sizelimit: 4_000_000,
    weightlimit: 4_000_000,
    curtime: 1_700_000_001,
    bits: '207fffff',
    height: 101,
    default_witness_commitment: WITNESS_COMMITMENT,
    ...overrides,
  };
}

function createNativeClient(input?: {
  chain?: Record<string, unknown>;
  network?: Record<string, unknown>;
  template?: Record<string, unknown>;
}) {
  const calls: RpcRequest[] = [];
  const chain = {
    chain: 'regtest',
    blocks: 100,
    headers: 100,
    bestblockhash: 'a'.repeat(64),
    verificationprogress: 1,
    initialblockdownload: false,
    warnings: [],
    ...input?.chain,
  };
  const network = {
    version: 310_000,
    subversion: '/Satoshi:31.0.0/',
    networkactive: true,
    warnings: [],
    ...input?.network,
  };
  const fetchImplementation = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    calls.push(request);
    if (request.method === 'getblockchaininfo') return rpcResponse(chain);
    if (request.method === 'getnetworkinfo') return rpcResponse(network);
    if (request.method === 'getblocktemplate') {
      return rpcResponse(input?.template ?? fixtureTemplate());
    }
    throw new Error(`Unexpected method ${request.method}`);
  }) as typeof fetch;
  const rpc = new BitcoinJsonRpcClient({
    url: 'http://127.0.0.1:18443',
    username: 'regtest-rpc-user',
    password: 'regtest-rpc-password',
    maximumResponseBytes: 16 * 1024 * 1024,
    fetchImplementation,
  });
  return { rpc, calls };
}

test('native mining adapter proves node readiness and requests a segwit template', async () => {
  const { rpc, calls } = createNativeClient();
  const adapter = new BitcoinNativeMiningRpcAdapter(rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const template = await adapter.getBlockTemplate();
  assert.equal(template.height, 101);
  assert.equal(template.versionHex, '20000000');
  assert.equal(template.targetHex, REGTEST_TARGET);
  assert.equal(template.coinbaseValueAtomic, 5_000_000_000n);
  assert.equal(template.defaultWitnessCommitment, WITNESS_COMMITMENT);
  assert.equal(template.expiresAt.toISOString(), '2026-08-24T01:02:00.000Z');
  assert.match(template.sourceDigest, /^[0-9a-f]{64}$/);

  const request = calls.find((call) => call.method === 'getblocktemplate');
  assert.ok(request);
  assert.deepEqual(request.params, [
    {
      mode: 'template',
      capabilities: ['longpoll', 'coinbasevalue', 'proposal', 'workid'],
      rules: ['segwit'],
    },
  ]);
});

test('native mining adapter fails closed before requesting work from an unready node', async () => {
  const { rpc, calls } = createNativeClient({
    chain: {
      chain: 'main',
      headers: 101,
      initialblockdownload: true,
      warnings: ['chain warning'],
    },
    network: {
      version: 290_000,
      networkactive: false,
      warnings: ['network warning'],
    },
  });
  const adapter = new BitcoinNativeMiningRpcAdapter(rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const readiness = await adapter.getMiningReadiness();
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.blockers, [
    'CHAIN_MISMATCH',
    'INITIAL_BLOCK_DOWNLOAD',
    'HEADER_BLOCK_MISMATCH',
    'NETWORK_INACTIVE',
    'NODE_VERSION_UNSUPPORTED',
    'NODE_WARNING',
  ]);
  await assert.rejects(
    adapter.getBlockTemplate(),
    (error: unknown) => error instanceof BitcoinRpcError && /CHAIN_MISMATCH/.test(error.message),
  );
  assert.equal(
    calls.some((call) => call.method === 'getblocktemplate'),
    false,
  );
});

test('template normalization preserves transaction evidence and validates dependency ordering', () => {
  const transaction = {
    data: '02000000000100',
    txid: 'b'.repeat(64),
    hash: 'c'.repeat(64),
    depends: [],
    fee: 1250,
    sigops: 4,
    weight: 600,
  };
  const normalized = normalizeBitcoinBlockTemplate(
    fixtureTemplate({ transactions: [transaction] }),
    OBSERVED_AT,
  );
  assert.equal(normalized.transactions[0]?.feeAtomic, 1250n);
  assert.equal(normalized.transactions[0]?.data, transaction.data);

  assert.throws(
    () =>
      normalizeBitcoinBlockTemplate(
        fixtureTemplate({ transactions: [{ ...transaction, depends: [1] }] }),
        OBSERVED_AT,
      ),
    /depends/,
  );
});

test('template normalization rejects target and witness-commitment corruption', () => {
  assert.throws(
    () => normalizeBitcoinBlockTemplate(fixtureTemplate({ target: '1'.repeat(64) }), OBSERVED_AT),
    /target does not match compact bits/,
  );
  assert.throws(
    () =>
      normalizeBitcoinBlockTemplate(
        fixtureTemplate({ default_witness_commitment: `6a24deadbeef${'11'.repeat(32)}` }),
        OBSERVED_AT,
      ),
    /default_witness_commitment/,
  );
});

test('Bitcoin RPC response limit is configurable but strictly bounded', () => {
  assert.throws(
    () =>
      new BitcoinJsonRpcClient({
        url: 'http://127.0.0.1:18443',
        username: 'user',
        password: 'password',
        maximumResponseBytes: 512,
      }),
    /between 1 KiB and 32 MiB/,
  );
});

test('Bitcoin RPC rejects an undeclared oversized response body', async () => {
  const rpc = new BitcoinJsonRpcClient({
    url: 'http://127.0.0.1:18443',
    username: 'user',
    password: 'password',
    maximumResponseBytes: 1024,
    fetchImplementation: (async () => rpcResponse('x'.repeat(2048))) as typeof fetch,
  });
  await assert.rejects(
    rpc.call('getnetworkinfo'),
    (error: unknown) => error instanceof BitcoinRpcError && /response exceeds/.test(error.message),
  );
});
