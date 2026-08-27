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
import { canonicalJson, sha256Hex } from '@mining/signer-protocol';
import {
  encodeCompactSize,
  encodeScriptNumber,
  pushData,
  requireHex,
  uint32LittleEndian,
  uint64LittleEndian,
} from './serialization.js';

const ZERO_HASH = Buffer.alloc(32);
const COINBASE_PREVIOUS_INDEX = Buffer.from('ffffffff', 'hex');
const FINAL_SEQUENCE = Buffer.from('ffffffff', 'hex');
const ZERO_WITNESS_RESERVED_VALUE = Buffer.alloc(32);
const ZERO_LOCK_TIME = Buffer.alloc(4);

export type NativeCoinbaseTemplate = {
  coinbase1: string;
  coinbase2: string;
  fullCoinbase1: string;
  fullCoinbase2: string;
  payoutAddress: string;
  payoutNetwork: BitcoinNetwork;
  payoutScriptPubKey: string;
  coinbaseValueAtomic: bigint;
  scriptSigBytes: number;
  extranonce1: string;
  extranonce2Size: number;
  witnessReservedValue: string | null;
  witnessCommitment: string | null;
  policyDigest: string;
};

export type NativeCoinbaseTemplateInput = {
  template: BitcoinBlockTemplate;
  payoutAddress: string;
  payoutNetwork: BitcoinNetwork;
  extranonce1: string;
  extranonce2Size: number;
  poolTag?: string;
  transactionVersion?: number;
};

function serializeOutputs(
  coinbaseValueAtomic: bigint,
  payoutScript: Buffer,
  witnessCommitment: string | null,
): Buffer {
  const payout = Buffer.concat([
    uint64LittleEndian(coinbaseValueAtomic),
    encodeCompactSize(payoutScript.length),
    payoutScript,
  ]);
  if (witnessCommitment === null) {
    return Buffer.concat([encodeCompactSize(1), payout]);
  }
  const commitment = Buffer.from(witnessCommitment, 'hex');
  const commitmentOutput = Buffer.concat([
    uint64LittleEndian(0n),
    encodeCompactSize(commitment.length),
    commitment,
  ]);
  return Buffer.concat([encodeCompactSize(2), payout, commitmentOutput]);
}

export function buildNativeCoinbaseTemplate(
  input: NativeCoinbaseTemplateInput,
): NativeCoinbaseTemplate {
  const extranonce1 = requireHex(input.extranonce1, 'extranonce1');
  if (extranonce1.length / 2 > 16) throw new Error('extranonce1 cannot exceed 16 bytes');
  if (
    !Number.isInteger(input.extranonce2Size) ||
    input.extranonce2Size < 1 ||
    input.extranonce2Size > 16
  ) {
    throw new Error('extranonce2 size must be between 1 and 16 bytes');
  }
  const transactionVersion = input.transactionVersion ?? 2;
  if (!Number.isInteger(transactionVersion) || transactionVersion < 1 || transactionVersion > 2) {
    throw new Error('Coinbase transaction version must be 1 or 2');
  }
  const poolTag = Buffer.from(input.poolTag ?? '/MiningPlatform/', 'utf8');
  if (poolTag.length === 0 || poolTag.length > 40) {
    throw new Error('Coinbase pool tag must be between 1 and 40 bytes');
  }
  const coinbaseAux = Buffer.concat(
    Object.entries(input.template.coinbaseAux)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => Buffer.from(requireHex(value, 'coinbase aux value'), 'hex')),
  );
  const scriptPrefix = Buffer.concat([
    encodeScriptNumber(input.template.height),
    coinbaseAux,
    pushData(poolTag),
  ]);
  const scriptSigBytes = scriptPrefix.length + extranonce1.length / 2 + input.extranonce2Size;
  if (scriptSigBytes < 2 || scriptSigBytes > 100) {
    throw new Error('Coinbase scriptSig must be between 2 and 100 bytes');
  }
  const payoutScriptPubKey = bitcoinAddressToScriptPubKey(input.payoutAddress, input.payoutNetwork);
  const payoutScript = Buffer.from(payoutScriptPubKey, 'hex');
  const witnessCommitment = input.template.defaultWitnessCommitment;
  const version = uint32LittleEndian(transactionVersion);
  const inputPrefix = Buffer.concat([
    encodeCompactSize(1),
    ZERO_HASH,
    COINBASE_PREVIOUS_INDEX,
    encodeCompactSize(scriptSigBytes),
    scriptPrefix,
  ]);
  const outputs = serializeOutputs(
    input.template.coinbaseValueAtomic,
    payoutScript,
    witnessCommitment,
  );
  const commonSuffix = Buffer.concat([FINAL_SEQUENCE, outputs]);
  const strippedCoinbase1 = Buffer.concat([version, inputPrefix]);
  const strippedCoinbase2 = Buffer.concat([commonSuffix, ZERO_LOCK_TIME]);
  const hasWitness = witnessCommitment !== null;
  const fullCoinbase1 = hasWitness
    ? Buffer.concat([version, Buffer.from([0, 1]), inputPrefix])
    : strippedCoinbase1;
  const fullCoinbase2 = hasWitness
    ? Buffer.concat([
        commonSuffix,
        encodeCompactSize(1),
        encodeCompactSize(ZERO_WITNESS_RESERVED_VALUE.length),
        ZERO_WITNESS_RESERVED_VALUE,
        ZERO_LOCK_TIME,
      ])
    : strippedCoinbase2;
  const policyDigest = sha256Hex(
    canonicalJson({
      templateSourceDigest: input.template.sourceDigest,
      height: input.template.height,
      coinbaseValueAtomic: input.template.coinbaseValueAtomic.toString(),
      payoutAddress: input.payoutAddress,
      payoutNetwork: input.payoutNetwork,
      payoutScriptPubKey,
      extranonce1Bytes: extranonce1.length / 2,
      extranonce2Size: input.extranonce2Size,
      poolTag: poolTag.toString('hex'),
      coinbaseAux: input.template.coinbaseAux,
      witnessCommitment,
      transactionVersion,
    }),
  );
  return {
    coinbase1: strippedCoinbase1.toString('hex'),
    coinbase2: strippedCoinbase2.toString('hex'),
    fullCoinbase1: fullCoinbase1.toString('hex'),
    fullCoinbase2: fullCoinbase2.toString('hex'),
    payoutAddress: input.payoutAddress,
    payoutNetwork: input.payoutNetwork,
    payoutScriptPubKey,
    coinbaseValueAtomic: input.template.coinbaseValueAtomic,
    scriptSigBytes,
    extranonce1,
    extranonce2Size: input.extranonce2Size,
    witnessReservedValue: hasWitness ? ZERO_WITNESS_RESERVED_VALUE.toString('hex') : null,
    witnessCommitment,
    policyDigest,
  };
}

function buildCoinbase(
  template: NativeCoinbaseTemplate,
  extranonce2: string,
  full: boolean,
): Buffer {
  const normalizedExtranonce2 = requireHex(extranonce2, 'extranonce2', template.extranonce2Size);
  return Buffer.from(
    `${full ? template.fullCoinbase1 : template.coinbase1}${
      template.extranonce1
    }${normalizedExtranonce2}${full ? template.fullCoinbase2 : template.coinbase2}`,
    'hex',
  );
}

export function buildStrippedNativeCoinbase(
  template: NativeCoinbaseTemplate,
  extranonce2: string,
): Buffer {
  return buildCoinbase(template, extranonce2, false);
}

export function buildFullNativeCoinbase(
  template: NativeCoinbaseTemplate,
  extranonce2: string,
): Buffer {
  return buildCoinbase(template, extranonce2, true);
}
