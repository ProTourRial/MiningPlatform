/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ARTIFACT_AAD_DOMAIN = 'miningplatform-wallet-artifact-v2';

function artifactAad(context: string): Buffer {
  if (!/^[A-Za-z0-9:_-]{16,256}$/.test(context)) {
    throw new Error('Wallet artifact authentication context is invalid');
  }
  return Buffer.from(`${ARTIFACT_AAD_DOMAIN}:${context}`, 'utf8');
}

export function parseArtifactEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('Wallet artifact encryption key must decode to 32 bytes');
  return key;
}

export function encryptWalletArtifact(plaintext: string, key: Buffer, context: string): string {
  if (key.length !== 32) throw new Error('Wallet artifact encryption key must be 32 bytes');
  if (!plaintext || Buffer.byteLength(plaintext) > 700_000)
    throw new Error('Wallet artifact is invalid');
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, initializationVector);
  cipher.setAAD(artifactAad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v2',
    initializationVector.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptWalletArtifact(encrypted: string, key: Buffer, context: string): string {
  if (key.length !== 32) throw new Error('Wallet artifact encryption key must be 32 bytes');
  const [version, initializationVectorValue, authenticationTagValue, ciphertextValue] =
    encrypted.split('.');
  if (
    version !== 'v2' ||
    !initializationVectorValue ||
    !authenticationTagValue ||
    !ciphertextValue
  ) {
    throw new Error('Encrypted wallet artifact format is invalid');
  }
  const initializationVector = Buffer.from(initializationVectorValue, 'base64url');
  const authenticationTag = Buffer.from(authenticationTagValue, 'base64url');
  const ciphertext = Buffer.from(ciphertextValue, 'base64url');
  if (
    initializationVector.length !== 12 ||
    authenticationTag.length !== 16 ||
    ciphertext.length === 0
  ) {
    throw new Error('Encrypted wallet artifact is invalid');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, initializationVector);
  decipher.setAAD(artifactAad(context));
  decipher.setAuthTag(authenticationTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
