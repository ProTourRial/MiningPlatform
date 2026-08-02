/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  findBackupCodeIndex,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  hashPassword,
  parseDeviceMetadata,
  signAccessToken,
  totpAt,
  verifyAccessToken,
  verifyPassword,
  verifyTotp,
} from './index.js';

test('password hashing rejects invalid passwords and verifies valid passwords', async () => {
  await assert.rejects(() => hashPassword('weak'));
  const encoded = await hashPassword('ValidPassword123');
  assert.equal(await verifyPassword('ValidPassword123', encoded), true);
  assert.equal(await verifyPassword('WrongPassword123', encoded), false);
});

test('access token signs and validates issuer, audience, expiry, and session', () => {
  const secret = 'jwt-secret-that-is-longer-than-thirty-two-characters';
  const now = new Date('2026-07-31T10:00:00.000Z');
  const token = signAccessToken(
    { sub: 'user-1', sid: 'session-1', jti: 'jti-1', type: 'access', roles: ['USER'] },
    { secret, issuer: 'MiningPlatform', audience: 'MiningPlatformWeb', expiresInSeconds: 900, now },
  );
  const payload = verifyAccessToken(token, { secret, issuer: 'MiningPlatform', audience: 'MiningPlatformWeb', now });
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.sid, 'session-1');
});

test('TOTP generates RFC-style codes and verifies adjacent time window', () => {
  const secret = generateTotpSecret();
  const now = new Date('2026-07-31T10:00:00.000Z');
  const code = totpAt(secret, now.getTime());
  assert.equal(verifyTotp(code, secret, { now }), true);
  assert.equal(buildTotpUri('abia@example.com', 'MiningPlatform', secret).startsWith('otpauth://totp/'), true);
});

test('encrypted secret round trips through AES-GCM', () => {
  const key = 'encryption-key-that-is-longer-than-thirty-two-characters';
  const encrypted = encryptSecret('TOTPSECRET', key);
  assert.equal(decryptSecret(encrypted, key), 'TOTPSECRET');
});

test('backup codes are one-time hash comparable', () => {
  const pepper = 'backup-code-pepper-that-is-longer-than-thirty-two-characters';
  const codes = generateBackupCodes(4);
  const hashes = codes.map((code) => hashBackupCode(code, pepper));
  assert.equal(findBackupCodeIndex(codes[2]!, hashes, pepper), 2);
  assert.equal(findBackupCodeIndex('AAAA-BBBB-CCCC-DDDD', hashes, pepper), -1);
});

test('device parser reports browser and operating system without trusting it for authorization', () => {
  const device = parseDeviceMetadata('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/126.0 Safari/537.36');
  assert.equal(device.operatingSystem, 'Windows');
  assert.equal(device.browser, 'Chrome');
  assert.equal(device.deviceType, 'DESKTOP');
});
