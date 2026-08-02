/** MiningPlatform — Author: Abia Nugrahanto */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIdentityEmail } from './email-delivery.js';

test('builds verification and reset links without exposing tokens outside the URL', () => {
  const base = new URL('https://mining.example');
  const verification = buildIdentityEmail('identity.email-verification.requested.v1', 'user@example.test', 'mpv_token', base);
  assert.match(verification.text, /https:\/\/mining\.example\/verify-email\?token=mpv_token/);
  const reset = buildIdentityEmail('identity.password-reset.requested.v1', 'user@example.test', 'mpp_token', base);
  assert.match(reset.text, /https:\/\/mining\.example\/reset-password\?token=mpp_token/);
});
