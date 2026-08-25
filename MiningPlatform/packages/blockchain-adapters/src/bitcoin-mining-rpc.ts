/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { canonicalJson, sha256Hex } from '@mining/signer-protocol';
import { BitcoinRpcError } from './bitcoin-rpc.js';
import type { BitcoinJsonRpcClient } from './bitcoin-rpc.js';

const HASH_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const COMPACT_BITS_PATTERN = /^[0-9a-f]{8}$/i;
const NONCE_RANGE_PATTERN = /^[0-9a-f]{16}$/i;
const WITNESS_COMMITMENT_PATTERN = /^6a24aa21a9ed[0-9a-f]{64}$/i;
const MAXIMUM_TEMPLATE_TRANSACTIONS = 100_000;
const MAXIMUM_TRANSACTION_BYTES = 4_000_000;
const MAXIMUM_BLOCK_LIMIT = 16_000_000;
const MAXIMUM_BITCOIN_ATOMIC = 2_100_000_000_000_000n;
const MAXIMUM_RAW_BLOCK_BYTES = 4_000_000;

export type BitcoinCoreChain = 'main' | 'test' | 'testnet4' | 'signet' | 'regtest';

export type BitcoinMiningReadinessBlocker =
  | 'CHAIN_MISMATCH'
  | 'INITIAL_BLOCK_DOWNLOAD'
  | 'HEADER_BLOCK_MISMATCH'
  | 'NETWORK_INACTIVE'
  | 'NODE_VERSION_UNSUPPORTED'
  | 'NODE_WARNING';

export type BitcoinMiningNodeReadiness = {
  ready: boolean;
  blockers: readonly BitcoinMiningReadinessBlocker[];
  expectedChain: BitcoinCoreChain;
  observedChain: BitcoinCoreChain;
  blocks: number;
  headers: number;
  bestBlockHash: string;
  verificationProgress: number;
  initialBlockDownload: boolean;
  nodeVersion: number;
  subversion: string;
  networkActive: boolean;
  warnings: readonly string[];
  observedAt: Date;
  sourceDigest: string;
};

export type BitcoinBlockTemplateTransaction = {
  data: string;
  txid: string;
  hash: string;
  depends: readonly number[];
  feeAtomic: bigint | null;
  sigops: number | null;
  weight: number;
};

export type BitcoinBlockTemplate = {
  version: number;
  versionHex: string;
  rules: readonly string[];
  versionBitsAvailable: Readonly<Record<string, number>>;
  versionBitsRequired: number;
  capabilities: readonly string[];
  previousBlockHash: string;
  transactions: readonly BitcoinBlockTemplateTransaction[];
  coinbaseAux: Readonly<Record<string, string>>;
  coinbaseValueAtomic: bigint;
  longPollId: string;
  targetHex: string;
  target: bigint;
  minimumTime: number;
  mutable: readonly string[];
  nonceRange: string;
  sigopLimit: number;
  sizeLimit: number;
  weightLimit: number | null;
  currentTime: number;
  bits: string;
  height: number;
  workId: string | null;
  defaultWitnessCommitment: string | null;
  observedAt: Date;
  expiresAt: Date;
  sourceDigest: string;
};

export type BitcoinNativeMiningRpcAdapterOptions = {
  expectedChain: BitcoinCoreChain;
  minimumNodeVersion?: number;
  templateMaximumAgeMilliseconds?: number;
  proposalMaximumAgeMilliseconds?: number;
  now?: () => Date;
};

export type BitcoinBlockProposalResult = {
  status: 'VALID' | 'REJECTED';
  reason: string | null;
  rawBlockDigest: string;
  observedAt: Date;
  sourceDigest: string;
};

export type BitcoinBlockSubmissionResult = {
  status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'INCONCLUSIVE';
  reason: string | null;
  rawBlockDigest: string;
  workId: string | null;
  observedAt: Date;
  sourceDigest: string;
};

export type BitcoinSubmittedBlockObservation = {
  status: 'ACTIVE_CHAIN' | 'STALE_CHAIN' | 'NOT_FOUND';
  blockHash: string;
  confirmations: number;
  blockHeight: number | null;
  transactionCount: number | null;
  chainTipHash: string;
  chainHeight: number;
  observedAt: Date;
  sourceDigest: string;
};

type CoreChainInfo = {
  chain: unknown;
  blocks: unknown;
  headers: unknown;
  bestblockhash: unknown;
  verificationprogress: unknown;
  initialblockdownload: unknown;
  warnings: unknown;
};

type CoreNetworkInfo = {
  version: unknown;
  subversion: unknown;
  networkactive: unknown;
  warnings: unknown;
};

function invalid(method: string, message: string): never {
  throw new BitcoinRpcError(`Bitcoin Core ${message}`, null, method);
}

function normalizeRawBlock(rawBlock: string, method: string): string {
  if (
    rawBlock.length < 162 ||
    rawBlock.length > MAXIMUM_RAW_BLOCK_BYTES * 2 ||
    rawBlock.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(rawBlock)
  ) {
    invalid(method, 'raw block must be bounded canonical hex');
  }
  return rawBlock.toLowerCase();
}

function rawBlockDigest(rawBlock: string): string {
  return createHash('sha256').update(Buffer.from(rawBlock, 'hex')).digest('hex');
}

function normalizeMiningRpcResult(
  value: unknown,
  method: 'getblocktemplate' | 'submitblock',
): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    invalid(method, 'returned an invalid mining result');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string, method: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(method, `${field} must be an object`);
  return value;
}

function requireString(
  value: unknown,
  field: string,
  method: string,
  maximumLength = 1024,
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    invalid(method, `${field} must be a bounded non-empty string`);
  }
  return value;
}

function requireInteger(
  value: unknown,
  field: string,
  method: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid(method, `${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function requireFiniteNumber(
  value: unknown,
  field: string,
  method: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(method, `${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string, method: string): boolean {
  if (typeof value !== 'boolean') invalid(method, `${field} must be boolean`);
  return value;
}

function requireHex(
  value: unknown,
  field: string,
  method: string,
  bytes?: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length % 2 !== 0 ||
    (value.length > 0 && !/^[0-9a-f]+$/i.test(value)) ||
    (bytes !== undefined && value.length !== bytes * 2)
  ) {
    invalid(method, `${field} must be valid${bytes === undefined ? '' : ` ${bytes}-byte`} hex`);
  }
  return value.toLowerCase();
}

function requireStringArray(
  value: unknown,
  field: string,
  method: string,
  maximumEntries = 256,
): string[] {
  if (!Array.isArray(value) || value.length > maximumEntries) {
    invalid(method, `${field} must be a bounded string array`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`, method, 128));
}

function requireWarnings(value: unknown, method: string): string[] {
  if (!Array.isArray(value) || value.length > 128) {
    invalid(method, 'warnings must be a bounded string array');
  }
  return value.map((warning, index) => requireString(warning, `warnings[${index}]`, method, 2048));
}

function parseCoreChain(value: unknown, method: string): BitcoinCoreChain {
  if (!['main', 'test', 'testnet4', 'signet', 'regtest'].includes(String(value))) {
    invalid(method, 'chain is unsupported');
  }
  return value as BitcoinCoreChain;
}

function compactTarget(bits: string): bigint {
  if (!COMPACT_BITS_PATTERN.test(bits)) invalid('getblocktemplate', 'bits is invalid');
  const compact = Number.parseInt(bits, 16) >>> 0;
  const exponent = compact >>> 24;
  const negative = (compact & 0x00800000) !== 0;
  const mantissa = compact & 0x007fffff;
  if (negative || mantissa === 0) invalid('getblocktemplate', 'bits encodes an invalid target');
  const target =
    exponent <= 3
      ? BigInt(mantissa) >> BigInt(8 * (3 - exponent))
      : BigInt(mantissa) << BigInt(8 * (exponent - 3));
  if (target <= 0n || target >= 1n << 256n) {
    invalid('getblocktemplate', 'bits target is outside uint256 range');
  }
  return target;
}

function parseTemplateTransaction(
  value: unknown,
  transactionIndex: number,
): BitcoinBlockTemplateTransaction {
  const method = 'getblocktemplate';
  const transaction = requireRecord(value, `transactions[${transactionIndex}]`, method);
  const data = requireHex(transaction.data, `transactions[${transactionIndex}].data`, method);
  if (data.length / 2 > MAXIMUM_TRANSACTION_BYTES) {
    invalid(method, `transactions[${transactionIndex}].data exceeds the transaction limit`);
  }
  const txid = requireString(
    transaction.txid,
    `transactions[${transactionIndex}].txid`,
    method,
    64,
  );
  const hash = requireString(
    transaction.hash,
    `transactions[${transactionIndex}].hash`,
    method,
    64,
  );
  if (!HASH_HEX_PATTERN.test(txid) || !HASH_HEX_PATTERN.test(hash)) {
    invalid(method, `transactions[${transactionIndex}] hashes must be 32-byte hex`);
  }
  if (!Array.isArray(transaction.depends) || transaction.depends.length > transactionIndex) {
    invalid(method, `transactions[${transactionIndex}].depends is invalid`);
  }
  const depends = transaction.depends.map((dependency, dependencyIndex) =>
    requireInteger(
      dependency,
      `transactions[${transactionIndex}].depends[${dependencyIndex}]`,
      method,
      1,
      transactionIndex,
    ),
  );
  if (new Set(depends).size !== depends.length) {
    invalid(method, `transactions[${transactionIndex}].depends contains duplicates`);
  }
  const feeAtomic =
    transaction.fee === undefined
      ? null
      : BigInt(
          requireInteger(
            transaction.fee,
            `transactions[${transactionIndex}].fee`,
            method,
            0,
            Number(MAXIMUM_BITCOIN_ATOMIC),
          ),
        );
  const sigops =
    transaction.sigops === undefined
      ? null
      : requireInteger(
          transaction.sigops,
          `transactions[${transactionIndex}].sigops`,
          method,
          0,
          MAXIMUM_BLOCK_LIMIT,
        );
  const weight = requireInteger(
    transaction.weight,
    `transactions[${transactionIndex}].weight`,
    method,
    1,
    MAXIMUM_BLOCK_LIMIT,
  );
  return {
    data,
    txid: txid.toLowerCase(),
    hash: hash.toLowerCase(),
    depends,
    feeAtomic,
    sigops,
    weight,
  };
}

export function normalizeBitcoinBlockTemplate(
  value: unknown,
  observedAt: Date,
  maximumAgeMilliseconds = 120_000,
): BitcoinBlockTemplate {
  const method = 'getblocktemplate';
  if (!Number.isInteger(maximumAgeMilliseconds) || maximumAgeMilliseconds < 1000) {
    throw new Error('Bitcoin template maximum age must be at least one second');
  }
  if (Number.isNaN(observedAt.getTime()))
    throw new Error('Bitcoin template observation time is invalid');
  const template = requireRecord(value, 'template response', method);
  const version = requireInteger(template.version, 'version', method, -0x80000000, 0xffffffff);
  const rules = requireStringArray(template.rules, 'rules', method);
  if (!rules.some((rule) => rule.replace(/^!/, '') === 'segwit')) {
    invalid(method, 'template does not declare the required segwit rule');
  }
  const versionBitsAvailableRaw = requireRecord(template.vbavailable, 'vbavailable', method);
  const versionBitsAvailable = Object.fromEntries(
    Object.entries(versionBitsAvailableRaw).map(([rule, bit]) => [
      requireString(rule, 'vbavailable rule', method, 128),
      requireInteger(bit, `vbavailable.${rule}`, method, 0, 28),
    ]),
  );
  const capabilities = requireStringArray(template.capabilities, 'capabilities', method);
  const versionBitsRequired = requireInteger(
    template.vbrequired,
    'vbrequired',
    method,
    0,
    0xffffffff,
  );
  const previousBlockHash = requireString(
    template.previousblockhash,
    'previousblockhash',
    method,
    64,
  );
  if (!HASH_HEX_PATTERN.test(previousBlockHash)) {
    invalid(method, 'previousblockhash must be 32-byte hex');
  }
  if (
    !Array.isArray(template.transactions) ||
    template.transactions.length > MAXIMUM_TEMPLATE_TRANSACTIONS
  ) {
    invalid(method, 'transactions must be a bounded array');
  }
  const transactions = template.transactions.map(parseTemplateTransaction);
  const coinbaseAuxRaw = requireRecord(template.coinbaseaux, 'coinbaseaux', method);
  const coinbaseAux = Object.fromEntries(
    Object.entries(coinbaseAuxRaw).map(([key, entry]) => [
      requireString(key, 'coinbaseaux key', method, 64),
      requireHex(entry, `coinbaseaux.${key}`, method, undefined, true),
    ]),
  );
  const coinbaseValueAtomic = BigInt(
    requireInteger(
      template.coinbasevalue,
      'coinbasevalue',
      method,
      0,
      Number(MAXIMUM_BITCOIN_ATOMIC),
    ),
  );
  const longPollId = requireString(template.longpollid, 'longpollid', method, 2048);
  const targetHex = requireString(template.target, 'target', method, 64).toLowerCase();
  if (!HASH_HEX_PATTERN.test(targetHex)) invalid(method, 'target must be 32-byte hex');
  const target = BigInt(`0x${targetHex}`);
  const minimumTime = requireInteger(template.mintime, 'mintime', method, 0);
  const mutable = requireStringArray(template.mutable, 'mutable', method);
  const nonceRange = requireString(template.noncerange, 'noncerange', method, 16).toLowerCase();
  if (!NONCE_RANGE_PATTERN.test(nonceRange)) invalid(method, 'noncerange must be eight-byte hex');
  const sigopLimit = requireInteger(
    template.sigoplimit,
    'sigoplimit',
    method,
    1,
    MAXIMUM_BLOCK_LIMIT,
  );
  const sizeLimit = requireInteger(template.sizelimit, 'sizelimit', method, 1, MAXIMUM_BLOCK_LIMIT);
  const weightLimit =
    template.weightlimit === undefined
      ? null
      : requireInteger(template.weightlimit, 'weightlimit', method, 1, MAXIMUM_BLOCK_LIMIT);
  const currentTime = requireInteger(template.curtime, 'curtime', method, minimumTime);
  const bits = requireString(template.bits, 'bits', method, 8).toLowerCase();
  if (!COMPACT_BITS_PATTERN.test(bits)) invalid(method, 'bits must be four-byte hex');
  if (compactTarget(bits) !== target) invalid(method, 'target does not match compact bits');
  const height = requireInteger(template.height, 'height', method, 1, 0x7fffffff);
  const workId =
    template.workid === undefined ? null : requireString(template.workid, 'workid', method, 1024);
  const defaultWitnessCommitment =
    template.default_witness_commitment === undefined
      ? null
      : requireString(
          template.default_witness_commitment,
          'default_witness_commitment',
          method,
          76,
        ).toLowerCase();
  if (
    defaultWitnessCommitment !== null &&
    !WITNESS_COMMITMENT_PATTERN.test(defaultWitnessCommitment)
  ) {
    invalid(method, 'default_witness_commitment is malformed');
  }
  const transactionBytes = transactions.reduce(
    (total, transaction) => total + transaction.data.length / 2,
    0,
  );
  if (transactionBytes >= sizeLimit) invalid(method, 'transactions exhaust the block size limit');
  const transactionWeight = transactions.reduce(
    (total, transaction) => total + transaction.weight,
    0,
  );
  if (weightLimit !== null && transactionWeight >= weightLimit) {
    invalid(method, 'transactions exhaust the block weight limit');
  }
  return {
    version,
    versionHex: (version >>> 0).toString(16).padStart(8, '0'),
    rules,
    versionBitsAvailable,
    versionBitsRequired,
    capabilities,
    previousBlockHash: previousBlockHash.toLowerCase(),
    transactions,
    coinbaseAux,
    coinbaseValueAtomic,
    longPollId,
    targetHex,
    target,
    minimumTime,
    mutable,
    nonceRange,
    sigopLimit,
    sizeLimit,
    weightLimit,
    currentTime,
    bits,
    height,
    workId,
    defaultWitnessCommitment,
    observedAt,
    expiresAt: new Date(observedAt.getTime() + maximumAgeMilliseconds),
    sourceDigest: sha256Hex(canonicalJson(template)),
  };
}

export class BitcoinNativeMiningRpcAdapter {
  private readonly minimumNodeVersion: number;
  private readonly templateMaximumAgeMilliseconds: number;
  private readonly proposalMaximumAgeMilliseconds: number;
  private readonly now: () => Date;

  constructor(
    private readonly rpc: BitcoinJsonRpcClient,
    private readonly options: BitcoinNativeMiningRpcAdapterOptions,
  ) {
    this.minimumNodeVersion = options.minimumNodeVersion ?? 300_000;
    this.templateMaximumAgeMilliseconds = options.templateMaximumAgeMilliseconds ?? 120_000;
    this.proposalMaximumAgeMilliseconds = options.proposalMaximumAgeMilliseconds ?? 30_000;
    this.now = options.now ?? (() => new Date());
    if (!Number.isInteger(this.minimumNodeVersion) || this.minimumNodeVersion < 0) {
      throw new Error('Bitcoin Core minimum version is invalid');
    }
    if (
      !Number.isInteger(this.templateMaximumAgeMilliseconds) ||
      this.templateMaximumAgeMilliseconds < 1000
    ) {
      throw new Error('Bitcoin template maximum age must be at least one second');
    }
    if (
      !Number.isInteger(this.proposalMaximumAgeMilliseconds) ||
      this.proposalMaximumAgeMilliseconds < 1000 ||
      this.proposalMaximumAgeMilliseconds > 300_000
    ) {
      throw new Error('Bitcoin proposal maximum age must be between one second and five minutes');
    }
  }

  async getMiningReadiness(): Promise<BitcoinMiningNodeReadiness> {
    const method = 'getblockchaininfo';
    const [chainRaw, networkRaw] = await Promise.all([
      this.rpc.call<CoreChainInfo>('getblockchaininfo'),
      this.rpc.call<CoreNetworkInfo>('getnetworkinfo'),
    ]);
    const chain = requireRecord(chainRaw, 'getblockchaininfo response', method);
    const network = requireRecord(networkRaw, 'getnetworkinfo response', 'getnetworkinfo');
    const observedChain = parseCoreChain(chain.chain, method);
    const blocks = requireInteger(chain.blocks, 'blocks', method);
    const headers = requireInteger(chain.headers, 'headers', method);
    const bestBlockHash = requireString(chain.bestblockhash, 'bestblockhash', method, 64);
    if (!HASH_HEX_PATTERN.test(bestBlockHash)) invalid(method, 'bestblockhash must be 32-byte hex');
    const verificationProgress = requireFiniteNumber(
      chain.verificationprogress,
      'verificationprogress',
      method,
      0,
      1,
    );
    const initialBlockDownload = requireBoolean(
      chain.initialblockdownload,
      'initialblockdownload',
      method,
    );
    const nodeVersion = requireInteger(network.version, 'version', 'getnetworkinfo');
    const subversion = requireString(network.subversion, 'subversion', 'getnetworkinfo', 256);
    const networkActive = requireBoolean(network.networkactive, 'networkactive', 'getnetworkinfo');
    const warnings = [
      ...requireWarnings(chain.warnings, method),
      ...requireWarnings(network.warnings, 'getnetworkinfo'),
    ];
    const blockers: BitcoinMiningReadinessBlocker[] = [];
    if (observedChain !== this.options.expectedChain) blockers.push('CHAIN_MISMATCH');
    if (initialBlockDownload) blockers.push('INITIAL_BLOCK_DOWNLOAD');
    if (headers !== blocks) blockers.push('HEADER_BLOCK_MISMATCH');
    if (!networkActive) blockers.push('NETWORK_INACTIVE');
    if (nodeVersion < this.minimumNodeVersion) blockers.push('NODE_VERSION_UNSUPPORTED');
    if (warnings.length > 0) blockers.push('NODE_WARNING');
    const observedAt = this.now();
    if (Number.isNaN(observedAt.getTime()))
      throw new Error('Bitcoin readiness observation time is invalid');
    return {
      ready: blockers.length === 0,
      blockers,
      expectedChain: this.options.expectedChain,
      observedChain,
      blocks,
      headers,
      bestBlockHash: bestBlockHash.toLowerCase(),
      verificationProgress,
      initialBlockDownload,
      nodeVersion,
      subversion,
      networkActive,
      warnings,
      observedAt,
      sourceDigest: sha256Hex(canonicalJson({ chain, network })),
    };
  }

  async getBlockTemplate(longPollId?: string): Promise<BitcoinBlockTemplate> {
    if (longPollId !== undefined) {
      requireString(longPollId, 'longpollid', 'getblocktemplate', 2048);
    }
    const readiness = await this.getMiningReadiness();
    if (!readiness.ready) {
      throw new BitcoinRpcError(
        `Bitcoin Core is not ready for native mining: ${readiness.blockers.join(', ')}`,
        null,
        'getblocktemplate',
      );
    }
    const request: Record<string, unknown> = {
      mode: 'template',
      capabilities: ['longpoll', 'coinbasevalue', 'proposal', 'workid'],
      rules: ['segwit'],
    };
    if (longPollId !== undefined) request.longpollid = longPollId;
    const raw = await this.rpc.call<unknown>('getblocktemplate', [request]);
    return normalizeBitcoinBlockTemplate(raw, this.now(), this.templateMaximumAgeMilliseconds);
  }

  async validateBlockProposal(rawBlock: string): Promise<BitcoinBlockProposalResult> {
    const normalizedBlock = normalizeRawBlock(rawBlock, 'getblocktemplate');
    const readiness = await this.getMiningReadiness();
    if (!readiness.ready) {
      throw new BitcoinRpcError(
        `Bitcoin Core is not ready to validate a block proposal: ${readiness.blockers.join(', ')}`,
        null,
        'getblocktemplate',
      );
    }
    const rawResult = await this.rpc.callNullable<unknown>('getblocktemplate', [
      { mode: 'proposal', data: normalizedBlock },
    ]);
    const reason = normalizeMiningRpcResult(rawResult, 'getblocktemplate');
    const observedAt = this.now();
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error('Bitcoin proposal observation time is invalid');
    }
    const digest = rawBlockDigest(normalizedBlock);
    return {
      status: reason === null ? 'VALID' : 'REJECTED',
      reason,
      rawBlockDigest: digest,
      observedAt,
      sourceDigest: sha256Hex(
        canonicalJson({ method: 'getblocktemplate', mode: 'proposal', digest, result: rawResult }),
      ),
    };
  }

  async submitBlock(
    rawBlock: string,
    proposal: BitcoinBlockProposalResult,
    workId?: string,
  ): Promise<BitcoinBlockSubmissionResult> {
    const normalizedBlock = normalizeRawBlock(rawBlock, 'submitblock');
    if (workId !== undefined) requireString(workId, 'workid', 'submitblock', 1024);
    const digest = rawBlockDigest(normalizedBlock);
    const now = this.now();
    if (Number.isNaN(now.getTime())) throw new Error('Bitcoin submission time is invalid');
    const proposalSourceDigest = sha256Hex(
      canonicalJson({
        method: 'getblocktemplate',
        mode: 'proposal',
        digest,
        result: null,
      }),
    );
    if (
      proposal.status !== 'VALID' ||
      proposal.reason !== null ||
      proposal.rawBlockDigest !== digest ||
      proposal.sourceDigest !== proposalSourceDigest ||
      Number.isNaN(proposal.observedAt.getTime()) ||
      proposal.observedAt.getTime() > now.getTime() ||
      now.getTime() - proposal.observedAt.getTime() > this.proposalMaximumAgeMilliseconds
    ) {
      throw new BitcoinRpcError(
        'Bitcoin block submission requires fresh matching valid proposal evidence',
        null,
        'submitblock',
      );
    }
    const readiness = await this.getMiningReadiness();
    if (!readiness.ready) {
      throw new BitcoinRpcError(
        `Bitcoin Core is not ready to submit a block: ${readiness.blockers.join(', ')}`,
        null,
        'submitblock',
      );
    }
    const params: unknown[] = [normalizedBlock];
    if (workId !== undefined) params.push(workId);
    const rawResult = await this.rpc.callNullable<unknown>('submitblock', params);
    const reason = normalizeMiningRpcResult(rawResult, 'submitblock');
    const status =
      reason === null
        ? 'ACCEPTED'
        : reason === 'duplicate'
        ? 'DUPLICATE'
        : reason === 'inconclusive' || reason === 'duplicate-inconclusive'
        ? 'INCONCLUSIVE'
        : 'REJECTED';
    const observedAt = this.now();
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error('Bitcoin submission observation time is invalid');
    }
    return {
      status,
      reason,
      rawBlockDigest: digest,
      workId: workId ?? null,
      observedAt,
      sourceDigest: sha256Hex(
        canonicalJson({ method: 'submitblock', digest, workId: workId ?? null, result: rawResult }),
      ),
    };
  }

  async observeSubmittedBlock(blockHash: string): Promise<BitcoinSubmittedBlockObservation> {
    const method = 'getblockheader';
    const normalizedBlockHash = requireHex(blockHash, 'blockhash', method, 32);
    const readiness = await this.getMiningReadiness();
    if (!readiness.ready) {
      throw new BitcoinRpcError(
        `Bitcoin Core is not ready to observe a submitted block: ${readiness.blockers.join(', ')}`,
        null,
        method,
      );
    }

    let rawHeader: unknown;
    try {
      rawHeader = await this.rpc.call<unknown>('getblockheader', [normalizedBlockHash, true]);
    } catch (error) {
      if (!(error instanceof BitcoinRpcError) || error.code !== -5) throw error;
      const observedAt = this.now();
      if (Number.isNaN(observedAt.getTime())) {
        throw new Error('Bitcoin block recovery observation time is invalid');
      }
      return {
        status: 'NOT_FOUND',
        blockHash: normalizedBlockHash,
        confirmations: 0,
        blockHeight: null,
        transactionCount: null,
        chainTipHash: readiness.bestBlockHash,
        chainHeight: readiness.blocks,
        observedAt,
        sourceDigest: sha256Hex(
          canonicalJson({
            method: 'getblockheader',
            blockHash: normalizedBlockHash,
            result: 'NOT_FOUND',
            readinessSourceDigest: readiness.sourceDigest,
          }),
        ),
      };
    }

    const rawStats = await this.rpc.call<unknown>('getblockstats', [
      normalizedBlockHash,
      ['blockhash', 'height', 'txs'],
    ]);
    const header = requireRecord(rawHeader, 'getblockheader response', method);
    const stats = requireRecord(rawStats, 'getblockstats response', 'getblockstats');
    const observedHash = requireHex(header.hash, 'hash', method, 32);
    const statsHash = requireHex(stats.blockhash, 'blockhash', 'getblockstats', 32);
    const confirmations = requireInteger(header.confirmations, 'confirmations', method, -1);
    const blockHeight = requireInteger(header.height, 'height', method);
    const statsHeight = requireInteger(stats.height, 'height', 'getblockstats');
    const transactionCount = requireInteger(
      stats.txs,
      'txs',
      'getblockstats',
      1,
      MAXIMUM_TEMPLATE_TRANSACTIONS + 1,
    );
    if (
      observedHash !== normalizedBlockHash ||
      statsHash !== normalizedBlockHash ||
      statsHeight !== blockHeight ||
      confirmations === 0 ||
      (confirmations > 0 && confirmations !== readiness.blocks - blockHeight + 1)
    ) {
      invalid(method, 'returned inconsistent submitted-block evidence');
    }
    const observedAt = this.now();
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error('Bitcoin block recovery observation time is invalid');
    }
    return {
      status: confirmations === -1 ? 'STALE_CHAIN' : 'ACTIVE_CHAIN',
      blockHash: normalizedBlockHash,
      confirmations,
      blockHeight,
      transactionCount,
      chainTipHash: readiness.bestBlockHash,
      chainHeight: readiness.blocks,
      observedAt,
      sourceDigest: sha256Hex(
        canonicalJson({
          method: 'observeSubmittedBlock',
          blockHash: normalizedBlockHash,
          header,
          stats,
          readinessSourceDigest: readiness.sourceDigest,
        }),
      ),
    };
  }
}
