/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

const HEX_PATTERN = /^[0-9a-f]+$/i;

export function assertHex(value: string, bytes?: number, field = 'hex value'): void {
  if (value.length === 0 || value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    throw new Error(`${field} must be an even-length hexadecimal string`);
  }
  if (bytes !== undefined && value.length !== bytes * 2) {
    throw new Error(`${field} must be exactly ${bytes} bytes`);
  }
}

export function hexToBytes(value: string): Uint8Array {
  assertHex(value);
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function reverseBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value).reverse();
}

export function concatBytes(...values: readonly Uint8Array[]): Uint8Array {
  const length = values.reduce((total, value) => total + value.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

export function uint32LittleEndian(hex: string, field: string): Uint8Array {
  assertHex(hex, 4, field);
  const value = Number.parseInt(hex, 16);
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}
