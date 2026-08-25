/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import {
  BitcoinJsonRpcClient,
  BitcoinNativeMiningRpcAdapter,
  BitcoinRpcError,
} from '@mining/blockchain-adapters';
import {
  buildNativeBitcoinJob,
  reconstructNativeBitcoinBlockCandidate,
} from '@mining/bitcoin-template';
import { calculateHeaderHash, type BitcoinShareSubmission } from '@mining/mining-core';

const EXPECTED_ACK = 'disposable-bitcoin-core-31-regtest-only';
const WALLET_NAME = 'miningplatform-native-regtest';

type VerboseBlock = {
  hash: string;
  height: number;
  confirmations: number;
  tx: Array<{
    txid: string;
    vout: Array<{ scriptPubKey: { address?: string } }>;
  }>;
};

type WalletBalances = {
  mine?: { trusted?: number };
};

function requireRegtestUrl(): string {
  const value = process.env.BITCOIN_REGTEST_RPC_URL ?? 'http://127.0.0.1:18443';
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Regtest RPC URL must be an unauthenticated loopback HTTP origin');
  }
  return url.toString();
}

function solveNetworkTarget(
  bundle: ReturnType<typeof buildNativeBitcoinJob>,
): BitcoinShareSubmission {
  const submittedAt = new Date();
  for (let nonce = 0; nonce <= 0xffffffff; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName: 'regtest.integration',
      jobId: bundle.job.id,
      extranonce2: '00000001',
      networkTime: bundle.job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt,
    };
    if (calculateHeaderHash(bundle.job, submission).numericValue <= bundle.target) {
      return submission;
    }
  }
  throw new Error('Unable to solve the disposable regtest network target');
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ensureWallet(nodeRpc: BitcoinJsonRpcClient): Promise<BitcoinJsonRpcClient> {
  const loadedWallets = await nodeRpc.call<string[]>('listwallets');
  if (!loadedWallets.includes(WALLET_NAME)) {
    try {
      await nodeRpc.call('loadwallet', [WALLET_NAME]);
    } catch (error) {
      if (!(error instanceof BitcoinRpcError) || error.code !== -18) throw error;
      await nodeRpc.call('createwallet', [WALLET_NAME, false, false, '', false, true, true]);
    }
  }
  return new BitcoinJsonRpcClient({
    url: requireRegtestUrl(),
    username: process.env.BITCOIN_REGTEST_RPC_USER ?? 'miningplatform-regtest',
    password: process.env.BITCOIN_REGTEST_RPC_PASSWORD ?? 'miningplatform-regtest-disposable-only',
    walletName: WALLET_NAME,
    timeoutMilliseconds: 15_000,
    maximumResponseBytes: 16 * 1024 * 1024,
  });
}

async function main(): Promise<void> {
  if (process.env.NATIVE_BITCOIN_REGTEST_ACK !== EXPECTED_ACK) {
    throw new Error(
      `Set NATIVE_BITCOIN_REGTEST_ACK=${EXPECTED_ACK} to run the destructive disposable regtest trace`,
    );
  }

  const rpcOptions = {
    url: requireRegtestUrl(),
    username: process.env.BITCOIN_REGTEST_RPC_USER ?? 'miningplatform-regtest',
    password: process.env.BITCOIN_REGTEST_RPC_PASSWORD ?? 'miningplatform-regtest-disposable-only',
    timeoutMilliseconds: 15_000,
    maximumResponseBytes: 16 * 1024 * 1024,
  } as const;
  const nodeRpc = new BitcoinJsonRpcClient(rpcOptions);
  const walletRpc = await ensureWallet(nodeRpc);
  const payoutAddress = await walletRpc.call<string>('getnewaddress', [
    'native-regtest-payout',
    'bech32',
  ]);
  assert.match(payoutAddress, /^bcrt1[0-9ac-hj-np-z]+$/);

  const initialChain = await nodeRpc.call<{ blocks: number }>('getblockchaininfo');
  const maturityHeight = 101;
  if (initialChain.blocks < maturityHeight) {
    const seedBlocks = await nodeRpc.call<string[]>('generatetoaddress', [
      maturityHeight - initialChain.blocks,
      payoutAddress,
    ]);
    assert.equal(seedBlocks.length, maturityHeight - initialChain.blocks);
  }

  const balances = await walletRpc.call<WalletBalances>('getbalances');
  assert.equal((balances.mine?.trusted ?? 0) >= 1, true, 'regtest coinbase must be mature');
  const transactionAddress = await walletRpc.call<string>('getnewaddress', [
    'native-regtest-template-transaction',
    'bech32',
  ]);
  const templateTransactionId = await walletRpc.call<string>('sendtoaddress', [
    transactionAddress,
    1,
  ]);
  assert.match(templateTransactionId, /^[0-9a-f]{64}$/);
  const mempoolBefore = await nodeRpc.call<string[]>('getrawmempool');
  assert.equal(mempoolBefore.includes(templateTransactionId), true);

  const adapter = new BitcoinNativeMiningRpcAdapter(nodeRpc, {
    expectedChain: 'regtest',
    minimumNodeVersion: 310_000,
    templateMaximumAgeMilliseconds: 120_000,
    proposalMaximumAgeMilliseconds: 30_000,
  });
  const readiness = await adapter.getMiningReadiness();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.observedChain, 'regtest');
  assert.equal(readiness.nodeVersion >= 310_000, true);

  const template = await adapter.getBlockTemplate();
  assert.equal(template.height, readiness.blocks + 1);
  const templateTransaction = template.transactions.find(
    (transaction) => transaction.txid === templateTransactionId,
  );
  assert.ok(templateTransaction, 'GBT must contain the wallet transaction');
  assert.notEqual(
    templateTransaction.hash,
    templateTransaction.txid,
    'the live witness transaction must bind distinct txid and wtxid evidence',
  );
  assert.notEqual(template.defaultWitnessCommitment, null);
  const bundle = buildNativeBitcoinJob({
    template,
    payoutAddress,
    payoutNetwork: 'regtest',
    extranonce1: '00000001',
    extranonce2Size: 4,
    assignedDifficulty: '1',
    poolTag: 'MiningPlatform/regtest',
  });
  const submission = solveNetworkTarget(bundle);
  const candidate = reconstructNativeBitcoinBlockCandidate(bundle, submission, new Date());
  const proposal = await adapter.validateBlockProposal(candidate.rawBlock);
  assert.equal(proposal.status, 'VALID');
  assert.equal(proposal.rawBlockDigest, candidate.rawBlockDigest);

  const submitted = await adapter.submitBlock(
    candidate.rawBlock,
    proposal,
    template.workId ?? undefined,
  );
  assert.equal(submitted.status, 'ACCEPTED');
  assert.equal(submitted.rawBlockDigest, candidate.rawBlockDigest);

  const firstObservation = await adapter.observeSubmittedBlock(candidate.blockHash);
  assert.equal(firstObservation.status, 'ACTIVE_CHAIN');
  assert.equal(firstObservation.confirmations, 1);
  assert.equal(firstObservation.blockHeight, template.height);
  assert.equal(firstObservation.transactionCount, template.transactions.length + 1);

  const nextBlocks = await nodeRpc.call<string[]>('generatetoaddress', [1, payoutAddress]);
  assert.equal(nextBlocks.length, 1);
  const finalObservation = await adapter.observeSubmittedBlock(candidate.blockHash);
  assert.equal(finalObservation.status, 'ACTIVE_CHAIN');
  assert.equal(finalObservation.confirmations, 2);

  const acceptedBlock = await nodeRpc.call<VerboseBlock>('getblock', [candidate.blockHash, 2]);
  assert.equal(acceptedBlock.hash, candidate.blockHash);
  assert.equal(acceptedBlock.height, template.height);
  assert.equal(acceptedBlock.confirmations, 2);
  assert.equal(
    acceptedBlock.tx.some((transaction) => transaction.txid === templateTransactionId),
    true,
    'Bitcoin Core must confirm the exact transaction included by the native template builder',
  );
  assert.equal(
    acceptedBlock.tx[0]?.vout.some((output) => output.scriptPubKey.address === payoutAddress),
    true,
    'Bitcoin Core must confirm the native coinbase pays the disposable wallet address',
  );

  const longPollBaseline = await adapter.getBlockTemplate();
  let longPollSettled = false;
  const longPollPromise = adapter.getBlockTemplate(longPollBaseline.longPollId);
  void longPollPromise.then(
    () => {
      longPollSettled = true;
    },
    () => {
      longPollSettled = true;
    },
  );
  await delay(250);
  assert.equal(longPollSettled, false, 'GBT long-poll must remain pending before the tip changes');
  const longPollTrigger = await nodeRpc.call<string[]>('generatetoaddress', [1, payoutAddress]);
  assert.equal(longPollTrigger.length, 1);
  const longPollReplacement = await longPollPromise;
  assert.equal(longPollSettled, true);
  assert.equal(longPollReplacement.previousBlockHash, longPollTrigger[0]);
  assert.equal(longPollReplacement.height, longPollBaseline.height + 1);
  assert.notEqual(longPollReplacement.longPollId, longPollBaseline.longPollId);

  process.stdout.write(
    `${JSON.stringify(
      {
        chain: readiness.observedChain,
        nodeVersion: readiness.nodeVersion,
        templateHeight: template.height,
        blockHash: candidate.blockHash,
        payoutAddress,
        templateTransactionId,
        proposalStatus: proposal.status,
        submissionStatus: submitted.status,
        confirmations: finalObservation.confirmations,
        transactionCount: finalObservation.transactionCount,
        longPollBaselineHeight: longPollBaseline.height,
        longPollReplacementHeight: longPollReplacement.height,
        longPollTriggerHash: longPollTrigger[0],
        templateSourceDigest: template.sourceDigest,
        longPollSourceDigest: longPollReplacement.sourceDigest,
        rawBlockDigest: candidate.rawBlockDigest,
        proposalSourceDigest: proposal.sourceDigest,
        submissionSourceDigest: submitted.sourceDigest,
        observationSourceDigest: finalObservation.sourceDigest,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
