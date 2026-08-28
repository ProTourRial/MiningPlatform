/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export function requireHex(value: string, field: string, bytes?: number): string {
  if (
    value.length === 0 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(value) ||
    (bytes !== undefined && value.length !== bytes * 2)
  ) {
    throw new Error(`${field} must be valid${bytes === undefined ? '' : ` ${bytes}-byte`} hex`);
  }
  return value.toLowerCase();
}

export function encodeCompactSize(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('CompactSize value must be a non-negative safe integer');
  }
  if (value < 0xfd) return Buffer.from([value]);
  if (value <= 0xffff) {
    const result = Buffer.allocUnsafe(3);
    result[0] = 0xfd;
    result.writeUInt16LE(value, 1);
    return result;
  }
  if (value <= 0xffffffff) {
    const result = Buffer.allocUnsafe(5);
    result[0] = 0xfe;
    result.writeUInt32LE(value, 1);
    return result;
  }
  return Buffer.concat([Buffer.from([0xff]), uint64LittleEndian(BigInt(value))]);
}

export function uint32LittleEndian(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('uint32 value is invalid');
  }
  const result = Buffer.allocUnsafe(4);
  result.writeUInt32LE(value);
  return result;
}

export function uint64LittleEndian(value: bigint): Buffer {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error('uint64 value is invalid');
  const result = Buffer.allocUnsafe(8);
  result.writeBigUInt64LE(value);
  return result;
}

export function encodeScriptNumber(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fffffff) {
    throw new Error('BIP34 block height is invalid');
  }
  if (value <= 16) return Buffer.from([0x50 + value]);
  let remaining = value;
  const encoded: number[] = [];
  while (remaining > 0) {
    encoded.push(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  if ((encoded.at(-1) ?? 0) & 0x80) encoded.push(0);
  return pushData(Buffer.from(encoded));
}

export function pushData(value: Uint8Array): Buffer {
  if (value.length < 0x4c) return Buffer.concat([Buffer.from([value.length]), value]);
  if (value.length <= 0xff) {
    return Buffer.concat([Buffer.from([0x4c, value.length]), value]);
  }
  if (value.length <= 0xffff) {
    const length = Buffer.allocUnsafe(3);
    length[0] = 0x4d;
    length.writeUInt16LE(value.length, 1);
    return Buffer.concat([length, value]);
  }
  throw new Error('Script push exceeds 65535 bytes');
}
