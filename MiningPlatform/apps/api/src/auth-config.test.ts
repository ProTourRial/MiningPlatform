/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { authRuntimeConfig } from './modules/auth/auth-config.js';

test(
  'authentication TTL values are bounded integers',
  { concurrency: false },
  () => {
    const previousJwtSecret =
      process.env.AUTH_JWT_SECRET;
    const previousEncryptionKey =
      process.env.AUTH_ENCRYPTION_KEY;
    const previousAccess =
      process.env.AUTH_ACCESS_TOKEN_SECONDS;
    const previousRefresh =
      process.env.AUTH_REFRESH_TOKEN_DAYS;

    try {
      process.env.AUTH_JWT_SECRET =
        'test-only-jwt-secret-with-at-least-thirty-two-bytes';

      process.env.AUTH_ENCRYPTION_KEY =
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      process.env.AUTH_ACCESS_TOKEN_SECONDS = 'NaN';

      assert.throws(
        () => authRuntimeConfig(),
        /AUTH_ACCESS_TOKEN_SECONDS/,
      );

      process.env.AUTH_ACCESS_TOKEN_SECONDS = '900';
      process.env.AUTH_REFRESH_TOKEN_DAYS = '0';

      assert.throws(
        () => authRuntimeConfig(),
        /AUTH_REFRESH_TOKEN_DAYS/,
      );

      process.env.AUTH_REFRESH_TOKEN_DAYS = '30';

      assert.equal(
        authRuntimeConfig().accessTokenSeconds,
        900,
      );

      assert.equal(
        authRuntimeConfig().refreshTokenDays,
        30,
      );
    } finally {
      if (previousJwtSecret === undefined) {
        delete process.env.AUTH_JWT_SECRET;
      } else {
        process.env.AUTH_JWT_SECRET =
          previousJwtSecret;
      }

      if (previousEncryptionKey === undefined) {
        delete process.env.AUTH_ENCRYPTION_KEY;
      } else {
        process.env.AUTH_ENCRYPTION_KEY =
          previousEncryptionKey;
      }

      if (previousAccess === undefined) {
        delete process.env.AUTH_ACCESS_TOKEN_SECONDS;
      } else {
        process.env.AUTH_ACCESS_TOKEN_SECONDS =
          previousAccess;
      }

      if (previousRefresh === undefined) {
        delete process.env.AUTH_REFRESH_TOKEN_DAYS;
      } else {
        process.env.AUTH_REFRESH_TOKEN_DAYS =
          previousRefresh;
      }
    }
  },
);