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
const RAW_BLOCK = '00'.repeat(81);

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result, error: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function rpcError(code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: null, error: { code, message } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
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
  proposalResult?: unknown;
  submissionResult?: unknown;
  blockHeader?: Record<string, unknown>;
  blockStats?: Record<string, unknown>;
  blockNotFound?: boolean;
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
      const proposal = request.params[0] as { mode?: unknown } | undefined;
      if (proposal?.mode === 'proposal') return rpcResponse(input?.proposalResult ?? null);
      return rpcResponse(input?.template ?? fixtureTemplate());
    }
    if (request.method === 'submitblock') return rpcResponse(input?.submissionResult ?? null);
    if (request.method === 'getblockheader') {
      if (input?.blockNotFound) return rpcError(-5, 'Block not found');
      const blockHash = String(request.params[0]);
      return rpcResponse(input?.blockHeader ?? { hash: blockHash, confirmations: 2, height: 99 });
    }
    if (request.method === 'getblockstats') {
      const blockHash = String(request.params[0]);
      return rpcResponse(input?.blockStats ?? { blockhash: blockHash, height: 99, txs: 1 });
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

test('proposal validation must produce fresh matching evidence before submitblock', async () => {
  const { rpc, calls } = createNativeClient();
  const adapter = new BitcoinNativeMiningRpcAdapter(rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const proposal = await adapter.validateBlockProposal(RAW_BLOCK.toUpperCase());
  assert.equal(proposal.status, 'VALID');
  assert.equal(proposal.reason, null);
  assert.match(proposal.rawBlockDigest, /^[0-9a-f]{64}$/);

  const submitted = await adapter.submitBlock(RAW_BLOCK, proposal, 'work-101');
  assert.equal(submitted.status, 'ACCEPTED');
  assert.equal(submitted.reason, null);
  assert.equal(submitted.rawBlockDigest, proposal.rawBlockDigest);
  assert.equal(submitted.workId, 'work-101');
  assert.match(submitted.sourceDigest, /^[0-9a-f]{64}$/);

  const proposalCall = calls.find(
    (call) =>
      call.method === 'getblocktemplate' &&
      (call.params[0] as { mode?: unknown } | undefined)?.mode === 'proposal',
  );
  assert.deepEqual(proposalCall?.params, [{ mode: 'proposal', data: RAW_BLOCK }]);
  assert.deepEqual(calls.find((call) => call.method === 'submitblock')?.params, [
    RAW_BLOCK,
    'work-101',
  ]);
});

test('submitblock preserves duplicate, inconclusive, and rejected outcomes', async () => {
  for (const [result, expected] of [
    ['duplicate', 'DUPLICATE'],
    ['duplicate-inconclusive', 'INCONCLUSIVE'],
    ['inconclusive', 'INCONCLUSIVE'],
    ['bad-cb-amount', 'REJECTED'],
    ['duplicate-invalid', 'REJECTED'],
  ] as const) {
    const { rpc } = createNativeClient({ submissionResult: result });
    const adapter = new BitcoinNativeMiningRpcAdapter(rpc, {
      expectedChain: 'regtest',
      now: () => new Date(OBSERVED_AT),
    });
    const proposal = await adapter.validateBlockProposal(RAW_BLOCK);
    const submitted = await adapter.submitBlock(RAW_BLOCK, proposal);
    assert.equal(submitted.status, expected);
    assert.equal(submitted.reason, result);
  }
});

test('proposal and submission boundary rejects stale, mismatched, rejected, and malformed evidence', async () => {
  const { rpc } = createNativeClient();
  const adapter = new BitcoinNativeMiningRpcAdapter(rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const proposal = await adapter.validateBlockProposal(RAW_BLOCK);
  await assert.rejects(
    adapter.submitBlock(`01${RAW_BLOCK.slice(2)}`, proposal),
    /requires fresh matching valid proposal evidence/,
  );
  await assert.rejects(
    adapter.submitBlock(RAW_BLOCK, {
      ...proposal,
      observedAt: new Date(OBSERVED_AT.getTime() - 30_001),
    }),
    /requires fresh matching valid proposal evidence/,
  );

  const rejectedClient = createNativeClient({ proposalResult: 'bad-txnmrklroot' });
  const rejectedAdapter = new BitcoinNativeMiningRpcAdapter(rejectedClient.rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const rejected = await rejectedAdapter.validateBlockProposal(RAW_BLOCK);
  assert.equal(rejected.status, 'REJECTED');
  await assert.rejects(
    rejectedAdapter.submitBlock(RAW_BLOCK, rejected),
    /requires fresh matching valid proposal evidence/,
  );

  const malformedClient = createNativeClient({ proposalResult: true });
  const malformedAdapter = new BitcoinNativeMiningRpcAdapter(malformedClient.rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  await assert.rejects(malformedAdapter.validateBlockProposal(RAW_BLOCK), /invalid mining result/);
});

test('submitted-block recovery is read-only, chain-aware, and never treats not-found as success', async () => {
  const blockHash = 'b'.repeat(64);
  const activeClient = createNativeClient();
  const activeAdapter = new BitcoinNativeMiningRpcAdapter(activeClient.rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const active = await activeAdapter.observeSubmittedBlock(blockHash.toUpperCase());
  assert.equal(active.status, 'ACTIVE_CHAIN');
  assert.equal(active.blockHash, blockHash);
  assert.equal(active.confirmations, 2);
  assert.equal(active.blockHeight, 99);
  assert.equal(active.transactionCount, 1);
  assert.equal(active.chainHeight, 100);
  assert.deepEqual(activeClient.calls.find((call) => call.method === 'getblockheader')?.params, [
    blockHash,
    true,
  ]);
  assert.deepEqual(activeClient.calls.find((call) => call.method === 'getblockstats')?.params, [
    blockHash,
    ['blockhash', 'height', 'txs'],
  ]);
  assert.equal(
    activeClient.calls.some((call) => call.method === 'submitblock'),
    false,
  );

  const staleClient = createNativeClient({
    blockHeader: { hash: blockHash, confirmations: -1, height: 99 },
    blockStats: { blockhash: blockHash, height: 99, txs: 3 },
  });
  const staleAdapter = new BitcoinNativeMiningRpcAdapter(staleClient.rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  assert.equal((await staleAdapter.observeSubmittedBlock(blockHash)).status, 'STALE_CHAIN');

  const missingClient = createNativeClient({ blockNotFound: true });
  const missingAdapter = new BitcoinNativeMiningRpcAdapter(missingClient.rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  const missing = await missingAdapter.observeSubmittedBlock(blockHash);
  assert.equal(missing.status, 'NOT_FOUND');
  assert.equal(missing.confirmations, 0);
  assert.equal(missing.blockHeight, null);
  assert.equal(missing.transactionCount, null);
  assert.equal(
    missingClient.calls.some((call) => call.method === 'getblockstats'),
    false,
  );
  assert.equal(
    missingClient.calls.some((call) => call.method === 'submitblock'),
    false,
  );

  const inconsistentClient = createNativeClient({
    blockStats: { blockhash: 'c'.repeat(64), height: 101, txs: 1 },
  });
  const inconsistentAdapter = new BitcoinNativeMiningRpcAdapter(inconsistentClient.rpc, {
    expectedChain: 'regtest',
    now: () => new Date(OBSERVED_AT),
  });
  await assert.rejects(
    inconsistentAdapter.observeSubmittedBlock(blockHash),
    /inconsistent submitted-block evidence/,
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

test('Bitcoin RPC null results require the explicit nullable call boundary', async () => {
  const rpc = new BitcoinJsonRpcClient({
    url: 'http://127.0.0.1:18443',
    username: 'user',
    password: 'password',
    fetchImplementation: (async () => rpcResponse(null)) as typeof fetch,
  });
  await assert.rejects(rpc.call('submitblock'), /returned a null result/);
  assert.equal(await rpc.callNullable('submitblock'), null);
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
