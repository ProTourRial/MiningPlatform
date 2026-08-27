/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { validateBitcoinAddress } from '@mining/blockchain-adapters';
import { z } from 'zod';

export const walletDestinationInputSchema = z.object({
  accountId: z.string().min(1).max(128),
  asset: z.enum(['BTC', 'USDT', 'ETH']),
  network: z.enum(['BTC', 'BEP20']),
  address: z.string().min(1).max(90),
  label: z.string().max(80).optional(),
});

export type WalletDestinationInput = z.infer<typeof walletDestinationInputSchema>;

export type WalletValidationErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_ASSET_NETWORK'
  | 'INVALID_BTC_ADDRESS'
  | 'BTC_NETWORK_MISMATCH'
  | 'INVALID_EVM_ADDRESS'
  | 'EVM_CHECKSUM_MISMATCH';

export type WalletValidationResult =
  | {
      valid: true;
      accountId: string;
      asset: WalletDestinationInput['asset'];
      network: WalletDestinationInput['network'];
      normalizedAddress: string;
      addressFingerprint: string;
      checksumValidated: true;
      ownershipConfirmed: false;
      payoutCapable: false;
    }
  | {
      valid: false;
      code: WalletValidationErrorCode;
      message: string;
    };

function fingerprint(value: string): string {
  const digest = keccak_256(value);
  return `sha3-${Buffer.from(digest).toString('hex').slice(0, 16)}`;
}

function isHexAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Validates a checksummed EVM address for a BEP20 route.
 * Lowercase/uppercase-only addresses are rejected by default for payout safety.
 */
export function validateBep20Address(address: string):
  | { valid: true; normalizedAddress: string; addressFingerprint: string }
  | { valid: false; code: 'INVALID_EVM_ADDRESS' | 'EVM_CHECKSUM_MISMATCH'; message: string } {
  if (!isHexAddress(address)) {
    return {
      valid: false,
      code: 'INVALID_EVM_ADDRESS',
      message: 'Address must be a 20-byte hexadecimal EVM address',
    };
  }

  const lower = address.slice(2).toLowerCase();
  const hashHex = Buffer.from(keccak_256(lower)).toString('hex');
  const checksummed = `0x${[...lower]
    .map((character, index) =>
      Number.parseInt(hashHex[index]!, 16) >= 8 ? character.toUpperCase() : character,
    )
    .join('')}`;

  if (address !== checksummed) {
    return {
      valid: false,
      code: 'EVM_CHECKSUM_MISMATCH',
      message: 'Address checksum does not match the selected EVM network policy',
    };
  }

  return {
    valid: true,
    normalizedAddress: checksummed,
    addressFingerprint: fingerprint(checksummed),
  };
}

export function validateWalletDestination(
  input: unknown,
): WalletValidationResult {
  const parsed = walletDestinationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      code: 'INVALID_INPUT',
      message: 'Wallet destination input is invalid',
    };
  }

  const { accountId, asset, network, address } = parsed.data;
  if (network === 'BTC' && asset !== 'BTC') {
    return {
      valid: false,
      code: 'UNSUPPORTED_ASSET_NETWORK',
      message: 'Only BTC may use the Bitcoin network route',
    };
  }

  if (network === 'BEP20') {
    const result = validateBep20Address(address);
    if (!result.valid) return result;
    return {
      valid: true,
      accountId,
      asset,
      network,
      normalizedAddress: result.normalizedAddress,
      addressFingerprint: result.addressFingerprint,
      checksumValidated: true,
      ownershipConfirmed: false,
      payoutCapable: false,
    };
  }

  const btc = validateBitcoinAddress(address, 'mainnet');
  if (!btc.valid) {
    return {
      valid: false,
      code: btc.reason === 'wrong-network' ? 'BTC_NETWORK_MISMATCH' : 'INVALID_BTC_ADDRESS',
      message: `Bitcoin address validation failed: ${btc.reason}`,
    };
  }

  return {
    valid: true,
    accountId,
    asset,
    network,
    normalizedAddress: btc.normalized,
    addressFingerprint: fingerprint(btc.normalized),
    checksumValidated: true,
    ownershipConfirmed: false,
    payoutCapable: false,
  };
}
