/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function keyFromSecret(secret: string): Buffer {
  if (secret.length < 32) throw new Error('Encryption secret must contain at least 32 characters');
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['aes256gcm', 'v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('$');
}

export function decryptSecret(encoded: string, secret: string): string {
  const [format, version, ivRaw, tagRaw, ciphertextRaw, extra] = encoded.split('$');
  if (extra !== undefined || format !== 'aes256gcm' || version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Invalid encrypted secret');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}
