/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { AuthController } from './modules/auth/auth.controller.js';
import type { AuthService } from './modules/auth/auth.service.js';
import type { GoogleOAuthService } from './modules/auth/google-oauth.service.js';
import type { StepUpService } from './modules/auth/step-up.service.js';

process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:3000';
process.env.GOOGLE_OAUTH_ENABLED = 'true';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'controller-test.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'controller-test-confidential-secret';
process.env.GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS = '300';
process.env.AUTH_JWT_SECRET = 'controller-test-jwt-secret-at-least-32-bytes';
process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString('base64url');

function configureControllerOAuth(): void {
  process.env.NODE_ENV = 'test';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.GOOGLE_OAUTH_ENABLED = 'true';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'controller-test.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'controller-test-confidential-secret';
  process.env.GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS = '300';
}

interface RecordedCookie {
  name: string;
  value?: string;
  options?: Record<string, unknown>;
}

const bindingByCookieName = {
  mp_google_oauth_binding: 'mpgob_plain-controller-binding',
  '__Host-mp_google_oauth_binding': 'mpgob_secure-controller-binding',
} as const;

function responseRecorder() {
  const cookies: RecordedCookie[] = [];
  const cleared: RecordedCookie[] = [];
  const headers = new Map<string, string>();
  const redirects: string[] = [];
  const response = {
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      cookies.push({ name, value, options });
      return response;
    },
    clearCookie(name: string, options?: Record<string, unknown>) {
      cleared.push({ name, options });
      return response;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    redirect(url: string) {
      redirects.push(url);
      return response;
    },
  } as unknown as Response;
  return { response, cookies, cleared, headers, redirects };
}

function controller(service: Partial<GoogleOAuthService>): AuthController {
  return new AuthController({} as AuthService, {} as StepUpService, service as GoogleOAuthService);
}

test('Google OAuth start writes a short-lived HttpOnly browser-binding cookie before redirect', async () => {
  configureControllerOAuth();
  const recorded = responseRecorder();
  const oauth = controller({
    startSignIn: async () => {
      process.env.APP_URL = 'https://pool.example.test';
      return {
        authorizationUrl: 'https://accounts.google.test/authorize',
        browserBinding: 'mpgob_controller-binding',
      };
    },
  });

  await oauth.startGoogleSignIn('/dashboard', recorded.response);

  assert.equal(recorded.cookies.length, 1);
  const bindingCookie = recorded.cookies[0]!;
  assert.ok(bindingCookie.name in bindingByCookieName);
  assert.deepEqual(bindingCookie, {
    name: bindingCookie.name,
    value: 'mpgob_controller-binding',
    options: {
      httpOnly: true,
      secure: bindingCookie.name.startsWith('__Host-'),
      sameSite: 'lax',
      path: '/',
      maxAge: 300_000,
    },
  });
  assert.equal(recorded.headers.get('cache-control'), 'no-store');
  assert.deepEqual(recorded.redirects, ['https://accounts.google.test/authorize']);
});

test('Google OAuth callback forwards the binding and clears it before issuing the session redirect', async () => {
  configureControllerOAuth();
  const recorded = responseRecorder();
  let receivedBinding: string | undefined;
  const oauth = controller({
    complete: async (_input, _fingerprint, browserBinding) => {
      receivedBinding = browserBinding;
      process.env.APP_URL = 'https://pool.example.test';
      return {
        purpose: 'SIGN_IN',
        redirectPath: '/dashboard',
        session: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      } as never;
    },
    successUrl: () => 'http://localhost:3000/dashboard',
    callbackErrorUrl: () => 'http://localhost:3000/login?oauth=failed',
  });
  const request = {
    ip: '127.0.0.1',
    headers: {
      cookie:
        'mp_google_oauth_binding=mpgob_plain-controller-binding; __Host-mp_google_oauth_binding=mpgob_secure-controller-binding',
    },
  } as Request;

  await oauth.completeGoogleSignIn(
    'state',
    'code',
    undefined,
    request,
    recorded.response,
    'controller-test',
  );

  assert.equal(recorded.cleared.length, 1);
  const clearedBindingCookie = recorded.cleared[0]!;
  assert.ok(clearedBindingCookie.name in bindingByCookieName);
  assert.equal(
    receivedBinding,
    bindingByCookieName[clearedBindingCookie.name as keyof typeof bindingByCookieName],
  );
  assert.deepEqual(
    recorded.cookies.map(({ name }) => name),
    ['mp_access', 'mp_refresh'],
  );
  assert.deepEqual(clearedBindingCookie.options, {
    httpOnly: true,
    secure: clearedBindingCookie.name.startsWith('__Host-'),
    sameSite: 'lax',
    path: '/',
  });
  assert.deepEqual(recorded.redirects, ['http://localhost:3000/dashboard']);
});

test('Google OAuth provider cancellation forwards the binding and clears it on the error redirect', async () => {
  configureControllerOAuth();
  const recorded = responseRecorder();
  let receivedBinding: string | undefined;
  const oauth = controller({
    cancel: async (_state, browserBinding) => {
      receivedBinding = browserBinding;
      process.env.APP_URL = 'https://pool.example.test';
      throw new Error('cancelled');
    },
    callbackErrorUrl: () => 'http://localhost:3000/login?oauth=cancelled',
  });
  const request = {
    headers: {
      cookie:
        'mp_google_oauth_binding=mpgob_plain-controller-binding; __Host-mp_google_oauth_binding=mpgob_secure-controller-binding',
    },
  } as Request;

  await oauth.completeGoogleSignIn(
    'state',
    undefined,
    'access_denied',
    request,
    recorded.response,
    'controller-test',
  );

  assert.equal(recorded.cleared.length, 1);
  const clearedBindingCookie = recorded.cleared[0]!;
  assert.ok(clearedBindingCookie.name in bindingByCookieName);
  assert.equal(
    receivedBinding,
    bindingByCookieName[clearedBindingCookie.name as keyof typeof bindingByCookieName],
  );
  assert.deepEqual(clearedBindingCookie.options, {
    httpOnly: true,
    secure: clearedBindingCookie.name.startsWith('__Host-'),
    sameSite: 'lax',
    path: '/',
  });
  assert.deepEqual(recorded.redirects, ['http://localhost:3000/login?oauth=cancelled']);
});
