/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinBlockTemplate, BitcoinNetwork } from '@mining/blockchain-adapters';
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
  return { ...withoutDigest, jobDigest: calculateJobDigest(withoutDigest) };
}

export function reconstructNativeBitcoinBlockCandidate(
  bundle: NativeBitcoinJobBundle,
  submission: BitcoinShareSubmission,
  reconstructedAt = new Date(),
): NativeBitcoinBlockCandidate {
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
  const { jobDigest: _jobDigest, ...withoutDigest } = bundle;
  if (calculateJobDigest(withoutDigest) !== bundle.jobDigest) {
    throw new Error('Native mining job evidence digest does not match');
  }
  if (transactionDigest(bundle.transactionData) !== bundle.transactionDataDigest) {
    throw new Error('Native mining transaction evidence digest does not match');
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
