/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '@mining/signer-protocol';
import { validateBitcoinAddress, type BitcoinNetwork } from './bitcoin-address.js';

const SATOSHIS_PER_BITCOIN = 100_000_000n;
const DEFAULT_MAXIMUM_RPC_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAXIMUM_ALLOWED_RPC_RESPONSE_BYTES = 32 * 1024 * 1024;

export type BitcoinRpcClientOptions = {
  url: string;
  username: string;
  password: string;
  walletName?: string;
  timeoutMilliseconds?: number;
  maximumResponseBytes?: number;
  allowInsecureHttp?: boolean;
  fetchImplementation?: typeof fetch;
};

export type BitcoinWalletSnapshot = {
  confirmedBalanceAtomic: bigint;
  chainHeight: bigint;
  chainTipHash: string;
  verificationProgress: number;
  initialBlockDownload: boolean;
  observedAt: Date;
};

export type BitcoinUtxoSnapshot = {
  confirmedSolvableAtomic: bigint;
  utxoCount: number;
  outpointSetDigest: string;
  observedAt: Date;
};

export type PreparedBitcoinPayout = {
  psbt: string;
  psbtDigest: string;
  unsignedTransactionDigest: string;
  destinationAmountAtomic: bigint;
  actualNetworkFeeAtomic: bigint;
};

export type FinalizedBitcoinTransaction = {
  rawTransaction: string;
  rawTransactionDigest: string;
};

export type BitcoinPayoutIntent = {
  unsignedTransactionDigest: string;
  destination: string;
  destinationAmountAtomic: bigint;
  actualNetworkFeeAtomic: bigint;
  maximumNetworkFeeAtomic: bigint;
};

export type BitcoinChainObservation = {
  status: 'MEMPOOL' | 'CONFIRMED' | 'REORGED' | 'DROPPED';
  confirmations: number;
  blockHeight: bigint | null;
  blockHash: string | null;
  rawDigest: string;
};

type RpcEnvelope<T> = {
  result: T | null;
  error: { code: number; message: string; data?: unknown } | null;
  id: string | number | null;
};

export class BitcoinRpcError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly method: string,
  ) {
    super(message);
    this.name = 'BitcoinRpcError';
  }
}

export class BitcoinPayoutIntentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BitcoinPayoutIntentMismatchError';
  }
}

async function readBoundedRpcResponse(
  response: Response,
  maximumResponseBytes: number,
  method: string,
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumResponseBytes) {
        await reader.cancel('Bitcoin RPC response exceeded configured limit');
        throw new BitcoinRpcError(
          'Bitcoin RPC response exceeds the configured limit',
          null,
          method,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeDecimal(value: number | string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error('Bitcoin amount is invalid');
    return value.toFixed(8);
  }
  return value;
}

export function bitcoinToAtomic(value: number | string): bigint {
  const normalized = normalizeDecimal(value).trim();
  if (!/^\d+(?:\.\d{1,8})?$/.test(normalized)) {
    throw new Error('Bitcoin amount must be a non-negative decimal with at most 8 places');
  }
  const [whole = '0', fraction = ''] = normalized.split('.');
  return BigInt(whole) * SATOSHIS_PER_BITCOIN + BigInt(fraction.padEnd(8, '0'));
}

export function atomicToBitcoinNumber(value: bigint): number {
  if (value <= 0n) throw new Error('Bitcoin payout amount must be positive');
  if (value > 2_100_000_000_000_000n) throw new Error('Bitcoin amount exceeds protocol supply');
  return Number(value) / Number(SATOSHIS_PER_BITCOIN);
}

export class BitcoinJsonRpcClient {
  private readonly endpoint: URL;
  private readonly timeoutMilliseconds: number;
  private readonly maximumResponseBytes: number;
  private readonly fetchImplementation: typeof fetch;
  private requestSequence = 0;

  constructor(private readonly options: BitcoinRpcClientOptions) {
    this.endpoint = new URL(options.url);
    if (!['http:', 'https:'].includes(this.endpoint.protocol)) {
      throw new Error('Bitcoin RPC URL must use HTTP or HTTPS');
    }
    if (
      this.endpoint.protocol === 'http:' &&
      !isLoopback(this.endpoint.hostname) &&
      options.allowInsecureHttp !== true
    ) {
      throw new Error(
        'Plain HTTP Bitcoin RPC is allowed only on loopback unless explicitly enabled',
      );
    }
    if (!options.username || !options.password)
      throw new Error('Bitcoin RPC credentials are required');
    if (options.walletName) {
      const basePath = this.endpoint.pathname.replace(/\/$/, '');
      this.endpoint.pathname = `${basePath}/wallet/${encodeURIComponent(options.walletName)}`;
    }
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
    if (!Number.isInteger(this.timeoutMilliseconds) || this.timeoutMilliseconds < 100) {
      throw new Error('Bitcoin RPC timeout must be at least 100 milliseconds');
    }
    this.maximumResponseBytes = options.maximumResponseBytes ?? DEFAULT_MAXIMUM_RPC_RESPONSE_BYTES;
    if (
      !Number.isInteger(this.maximumResponseBytes) ||
      this.maximumResponseBytes < 1024 ||
      this.maximumResponseBytes > MAXIMUM_ALLOWED_RPC_RESPONSE_BYTES
    ) {
      throw new Error('Bitcoin RPC response limit must be between 1 KiB and 32 MiB');
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  private async request<T>(method: string, params: readonly unknown[]): Promise<T | null> {
    if (!/^[a-z][a-z0-9]*$/i.test(method)) throw new Error('Bitcoin RPC method is invalid');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(
            `${this.options.username}:${this.options.password}`,
          ).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.requestSequence, method, params }),
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > this.maximumResponseBytes) {
        throw new BitcoinRpcError(
          'Bitcoin RPC response exceeds the configured limit',
          null,
          method,
        );
      }
      const body = await readBoundedRpcResponse(response, this.maximumResponseBytes, method);
      if (!response.ok) {
        throw new BitcoinRpcError(`Bitcoin RPC HTTP ${response.status}`, null, method);
      }
      let envelope: RpcEnvelope<T>;
      try {
        envelope = JSON.parse(body) as RpcEnvelope<T>;
      } catch {
        throw new BitcoinRpcError('Bitcoin RPC returned invalid JSON', null, method);
      }
      if (envelope.error) {
        throw new BitcoinRpcError(envelope.error.message, envelope.error.code, method);
      }
      return envelope.result;
    } catch (error) {
      if (error instanceof BitcoinRpcError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BitcoinRpcError('Bitcoin RPC request timed out', null, method);
      }
      throw new BitcoinRpcError(
        error instanceof Error ? error.message : 'Bitcoin RPC request failed',
        null,
        method,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async call<T>(method: string, params: readonly unknown[] = []): Promise<T> {
    const result = await this.request<T>(method, params);
    if (result === null) {
      throw new BitcoinRpcError('Bitcoin RPC returned a null result', null, method);
    }
    return result;
  }

  async callNullable<T>(method: string, params: readonly unknown[] = []): Promise<T | null> {
    return this.request<T>(method, params);
  }
}

type DecodedBitcoinTransaction = {
  version?: number;
  locktime?: number;
  vin: Array<{ txid: string; vout: number; sequence?: number }>;
  vout: Array<{
    n?: number;
    value: number;
    scriptPubKey: { hex?: string; address?: string; addresses?: string[] };
  }>;
};

type DecodedPsbt = {
  fee?: number;
  tx: DecodedBitcoinTransaction;
};

function transactionIntentDigest(
  transaction: DecodedBitcoinTransaction,
  method: 'decodepsbt' | 'decoderawtransaction',
): string {
  if (
    !Number.isInteger(transaction.version) ||
    !Number.isInteger(transaction.locktime) ||
    transaction.vin.length === 0 ||
    transaction.vout.length === 0
  ) {
    throw new BitcoinRpcError('Bitcoin transaction intent is incomplete', null, method);
  }
  const vin = transaction.vin.map((input) => {
    if (
      !/^[0-9a-f]{64}$/i.test(input.txid) ||
      !Number.isInteger(input.vout) ||
      input.vout < 0 ||
      !Number.isInteger(input.sequence) ||
      input.sequence! < 0
    ) {
      throw new BitcoinRpcError('Bitcoin transaction input intent is invalid', null, method);
    }
    return {
      txid: input.txid.toLowerCase(),
      vout: input.vout,
      sequence: input.sequence,
    };
  });
  const vout = transaction.vout.map((output) => {
    if (
      !Number.isInteger(output.n) ||
      output.n! < 0 ||
      output.n! >= transaction.vout.length ||
      typeof output.scriptPubKey.hex !== 'string' ||
      !/^(?:[0-9a-f]{2})*$/i.test(output.scriptPubKey.hex)
    ) {
      throw new BitcoinRpcError('Bitcoin transaction output intent is invalid', null, method);
    }
    return {
      n: output.n,
      valueAtomic: bitcoinToAtomic(output.value).toString(),
      scriptPubKeyHex: output.scriptPubKey.hex.toLowerCase(),
    };
  });
  if (new Set(vout.map((output) => output.n)).size !== vout.length) {
    throw new BitcoinRpcError('Bitcoin transaction output indexes are not unique', null, method);
  }
  return sha256(
    canonicalJson({
      version: transaction.version,
      locktime: transaction.locktime,
      vin,
      vout,
    }),
  );
}

export class BitcoinWatchOnlyRpcAdapter {
  readonly asset = 'BTC';

  constructor(
    private readonly network: BitcoinNetwork,
    private readonly rpc: BitcoinJsonRpcClient,
  ) {}

  async validateAddress(address: string): Promise<boolean> {
    return validateBitcoinAddress(address, this.network).valid;
  }

  async getWalletSnapshot(): Promise<BitcoinWalletSnapshot> {
    const [chain, balances] = await Promise.all([
      this.rpc.call<{
        blocks: number;
        bestblockhash: string;
        verificationprogress: number;
        initialblockdownload: boolean;
      }>('getblockchaininfo'),
      this.rpc.call<{
        mine?: { trusted?: number };
        watchonly?: { trusted?: number };
      }>('getbalances'),
    ]);
    const confirmed = (balances.mine?.trusted ?? 0) + (balances.watchonly?.trusted ?? 0);
    if (!/^[0-9a-f]{64}$/i.test(chain.bestblockhash)) {
      throw new BitcoinRpcError(
        'Bitcoin node returned an invalid chain tip hash',
        null,
        'getblockchaininfo',
      );
    }
    return {
      confirmedBalanceAtomic: bitcoinToAtomic(confirmed),
      chainHeight: BigInt(chain.blocks),
      chainTipHash: chain.bestblockhash.toLowerCase(),
      verificationProgress: chain.verificationprogress,
      initialBlockDownload: chain.initialblockdownload,
      observedAt: new Date(),
    };
  }

  async getConfirmedUtxoSnapshot(): Promise<BitcoinUtxoSnapshot> {
    const entries = await this.rpc.call<
      Array<{
        txid: string;
        vout: number;
        amount: number | string;
        confirmations: number;
        spendable?: boolean;
        solvable?: boolean;
        safe?: boolean;
      }>
    >('listunspent', [1, 9_999_999, [], true]);
    const outpoints = new Set<string>();
    let confirmedSolvableAtomic = 0n;
    for (const entry of entries) {
      if (
        !/^[0-9a-f]{64}$/i.test(entry.txid) ||
        !Number.isInteger(entry.vout) ||
        entry.vout < 0 ||
        !Number.isInteger(entry.confirmations) ||
        entry.confirmations < 1
      ) {
        throw new BitcoinRpcError('Bitcoin node returned an invalid UTXO', null, 'listunspent');
      }
      // A watch-only descriptor wallet intentionally reports spendable=false.
      // Solvable UTXOs are still controllable through the isolated signer.
      if (entry.solvable === false || entry.safe === false) continue;
      const outpoint = `${entry.txid.toLowerCase()}:${entry.vout}`;
      if (outpoints.has(outpoint)) {
        throw new BitcoinRpcError(
          'Bitcoin node returned a duplicate UTXO outpoint',
          null,
          'listunspent',
        );
      }
      outpoints.add(outpoint);
      confirmedSolvableAtomic += bitcoinToAtomic(entry.amount);
    }
    return {
      confirmedSolvableAtomic,
      utxoCount: outpoints.size,
      outpointSetDigest: sha256([...outpoints].sort().join('\n')),
      observedAt: new Date(),
    };
  }

  async preparePayout(input: {
    address: string;
    amountAtomic: bigint;
    maximumNetworkFeeAtomic: bigint;
    feeRateSatPerVbyte?: number;
  }): Promise<PreparedBitcoinPayout> {
    const validated = validateBitcoinAddress(input.address, this.network);
    if (!validated.valid) throw new Error(`Invalid ${this.network} Bitcoin destination`);
    if (input.maximumNetworkFeeAtomic < 0n)
      throw new Error('Maximum network fee cannot be negative');
    const options: Record<string, unknown> = {
      add_inputs: true,
      includeWatching: true,
      lockUnspents: true,
      replaceable: false,
    };
    if (input.feeRateSatPerVbyte !== undefined) {
      if (!Number.isFinite(input.feeRateSatPerVbyte) || input.feeRateSatPerVbyte <= 0) {
        throw new Error('Bitcoin fee rate must be positive');
      }
      options.fee_rate = input.feeRateSatPerVbyte;
    }
    const prepared = await this.rpc.call<{ psbt: string; fee: number }>('walletcreatefundedpsbt', [
      [],
      [{ [input.address]: atomicToBitcoinNumber(input.amountAtomic) }],
      0,
      options,
      true,
    ]);
    if (!prepared.psbt || prepared.psbt.length > 500_000) {
      throw new BitcoinRpcError(
        'Bitcoin Core returned an invalid PSBT',
        null,
        'walletcreatefundedpsbt',
      );
    }
    const decoded = await this.rpc.call<DecodedPsbt>('decodepsbt', [prepared.psbt]);
    const matchingOutputs = decoded.tx.vout.filter((output) => {
      const addresses = output.scriptPubKey.address
        ? [output.scriptPubKey.address]
        : output.scriptPubKey.addresses ?? [];
      return addresses.includes(input.address);
    });
    if (
      matchingOutputs.length !== 1 ||
      bitcoinToAtomic(matchingOutputs[0]?.value ?? 0) !== input.amountAtomic
    ) {
      await this.releasePsbtInputs(prepared.psbt).catch(() => undefined);
      throw new BitcoinRpcError(
        'Prepared PSBT does not contain the exact payout destination and amount',
        null,
        'decodepsbt',
      );
    }
    const feeAtomic = bitcoinToAtomic(decoded.fee ?? prepared.fee);
    if (feeAtomic > input.maximumNetworkFeeAtomic) {
      await this.releasePsbtInputs(prepared.psbt).catch(() => undefined);
      throw new BitcoinRpcError(
        'Prepared PSBT network fee exceeds the reserved maximum',
        null,
        'walletcreatefundedpsbt',
      );
    }
    return {
      psbt: prepared.psbt,
      psbtDigest: sha256(prepared.psbt),
      unsignedTransactionDigest: sha256(canonicalJson(decoded.tx)),
      destinationAmountAtomic: input.amountAtomic,
      actualNetworkFeeAtomic: feeAtomic,
    };
  }

  async assertSignedPsbtMatchesPayoutIntent(
    signedPsbt: string,
    expected: BitcoinPayoutIntent,
  ): Promise<void> {
    if (!signedPsbt || signedPsbt.length > 500_000) {
      throw new BitcoinPayoutIntentMismatchError('Signer returned an invalid signed PSBT');
    }
    if (!/^[0-9a-f]{64}$/.test(expected.unsignedTransactionDigest)) {
      throw new BitcoinPayoutIntentMismatchError('Expected unsigned transaction digest is invalid');
    }
    if (
      expected.destinationAmountAtomic <= 0n ||
      expected.actualNetworkFeeAtomic < 0n ||
      expected.maximumNetworkFeeAtomic < expected.actualNetworkFeeAtomic
    ) {
      throw new BitcoinPayoutIntentMismatchError(
        'Expected payout amount or fee boundary is invalid',
      );
    }
    const validated = validateBitcoinAddress(expected.destination, this.network);
    if (!validated.valid) {
      throw new BitcoinPayoutIntentMismatchError(
        `Invalid ${this.network} Bitcoin destination in payout manifest`,
      );
    }

    const decoded = await this.rpc.call<DecodedPsbt>('decodepsbt', [signedPsbt]);
    if (sha256(canonicalJson(decoded.tx)) !== expected.unsignedTransactionDigest) {
      throw new BitcoinPayoutIntentMismatchError(
        'Signed PSBT transaction does not match the approved payout manifest',
      );
    }
    if (bitcoinToAtomic(decoded.fee ?? 0) !== expected.actualNetworkFeeAtomic) {
      throw new BitcoinPayoutIntentMismatchError(
        'Signed PSBT fee does not match the approved payout manifest',
      );
    }
    let destinationOutputs = 0;
    for (const output of decoded.tx.vout) {
      const addresses = output.scriptPubKey.address
        ? [output.scriptPubKey.address]
        : output.scriptPubKey.addresses ?? [];
      if (addresses.includes(expected.destination)) {
        destinationOutputs += 1;
        if (bitcoinToAtomic(output.value) !== expected.destinationAmountAtomic) {
          throw new BitcoinPayoutIntentMismatchError(
            'Signed PSBT destination amount does not match the approved payout manifest',
          );
        }
        continue;
      }
      if (addresses.length !== 1) {
        throw new BitcoinPayoutIntentMismatchError(
          'Signed PSBT contains an unrecognized non-address output',
        );
      }
      const addressInfo = await this.rpc.call<{ ismine?: boolean }>('getaddressinfo', [
        addresses[0],
      ]);
      if (!addressInfo.ismine) {
        throw new BitcoinPayoutIntentMismatchError(
          'Signed PSBT contains a non-destination output not owned by the watch wallet',
        );
      }
    }
    if (destinationOutputs !== 1) {
      throw new BitcoinPayoutIntentMismatchError(
        'Signed PSBT destination does not match the approved payout manifest',
      );
    }
  }

  async assertFinalizedTransactionMatchesSignedPsbt(
    signedPsbt: string,
    rawTransaction: string,
  ): Promise<string> {
    if (!signedPsbt || signedPsbt.length > 500_000) {
      throw new BitcoinPayoutIntentMismatchError('Signed PSBT evidence is invalid');
    }
    if (!/^[0-9a-f]+$/i.test(rawTransaction)) {
      throw new BitcoinPayoutIntentMismatchError('Raw Bitcoin transaction is invalid');
    }
    const [decodedPsbt, decodedRaw] = await Promise.all([
      this.rpc.call<DecodedPsbt>('decodepsbt', [signedPsbt]),
      this.rpc.call<DecodedBitcoinTransaction>('decoderawtransaction', [rawTransaction]),
    ]);
    const signedIntentDigest = transactionIntentDigest(decodedPsbt.tx, 'decodepsbt');
    const rawIntentDigest = transactionIntentDigest(decodedRaw, 'decoderawtransaction');
    if (signedIntentDigest !== rawIntentDigest) {
      throw new BitcoinPayoutIntentMismatchError(
        'Finalized transaction does not match the verified signed PSBT',
      );
    }
    return rawIntentDigest;
  }

  async assertRawTransactionMatchesIntentDigest(
    rawTransaction: string,
    expectedIntentDigest: string,
  ): Promise<void> {
    if (!/^[0-9a-f]+$/i.test(rawTransaction)) {
      throw new BitcoinPayoutIntentMismatchError('Raw Bitcoin transaction is invalid');
    }
    if (!/^[0-9a-f]{64}$/.test(expectedIntentDigest)) {
      throw new BitcoinPayoutIntentMismatchError('Transaction intent digest is invalid');
    }
    const decoded = await this.rpc.call<DecodedBitcoinTransaction>('decoderawtransaction', [
      rawTransaction,
    ]);
    if (transactionIntentDigest(decoded, 'decoderawtransaction') !== expectedIntentDigest) {
      throw new BitcoinPayoutIntentMismatchError(
        'Raw transaction does not match the verified transaction intent',
      );
    }
  }

  async releasePsbtInputs(psbt: string): Promise<void> {
    const decoded = await this.rpc.call<DecodedPsbt>('decodepsbt', [psbt]);
    if (decoded.tx.vin.length === 0) return;
    const unlocked = await this.rpc.call<boolean>('lockunspent', [true, decoded.tx.vin]);
    if (!unlocked)
      throw new BitcoinRpcError('Bitcoin Core did not unlock PSBT inputs', null, 'lockunspent');
  }

  async finalizeSignedPsbt(signedPsbt: string): Promise<FinalizedBitcoinTransaction> {
    const finalized = await this.rpc.call<{ complete: boolean; hex?: string }>('finalizepsbt', [
      signedPsbt,
      true,
    ]);
    if (!finalized.complete || !finalized.hex || !/^[0-9a-f]+$/i.test(finalized.hex)) {
      throw new BitcoinRpcError('Signer returned an incomplete PSBT', null, 'finalizepsbt');
    }
    return {
      rawTransaction: finalized.hex,
      rawTransactionDigest: sha256(finalized.hex.toLowerCase()),
    };
  }

  async assertMempoolAcceptance(rawTransaction: string): Promise<void> {
    const [result] = await this.rpc.call<
      Array<{ allowed: boolean; 'reject-reason'?: string; package_error?: string }>
    >('testmempoolaccept', [[rawTransaction]]);
    if (!result?.allowed) {
      throw new BitcoinRpcError(
        `Bitcoin mempool rejected transaction: ${
          result?.['reject-reason'] ?? result?.package_error ?? 'unknown reason'
        }`,
        null,
        'testmempoolaccept',
      );
    }
  }

  async broadcastRawTransaction(rawTransaction: string): Promise<string> {
    if (!/^[0-9a-f]+$/i.test(rawTransaction)) throw new Error('Raw Bitcoin transaction is invalid');
    const transactionId = await this.rpc.call<string>('sendrawtransaction', [rawTransaction]);
    if (!/^[0-9a-f]{64}$/i.test(transactionId)) {
      throw new BitcoinRpcError(
        'Bitcoin Core returned an invalid transaction id',
        null,
        'sendrawtransaction',
      );
    }
    return transactionId.toLowerCase();
  }

  async decodeRawTransactionId(rawTransaction: string): Promise<string> {
    if (!/^[0-9a-f]+$/i.test(rawTransaction)) throw new Error('Raw Bitcoin transaction is invalid');
    const decoded = await this.rpc.call<{ txid: string }>('decoderawtransaction', [rawTransaction]);
    if (!/^[0-9a-f]{64}$/i.test(decoded.txid)) {
      throw new BitcoinRpcError(
        'Bitcoin Core returned an invalid decoded transaction id',
        null,
        'decoderawtransaction',
      );
    }
    return decoded.txid.toLowerCase();
  }

  async getTransactionObservation(transactionId: string): Promise<BitcoinChainObservation> {
    if (!/^[0-9a-f]{64}$/i.test(transactionId))
      throw new Error('Bitcoin transaction id is invalid');
    try {
      const transaction = await this.rpc.call<{
        confirmations?: number;
        blockhash?: string;
        abandoned?: boolean;
      }>('gettransaction', [transactionId, true, true]);
      const confirmations = transaction.confirmations ?? 0;
      let blockHeight: bigint | null = null;
      if (confirmations > 0 && transaction.blockhash) {
        const header = await this.rpc.call<{ height: number }>('getblockheader', [
          transaction.blockhash,
          true,
        ]);
        blockHeight = BigInt(header.height);
      }
      const status =
        transaction.abandoned || confirmations < 0
          ? 'REORGED'
          : confirmations > 0
          ? 'CONFIRMED'
          : 'MEMPOOL';
      return {
        status,
        confirmations: Math.max(0, confirmations),
        blockHeight,
        blockHash: transaction.blockhash?.toLowerCase() ?? null,
        rawDigest: sha256(JSON.stringify(transaction)),
      };
    } catch (error) {
      if (!(error instanceof BitcoinRpcError) || error.code !== -5) throw error;
      return {
        status: 'DROPPED',
        confirmations: 0,
        blockHeight: null,
        blockHash: null,
        rawDigest: sha256(`not-found:${transactionId}`),
      };
    }
  }
}
