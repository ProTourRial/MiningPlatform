/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function parseKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY must be a 32-byte base64url value');
  return key;
}

export function encryptSecret(plaintext: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', parseKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['aes256gcm', 'v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('$');
}

export function decryptSecret(encoded: string, encodedKey: string): string {
  const [format, version, ivRaw, tagRaw, ciphertextRaw, extra] = encoded.split('$');
  if (extra !== undefined || format !== 'aes256gcm' || version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = createDecipheriv('aes-256-gcm', parseKey(encodedKey), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}
