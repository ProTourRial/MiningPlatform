/** MiningPlatform — Author: Abia Nugrahanto */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashPassword,
  signAccessToken,
  totpCode,
  verifyAccessToken,
  verifyPassword,
  verifyTotpCode,
} from './index.js';

test('hashes and verifies website passwords', async () => {
  const hash = await hashPassword('MiningPlatform-Password-2026');
  assert.equal(await verifyPassword('MiningPlatform-Password-2026', hash), true);
  assert.equal(await verifyPassword('Wrong-Password-2026', hash), false);
});

test('signs and verifies bounded access tokens', () => {
  const secret = 'a-very-long-control-plane-jwt-secret-2026';
  const token = signAccessToken({
    sub: 'user-1',
    sid: 'session-1',
    role: 'USER',
    email: 'user@example.test',
    iss: 'mining-platform',
    aud: 'control-plane',
  }, secret, 900, 1_700_000_000);
  const claims = verifyAccessToken(token, secret, { issuer: 'mining-platform', audience: 'control-plane' }, 1_700_000_100);
  assert.equal(claims.sub, 'user-1');
  assert.throws(() => verifyAccessToken(token, secret, { issuer: 'mining-platform', audience: 'control-plane' }, 1_700_001_000));
});

test('generates and verifies RFC 6238 TOTP codes', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const code = totpCode(secret, now);
  assert.equal(verifyTotpCode(secret, code, now), true);
  assert.equal(verifyTotpCode(secret, '000000', now), code === '000000');
});

test('encrypts and decrypts TOTP and delivery secrets', () => {
  const key = Buffer.alloc(32, 7).toString('base64url');
  const encrypted = encryptSecret('secret-value', key);
  assert.equal(decryptSecret(encrypted, key), 'secret-value');
  assert.notEqual(encrypted.includes('secret-value'), true);
});
