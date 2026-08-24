/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32_CONSTANT = 1;
const BECH32M_CONSTANT = 0x2bc830a3;

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';
export type BitcoinAddressEncoding = 'base58-p2pkh' | 'base58-p2sh' | 'bech32' | 'bech32m';

export type BitcoinAddressValidation =
  | { valid: true; normalized: string; encoding: BitcoinAddressEncoding; witnessVersion?: number }
  | { valid: false; reason: string };

function doubleSha256(value: Buffer): Buffer {
  return createHash('sha256').update(createHash('sha256').update(value).digest()).digest();
}

function decodeBase58(value: string): Buffer | undefined {
  if (!value || value.length > 64) return undefined;
  let decoded = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return undefined;
    decoded = decoded * 58n + BigInt(digit);
  }

  const bytes: number[] = [];
  while (decoded > 0n) {
    bytes.push(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  bytes.reverse();
  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0;
  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

function validateBase58(value: string, network: BitcoinNetwork): BitcoinAddressValidation {
  const decoded = decodeBase58(value);
  if (!decoded || decoded.length !== 25) return { valid: false, reason: 'invalid-base58-length' };
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const expected = doubleSha256(payload).subarray(0, 4);
  if (!timingSafeEqual(checksum, expected))
    return { valid: false, reason: 'invalid-base58-checksum' };

  const allowedVersions = network === 'mainnet' ? [0x00, 0x05] : [0x6f, 0xc4];
  if (!allowedVersions.includes(payload[0]!)) return { valid: false, reason: 'wrong-network' };
  return {
    valid: true,
    normalized: value,
    encoding: payload[0] === allowedVersions[0] ? 'base58-p2pkh' : 'base58-p2sh',
  };
}

function bech32Polymod(values: readonly number[]): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = (((checksum & 0x1ffffff) << 5) ^ value) >>> 0;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((top >>> index) & 1) checksum = (checksum ^ BECH32_GENERATORS[index]!) >>> 0;
    }
  }
  return checksum >>> 0;
}

function expandHrp(hrp: string): number[] {
  return [
    ...[...hrp].map((character) => character.charCodeAt(0) >>> 5),
    0,
    ...[...hrp].map((character) => character.charCodeAt(0) & 31),
  ];
}

function convertBits(
  values: readonly number[],
  fromBits: number,
  toBits: number,
): number[] | undefined {
  let accumulator = 0;
  let bitCount = 0;
  const output: number[] = [];
  const maxOutput = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of values) {
    if (value < 0 || value >>> fromBits !== 0) return undefined;
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bitCount += fromBits;
    while (bitCount >= toBits) {
      bitCount -= toBits;
      output.push((accumulator >>> bitCount) & maxOutput);
    }
  }
  if (bitCount >= fromBits || ((accumulator << (toBits - bitCount)) & maxOutput) !== 0) {
    return undefined;
  }
  return output;
}

function validateSegwit(value: string, network: BitcoinNetwork): BitcoinAddressValidation {
  if (value.length < 8 || value.length > 90)
    return { valid: false, reason: 'invalid-bech32-length' };
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) {
    return { valid: false, reason: 'mixed-bech32-case' };
  }

  const normalized = value.toLowerCase();
  const separator = normalized.lastIndexOf('1');
  if (separator < 1 || separator + 7 > normalized.length) {
    return { valid: false, reason: 'invalid-bech32-separator' };
  }
  const hrp = normalized.slice(0, separator);
  const expectedHrp = network === 'mainnet' ? 'bc' : network === 'testnet' ? 'tb' : 'bcrt';
  if (hrp !== expectedHrp) return { valid: false, reason: 'wrong-network' };

  const data: number[] = [];
  for (const character of normalized.slice(separator + 1)) {
    const digit = BECH32_ALPHABET.indexOf(character);
    if (digit < 0) return { valid: false, reason: 'invalid-bech32-character' };
    data.push(digit);
  }

  const polymod = bech32Polymod([...expandHrp(hrp), ...data]);
  const encoding =
    polymod === BECH32_CONSTANT ? 'bech32' : polymod === BECH32M_CONSTANT ? 'bech32m' : undefined;
  if (!encoding) return { valid: false, reason: 'invalid-bech32-checksum' };

  const payload = data.slice(0, -6);
  const witnessVersion = payload[0];
  if (witnessVersion === undefined || witnessVersion > 16) {
    return { valid: false, reason: 'invalid-witness-version' };
  }
  const witnessProgram = convertBits(payload.slice(1), 5, 8);
  if (!witnessProgram || witnessProgram.length < 2 || witnessProgram.length > 40) {
    return { valid: false, reason: 'invalid-witness-program' };
  }
  if (witnessVersion === 0 && ![20, 32].includes(witnessProgram.length)) {
    return { valid: false, reason: 'invalid-v0-program-length' };
  }
  if (
    (witnessVersion === 0 && encoding !== 'bech32') ||
    (witnessVersion > 0 && encoding !== 'bech32m')
  ) {
    return { valid: false, reason: 'wrong-witness-checksum-encoding' };
  }
  return { valid: true, normalized, encoding, witnessVersion };
}

export function validateBitcoinAddress(
  address: string,
  network: BitcoinNetwork = 'mainnet',
): BitcoinAddressValidation {
  if (!address || address.trim() !== address) return { valid: false, reason: 'invalid-whitespace' };
  if (/^(bc|tb|bcrt)1/i.test(address)) return validateSegwit(address, network);
  return validateBase58(address, network);
}

export function bitcoinAddressToScriptPubKey(
  address: string,
  network: BitcoinNetwork = 'mainnet',
): string {
  const validation = validateBitcoinAddress(address, network);
  if (!validation.valid)
    throw new Error(`Invalid ${network} Bitcoin address: ${validation.reason}`);

  if (validation.encoding === 'base58-p2pkh' || validation.encoding === 'base58-p2sh') {
    const decoded = decodeBase58(validation.normalized);
    if (!decoded || decoded.length !== 25) throw new Error('Bitcoin Base58 payload is invalid');
    const hash160 = decoded.subarray(1, 21).toString('hex');
    return validation.encoding === 'base58-p2pkh' ? `76a914${hash160}88ac` : `a914${hash160}87`;
  }

  const separator = validation.normalized.lastIndexOf('1');
  const data = [...validation.normalized.slice(separator + 1, -6)].map((character) =>
    BECH32_ALPHABET.indexOf(character),
  );
  const witnessVersion = data[0];
  const witnessProgram = convertBits(data.slice(1), 5, 8);
  if (
    witnessVersion === undefined ||
    witnessProgram === undefined ||
    witnessProgram.length < 2 ||
    witnessProgram.length > 40
  ) {
    throw new Error('Bitcoin witness program is invalid');
  }
  const versionOpcode = witnessVersion === 0 ? 0 : 0x50 + witnessVersion;
  return Buffer.from([versionOpcode, witnessProgram.length, ...witnessProgram]).toString('hex');
}
