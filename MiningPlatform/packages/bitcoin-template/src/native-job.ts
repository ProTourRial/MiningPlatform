/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  bitcoinAddressToScriptPubKey,
  type BitcoinBlockTemplate,
  type BitcoinNetwork,
} from '@mining/blockchain-adapters';
import {
  buildBlockHeader,
  bytesToHex,
  calculateHeaderHash,
  hexToBytes,
  parsePositiveDecimal,
  reverseBytes,
  sha256,
  sha256d,
  type BitcoinMiningJob,
  type BitcoinShareSubmission,
} from '@mining/mining-core';
import { canonicalJson, sha256Hex } from '@mining/signer-protocol';
import {
  buildFullNativeCoinbase,
  buildNativeCoinbaseTemplate,
  buildStrippedNativeCoinbase,
  type NativeCoinbaseTemplate,
} from './coinbase.js';
import { buildNativeCoinbaseMerkleBranches } from './merkle.js';
import { encodeCompactSize } from './serialization.js';

export type NativeBitcoinJobBundle = {
  job: BitcoinMiningJob;
  coinbase: NativeCoinbaseTemplate;
  templateSourceDigest: string;
  transactionDataDigest: string;
  jobDigest: string;
  target: bigint;
  minimumNetworkTime: number;
  sizeLimit: number;
  weightLimit: number | null;
  templateTransactionWeight: number;
  transactionData: readonly string[];
};

export type NativeBitcoinJobInput = {
  template: BitcoinBlockTemplate;
  payoutAddress: string;
  payoutNetwork: BitcoinNetwork;
  extranonce1: string;
  extranonce2Size: number;
  assignedDifficulty: string;
  poolTag?: string;
};

export type NativeBitcoinBlockCandidate = {
  jobId: string;
  templateSourceDigest: string;
  coinbasePolicyDigest: string;
  blockHash: string;
  headerHex: string;
  coinbaseTxid: string;
  coinbaseWtxid: string;
  rawBlock: string;
  rawBlockDigest: string;
  reconstructedAt: Date;
};

function uint32Hex(value: number, field: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${field} must be a uint32 value`);
  }
  return value.toString(16).padStart(8, '0');
}

function transactionDigest(transactionData: readonly string[]): string {
  return sha256Hex(canonicalJson(transactionData));
}

function canonicalJobEvidence(bundle: Omit<NativeBitcoinJobBundle, 'jobDigest'>): unknown {
  return {
    job: {
      ...bundle.job,
      receivedAt: bundle.job.receivedAt.toISOString(),
      expiresAt: bundle.job.expiresAt.toISOString(),
    },
    coinbase: {
      ...bundle.coinbase,
      coinbaseValueAtomic: bundle.coinbase.coinbaseValueAtomic.toString(),
    },
    templateSourceDigest: bundle.templateSourceDigest,
    transactionDataDigest: bundle.transactionDataDigest,
    target: bundle.target.toString(),
    minimumNetworkTime: bundle.minimumNetworkTime,
    sizeLimit: bundle.sizeLimit,
    weightLimit: bundle.weightLimit,
    templateTransactionWeight: bundle.templateTransactionWeight,
  };
}

function calculateJobDigest(bundle: Omit<NativeBitcoinJobBundle, 'jobDigest'>): string {
  return sha256Hex(canonicalJson(canonicalJobEvidence(bundle)));
}

function displayTransactionHash(transaction: Uint8Array): string {
  return bytesToHex(reverseBytes(sha256d(transaction)));
}

function requireHex(value: string, bytes: number | undefined, field: string): void {
  if (
    value.length === 0 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(value) ||
    (bytes !== undefined && value.length !== bytes * 2)
  ) {
    throw new Error(`${field} is invalid`);
  }
}

export function assertNativeBitcoinJobBundle(bundle: NativeBitcoinJobBundle): void {
  if (!/^native-[1-9]\d{0,9}-[0-9a-f]{24}$/.test(bundle.job.id)) {
    throw new Error('Native mining job id is invalid');
  }
  requireHex(bundle.job.previousBlockHash, 32, 'Native job previous block hash');
  requireHex(bundle.job.coinbase1, undefined, 'Native job coinbase1');
  requireHex(bundle.job.coinbase2, undefined, 'Native job coinbase2');
  requireHex(bundle.job.extranonce1, undefined, 'Native job extranonce1');
  requireHex(bundle.job.version, 4, 'Native job version');
  requireHex(bundle.job.networkBits, 4, 'Native job network bits');
  requireHex(bundle.job.networkTime, 4, 'Native job network time');
  if (
    !Number.isInteger(bundle.job.extranonce2Size) ||
    bundle.job.extranonce2Size < 1 ||
    bundle.job.extranonce2Size > 16
  ) {
    throw new Error('Native job extranonce2 size is invalid');
  }
  if (bundle.job.merkleBranches.length > 32) {
    throw new Error('Native job merkle branch count is invalid');
  }
  for (const branch of bundle.job.merkleBranches) {
    requireHex(branch, 32, 'Native job merkle branch');
  }
  parsePositiveDecimal(bundle.job.assignedDifficulty);
  if (
    Number.isNaN(bundle.job.receivedAt.getTime()) ||
    Number.isNaN(bundle.job.expiresAt.getTime()) ||
    bundle.job.receivedAt.getTime() >= bundle.job.expiresAt.getTime() ||
    bundle.job.expiresAt.getTime() - bundle.job.receivedAt.getTime() > 300_000
  ) {
    throw new Error('Native job lifetime is invalid');
  }
  if (bundle.job.versionRollingMask !== undefined) {
    requireHex(bundle.job.versionRollingMask, 4, 'Native job version rolling mask');
  }

  requireHex(bundle.coinbase.coinbase1, undefined, 'Native coinbase1');
  requireHex(bundle.coinbase.coinbase2, undefined, 'Native coinbase2');
  requireHex(bundle.coinbase.fullCoinbase1, undefined, 'Native full coinbase1');
  requireHex(bundle.coinbase.fullCoinbase2, undefined, 'Native full coinbase2');
  requireHex(bundle.coinbase.extranonce1, undefined, 'Native coinbase extranonce1');
  requireHex(bundle.coinbase.payoutScriptPubKey, undefined, 'Native payout script');
  requireHex(bundle.coinbase.policyDigest, 32, 'Native coinbase policy digest');
  if (bundle.coinbase.witnessReservedValue !== null) {
    requireHex(bundle.coinbase.witnessReservedValue, 32, 'Native witness reserved value');
  }
  if (bundle.coinbase.witnessCommitment !== null) {
    if (!/^6a24aa21a9ed[0-9a-f]{64}$/i.test(bundle.coinbase.witnessCommitment)) {
      throw new Error('Native witness commitment is invalid');
    }
    if (bundle.coinbase.witnessReservedValue === null) {
      throw new Error('Native witness commitment requires a reserved value');
    }
  }
  if (
    bundle.coinbase.coinbaseValueAtomic < 0n ||
    bundle.coinbase.scriptSigBytes < 2 ||
    bundle.coinbase.scriptSigBytes > 100 ||
    bundle.coinbase.extranonce2Size !== bundle.job.extranonce2Size ||
    bundle.coinbase.extranonce1 !== bundle.job.extranonce1 ||
    bundle.coinbase.coinbase1 !== bundle.job.coinbase1 ||
    bundle.coinbase.coinbase2 !== bundle.job.coinbase2 ||
    bitcoinAddressToScriptPubKey(bundle.coinbase.payoutAddress, bundle.coinbase.payoutNetwork) !==
      bundle.coinbase.payoutScriptPubKey
  ) {
    throw new Error('Native coinbase evidence is inconsistent');
  }

  requireHex(bundle.templateSourceDigest, 32, 'Native template source digest');
  requireHex(bundle.transactionDataDigest, 32, 'Native transaction data digest');
  requireHex(bundle.jobDigest, 32, 'Native job digest');
  if (
    bundle.target <= 0n ||
    bundle.target >= 1n << 256n ||
    !Number.isInteger(bundle.minimumNetworkTime) ||
    bundle.minimumNetworkTime < 0 ||
    !Number.isInteger(bundle.sizeLimit) ||
    bundle.sizeLimit < 1 ||
    (bundle.weightLimit !== null &&
      (!Number.isInteger(bundle.weightLimit) || bundle.weightLimit < 1)) ||
    !Number.isInteger(bundle.templateTransactionWeight) ||
    bundle.templateTransactionWeight < 0 ||
    bundle.transactionData.length > 100_000
  ) {
    throw new Error('Native template limits are invalid');
  }
  let transactionBytes = 0;
  for (const transaction of bundle.transactionData) {
    requireHex(transaction, undefined, 'Native template transaction');
    transactionBytes += transaction.length / 2;
  }
  if (transactionBytes >= bundle.sizeLimit) {
    throw new Error('Native template transactions exhaust the size limit');
  }
  if (transactionDigest(bundle.transactionData) !== bundle.transactionDataDigest) {
    throw new Error('Native mining transaction evidence digest does not match');
  }
  const { jobDigest: _jobDigest, ...withoutDigest } = bundle;
  if (calculateJobDigest(withoutDigest) !== bundle.jobDigest) {
    throw new Error('Native mining job evidence digest does not match');
  }
}

export function buildNativeBitcoinJob(input: NativeBitcoinJobInput): NativeBitcoinJobBundle {
  parsePositiveDecimal(input.assignedDifficulty);
  const coinbase = buildNativeCoinbaseTemplate(input);
  const transactionIds = input.template.transactions.map((transaction) => transaction.txid);
  const transactionData = input.template.transactions.map((transaction) => transaction.data);
  const merkleBranches = buildNativeCoinbaseMerkleBranches(transactionIds);
  const identityDigest = sha256Hex(
    canonicalJson({
      templateSourceDigest: input.template.sourceDigest,
      coinbasePolicyDigest: coinbase.policyDigest,
      extranonce1: coinbase.extranonce1,
      assignedDifficulty: input.assignedDifficulty,
    }),
  );
  const requiredVersion =
    ((input.template.version >>> 0) | (input.template.versionBitsRequired >>> 0)) >>> 0;
  const job: BitcoinMiningJob = {
    id: `native-${input.template.height}-${identityDigest.slice(0, 24)}`,
    previousBlockHash: bytesToHex(reverseBytes(hexToBytes(input.template.previousBlockHash))),
    coinbase1: coinbase.coinbase1,
    coinbase2: coinbase.coinbase2,
    extranonce1: coinbase.extranonce1,
    extranonce2Size: coinbase.extranonce2Size,
    merkleBranches,
    version: requiredVersion.toString(16).padStart(8, '0'),
    networkBits: input.template.bits,
    networkTime: uint32Hex(input.template.currentTime, 'Template current time'),
    cleanJobs: true,
    assignedDifficulty: input.assignedDifficulty,
    receivedAt: new Date(input.template.observedAt),
    expiresAt: new Date(input.template.expiresAt),
  };
  const withoutDigest: Omit<NativeBitcoinJobBundle, 'jobDigest'> = {
    job,
    coinbase,
    templateSourceDigest: input.template.sourceDigest,
    transactionDataDigest: transactionDigest(transactionData),
    target: input.template.target,
    minimumNetworkTime: input.template.minimumTime,
    sizeLimit: input.template.sizeLimit,
    weightLimit: input.template.weightLimit,
    templateTransactionWeight: input.template.transactions.reduce(
      (total, transaction) => total + transaction.weight,
      0,
    ),
    transactionData,
  };
  const bundle = { ...withoutDigest, jobDigest: calculateJobDigest(withoutDigest) };
  assertNativeBitcoinJobBundle(bundle);
  return bundle;
}

export function reconstructNativeBitcoinBlockCandidate(
  bundle: NativeBitcoinJobBundle,
  submission: BitcoinShareSubmission,
  reconstructedAt = new Date(),
): NativeBitcoinBlockCandidate {
  assertNativeBitcoinJobBundle(bundle);
  if (submission.jobId !== bundle.job.id)
    throw new Error('Share does not belong to the native job');
  if (Number.isNaN(submission.submittedAt.getTime())) {
    throw new Error('Share submission time is invalid');
  }
  if (Number.isNaN(reconstructedAt.getTime()))
    throw new Error('Candidate reconstruction time is invalid');
  if (
    submission.submittedAt.getTime() > bundle.job.expiresAt.getTime() ||
    reconstructedAt.getTime() > bundle.job.expiresAt.getTime()
  ) {
    throw new Error('Native mining job has expired');
  }
  const submittedNetworkTime = Number.parseInt(submission.networkTime, 16);
  const jobNetworkTime = Number.parseInt(bundle.job.networkTime, 16);
  const maximumNetworkTime = Math.floor(reconstructedAt.getTime() / 1_000) + 7_200;
  if (
    !/^[0-9a-f]{8}$/i.test(submission.networkTime) ||
    submittedNetworkTime < bundle.minimumNetworkTime ||
    submittedNetworkTime < jobNetworkTime ||
    submittedNetworkTime > maximumNetworkTime
  ) {
    throw new Error('Share network time is outside the block template range');
  }
  const strippedCoinbase = buildStrippedNativeCoinbase(bundle.coinbase, submission.extranonce2);
  const fullCoinbase = buildFullNativeCoinbase(bundle.coinbase, submission.extranonce2);
  const header = buildBlockHeader(bundle.job, submission);
  const headerHash = calculateHeaderHash(bundle.job, submission);
  if (headerHash.numericValue > bundle.target) {
    throw new Error('Share does not meet the Bitcoin network target');
  }
  const transactions = bundle.transactionData.map((data) => Buffer.from(data, 'hex'));
  const rawBlock = Buffer.concat([
    Buffer.from(header),
    encodeCompactSize(transactions.length + 1),
    fullCoinbase,
    ...transactions,
  ]);
  if (rawBlock.length > bundle.sizeLimit) {
    throw new Error('Native block candidate exceeds the template size limit');
  }
  if (bundle.weightLimit !== null) {
    const blockOverheadBytes = header.length + encodeCompactSize(transactions.length + 1).length;
    const coinbaseWeight = strippedCoinbase.length * 3 + fullCoinbase.length;
    const blockWeight = blockOverheadBytes * 4 + coinbaseWeight + bundle.templateTransactionWeight;
    if (blockWeight > bundle.weightLimit) {
      throw new Error('Native block candidate exceeds the template weight limit');
    }
  }
  return {
    jobId: bundle.job.id,
    templateSourceDigest: bundle.templateSourceDigest,
    coinbasePolicyDigest: bundle.coinbase.policyDigest,
    blockHash: headerHash.displayHash,
    headerHex: bytesToHex(header),
    coinbaseTxid: displayTransactionHash(strippedCoinbase),
    coinbaseWtxid: displayTransactionHash(fullCoinbase),
    rawBlock: rawBlock.toString('hex'),
    rawBlockDigest: bytesToHex(sha256(rawBlock)),
    reconstructedAt: new Date(reconstructedAt),
  };
}
