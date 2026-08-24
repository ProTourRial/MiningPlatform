/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinNetwork } from '@mining/blockchain-adapters';
import type { BitcoinMiningJob } from '@mining/mining-core';
import { canonicalJson } from '@mining/signer-protocol';
import type { NativeCoinbaseTemplate } from './coinbase.js';
import { assertNativeBitcoinJobBundle, type NativeBitcoinJobBundle } from './native-job.js';

const STORED_JOB_VERSION = 1;

type JsonRecord = Record<string, unknown>;

function record(value: unknown, field: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonRecord;
}

function string(value: unknown, field: string, maximumLength = 16_777_216): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(`${field} must be a bounded string`);
  }
  return value;
}

function nullableString(value: unknown, field: string, maximumLength?: number): string | null {
  if (value === null) return null;
  return string(value, field, maximumLength);
}

function optionalString(value: unknown, field: string, maximumLength?: number): string | undefined {
  if (value === undefined) return undefined;
  return string(value, field, maximumLength);
}

function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${field} must be a safe integer`);
  return value as number;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function date(value: unknown, field: string): Date {
  const parsed = new Date(string(value, field, 64));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be an ISO date`);
  return parsed;
}

function stringArray(value: unknown, field: string, maximumEntries: number): string[] {
  if (!Array.isArray(value) || value.length > maximumEntries) {
    throw new Error(`${field} must be a bounded array`);
  }
  return value.map((entry, index) => string(entry, `${field}[${index}]`));
}

function decimalBigInt(value: unknown, field: string): bigint {
  const normalized = string(value, field, 80);
  if (!/^\d+$/.test(normalized)) throw new Error(`${field} must be unsigned decimal`);
  return BigInt(normalized);
}

function payoutNetwork(value: unknown): BitcoinNetwork {
  if (value !== 'mainnet' && value !== 'testnet' && value !== 'regtest') {
    throw new Error('Stored payout network is invalid');
  }
  return value;
}

export function serializeNativeBitcoinJobBundle(bundle: NativeBitcoinJobBundle): string {
  assertNativeBitcoinJobBundle(bundle);
  return canonicalJson({
    version: STORED_JOB_VERSION,
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
    jobDigest: bundle.jobDigest,
    target: bundle.target.toString(),
    minimumNetworkTime: bundle.minimumNetworkTime,
    sizeLimit: bundle.sizeLimit,
    weightLimit: bundle.weightLimit,
    templateTransactionWeight: bundle.templateTransactionWeight,
    transactionData: bundle.transactionData,
  });
}

export function deserializeNativeBitcoinJobBundle(serialized: string): NativeBitcoinJobBundle {
  if (Buffer.byteLength(serialized) > 16 * 1024 * 1024) {
    throw new Error('Stored native job exceeds 16 MiB');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Stored native job is not valid JSON');
  }
  const root = record(parsed, 'Stored native job');
  if (root.version !== STORED_JOB_VERSION) {
    throw new Error('Stored native job version is unsupported');
  }
  const storedJob = record(root.job, 'Stored native job.job');
  const storedCoinbase = record(root.coinbase, 'Stored native job.coinbase');
  const job: BitcoinMiningJob = {
    id: string(storedJob.id, 'Stored native job id', 256),
    previousBlockHash: string(storedJob.previousBlockHash, 'Stored previous block hash', 64),
    coinbase1: string(storedJob.coinbase1, 'Stored coinbase1'),
    coinbase2: string(storedJob.coinbase2, 'Stored coinbase2'),
    extranonce1: string(storedJob.extranonce1, 'Stored extranonce1', 32),
    extranonce2Size: integer(storedJob.extranonce2Size, 'Stored extranonce2 size'),
    merkleBranches: stringArray(storedJob.merkleBranches, 'Stored merkle branches', 32),
    version: string(storedJob.version, 'Stored version', 8),
    networkBits: string(storedJob.networkBits, 'Stored network bits', 8),
    networkTime: string(storedJob.networkTime, 'Stored network time', 8),
    cleanJobs: boolean(storedJob.cleanJobs, 'Stored cleanJobs'),
    assignedDifficulty: string(storedJob.assignedDifficulty, 'Stored assigned difficulty', 128),
    receivedAt: date(storedJob.receivedAt, 'Stored receivedAt'),
    expiresAt: date(storedJob.expiresAt, 'Stored expiresAt'),
    versionRollingMask: optionalString(
      storedJob.versionRollingMask,
      'Stored version rolling mask',
      8,
    ),
  };
  const coinbase: NativeCoinbaseTemplate = {
    coinbase1: string(storedCoinbase.coinbase1, 'Stored native coinbase1'),
    coinbase2: string(storedCoinbase.coinbase2, 'Stored native coinbase2'),
    fullCoinbase1: string(storedCoinbase.fullCoinbase1, 'Stored full coinbase1'),
    fullCoinbase2: string(storedCoinbase.fullCoinbase2, 'Stored full coinbase2'),
    payoutAddress: string(storedCoinbase.payoutAddress, 'Stored payout address', 90),
    payoutNetwork: payoutNetwork(storedCoinbase.payoutNetwork),
    payoutScriptPubKey: string(storedCoinbase.payoutScriptPubKey, 'Stored payout script', 84),
    coinbaseValueAtomic: decimalBigInt(storedCoinbase.coinbaseValueAtomic, 'Stored coinbase value'),
    scriptSigBytes: integer(storedCoinbase.scriptSigBytes, 'Stored scriptSig bytes'),
    extranonce1: string(storedCoinbase.extranonce1, 'Stored coinbase extranonce1', 32),
    extranonce2Size: integer(storedCoinbase.extranonce2Size, 'Stored coinbase extranonce2 size'),
    witnessReservedValue: nullableString(
      storedCoinbase.witnessReservedValue,
      'Stored witness reserved value',
      64,
    ),
    witnessCommitment: nullableString(
      storedCoinbase.witnessCommitment,
      'Stored witness commitment',
      76,
    ),
    policyDigest: string(storedCoinbase.policyDigest, 'Stored coinbase policy digest', 64),
  };
  const weightLimitValue = root.weightLimit;
  const bundle: NativeBitcoinJobBundle = {
    job,
    coinbase,
    templateSourceDigest: string(root.templateSourceDigest, 'Stored template digest', 64),
    transactionDataDigest: string(root.transactionDataDigest, 'Stored transaction digest', 64),
    jobDigest: string(root.jobDigest, 'Stored job digest', 64),
    target: decimalBigInt(root.target, 'Stored target'),
    minimumNetworkTime: integer(root.minimumNetworkTime, 'Stored minimum network time'),
    sizeLimit: integer(root.sizeLimit, 'Stored size limit'),
    weightLimit:
      weightLimitValue === null ? null : integer(weightLimitValue, 'Stored weight limit'),
    templateTransactionWeight: integer(root.templateTransactionWeight, 'Stored transaction weight'),
    transactionData: stringArray(root.transactionData, 'Stored transaction data', 100_000),
  };
  assertNativeBitcoinJobBundle(bundle);
  return bundle;
}
