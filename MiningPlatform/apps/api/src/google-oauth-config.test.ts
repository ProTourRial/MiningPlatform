/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { googleOAuthRuntimeConfig } from './modules/auth/google-oauth-config.js';

const names = [
  'NODE_ENV',
  'APP_URL',
  'GOOGLE_OAUTH_ENABLED',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS',
] as const;

test('Google OAuth configuration is fail-closed and validates its public boundary', { concurrency: false }, () => {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    process.env.GOOGLE_OAUTH_ENABLED = 'false';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'partial-secret-is-ignored-while-disabled';
    assert.deepEqual(googleOAuthRuntimeConfig(), { enabled: false });

    process.env.GOOGLE_OAUTH_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'http://public.example.test';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-confidential-client-secret';
    assert.throws(() => googleOAuthRuntimeConfig(), /HTTPS/);

    process.env.APP_URL = 'https://pool.example.test/path';
    assert.throws(() => googleOAuthRuntimeConfig(), /origin without a path/);

    process.env.APP_URL = 'https://pool.example.test';
    process.env.GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS = '601';
    assert.throws(() => googleOAuthRuntimeConfig(), /between 120 and 600/);

    process.env.GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS = '300';
    assert.deepEqual(googleOAuthRuntimeConfig(), {
      enabled: true,
      clientId: 'test.apps.googleusercontent.com',
      clientSecret: 'test-confidential-client-secret',
      returnOrigin: 'https://pool.example.test',
      redirectUri: 'https://pool.example.test/api/v1/auth/google/callback',
      attemptTtlSeconds: 300,
    });
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
