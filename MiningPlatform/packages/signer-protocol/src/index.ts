/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNER_PROTOCOL_VERSION = 1 as const;

export type SigningManifestV1 = {
  version: typeof SIGNER_PROTOCOL_VERSION;
  requestId: string;
  payoutId: string;
  asset: 'BTC';
  network: 'mainnet' | 'testnet' | 'regtest';
  keyReference: string;
  destination: string;
  destinationAmountAtomic: string;
  reservedNetworkFeeAtomic: string;
  actualNetworkFeeAtomic: string;
  psbtDigest: string;
  unsignedTransactionDigest: string;
  expiresAt: string;
};

export type SignerRequestV1 = {
  manifest: SigningManifestV1;
  manifestDigest: string;
  psbt: string;
};

export type SignerResponseV1 = {
  requestId: string;
  manifestDigest: string;
  signedPsbt: string;
  signedPsbtDigest: string;
  complete: boolean;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function digestSigningManifest(manifest: SigningManifestV1): string {
  return sha256Hex(canonicalJson(manifest));
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(value)) throw new Error(`${label} is invalid`);
}

function parseAtomic(value: string, label: string, allowZero = false): bigint {
  if (!/^\d{1,20}$/.test(value)) throw new Error(`${label} is invalid`);
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n) throw new Error(`${label} is invalid`);
  return parsed;
}

export function validateSigningManifest(manifest: SigningManifestV1, now = new Date()): void {
  if (manifest.version !== SIGNER_PROTOCOL_VERSION)
    throw new Error('Signer protocol version is unsupported');
  assertIdentifier(manifest.requestId, 'Signer request id');
  assertIdentifier(manifest.payoutId, 'Payout id');
  assertIdentifier(manifest.keyReference, 'Signer key reference');
  if (manifest.asset !== 'BTC') throw new Error('Signer asset is unsupported');
  if (!['mainnet', 'testnet', 'regtest'].includes(manifest.network)) {
    throw new Error('Signer network is unsupported');
  }
  if (manifest.destination.length < 14 || manifest.destination.length > 90) {
    throw new Error('Signer destination is invalid');
  }
  parseAtomic(manifest.destinationAmountAtomic, 'Destination amount');
  const reservedFee = parseAtomic(manifest.reservedNetworkFeeAtomic, 'Reserved network fee', true);
  const actualFee = parseAtomic(manifest.actualNetworkFeeAtomic, 'Actual network fee', true);
  if (actualFee > reservedFee) throw new Error('Actual network fee exceeds the reservation');
  if (!/^[0-9a-f]{64}$/.test(manifest.psbtDigest)) throw new Error('PSBT digest is invalid');
  if (!/^[0-9a-f]{64}$/.test(manifest.unsignedTransactionDigest)) {
    throw new Error('Unsigned transaction digest is invalid');
  }
  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('Signer manifest expiry is invalid');
  if (expiresAt <= now) throw new Error('Signer manifest has expired');
  if (expiresAt.getTime() - now.getTime() > 5 * 60_000) {
    throw new Error('Signer manifest expiry exceeds five minutes');
  }
}

function signerPayload(timestamp: string, nonce: string, bodyDigest: string): string {
  return `v1\n${timestamp}\n${nonce}\n${bodyDigest}`;
}

export function createSignerSignature(input: {
  secret: string;
  timestamp: string;
  nonce: string;
  bodyDigest: string;
}): string {
  if (Buffer.byteLength(input.secret) < 32)
    throw new Error('Signer shared secret must be at least 32 bytes');
  if (!/^\d{13}$/.test(input.timestamp)) throw new Error('Signer timestamp is invalid');
  assertIdentifier(input.nonce, 'Signer nonce');
  if (!/^[0-9a-f]{64}$/.test(input.bodyDigest)) throw new Error('Signer body digest is invalid');
  return createHmac('sha256', input.secret)
    .update(signerPayload(input.timestamp, input.nonce, input.bodyDigest))
    .digest('hex');
}

export function verifySignerSignature(input: {
  secret: string;
  timestamp: string;
  nonce: string;
  bodyDigest: string;
  signature: string;
}): boolean {
  if (!/^[0-9a-f]{64}$/.test(input.signature)) return false;
  let expected: string;
  try {
    expected = createSignerSignature(input);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.signature, 'hex'));
}
