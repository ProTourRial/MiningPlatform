/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import {
  encryptSecret,
  hashOpaqueToken,
  hashPassword,
  generateTotpSecret,
  totpCode,
} from '@mining/security';
import type { AuthPrincipal } from './modules/auth/auth.decorators.js';
import { AuthService } from './modules/auth/auth.service.js';
import {
  GoogleIdentityClient,
  type GoogleAuthorizationRequest,
  type VerifiedGoogleIdentity,
} from './modules/auth/google-oauth.client.js';
import {
  GoogleOAuthCallbackError,
  GoogleOAuthService,
} from './modules/auth/google-oauth.service.js';
import { StepUpService } from './modules/auth/step-up.service.js';

process.env.AUTH_JWT_SECRET = 'google-oauth-integration-jwt-secret-at-least-32-bytes';
process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64url');
process.env.APP_URL = 'http://localhost:3000';
process.env.GOOGLE_OAUTH_ENABLED = 'true';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'integration.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'integration-confidential-client-secret';

class FakeGoogleIdentityClient extends GoogleIdentityClient {
  readonly requests: Array<{ state: string; nonce: string; codeVerifier: string }> = [];
  exchangeCount = 0;
  identity?: VerifiedGoogleIdentity;

  createAuthorizationRequest(state: string, nonce: string): Promise<GoogleAuthorizationRequest> {
    const codeVerifier = `test-code-verifier-${this.requests.length}-${randomUUID()}`;
    this.requests.push({ state, nonce, codeVerifier });
    return Promise.resolve({
      authorizationUrl: `https://accounts.google.test/authorize?state=${encodeURIComponent(state)}`,
      codeVerifier,
    });
  }

  exchangeAndVerify(_code: string, codeVerifier: string): Promise<VerifiedGoogleIdentity> {
    this.exchangeCount += 1;
    assert.ok(this.requests.some((request) => request.codeVerifier === codeVerifier));
    assert.ok(this.identity);
    return Promise.resolve(this.identity);
  }
}

test(
  'Google OAuth link and sign-in are replay-safe and never auto-link by email',
  { concurrency: false },
  async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
    const email = `google-${suffix}@example.test`;
    const password = `MiningPlatform-${suffix}-Password`;
    const user = await prisma.user.create({
      data: {
        email,
        displayName: 'Google OAuth Integration',
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        security: { create: { recoveryCodesHash: [] } },
        profile: { create: {} },
      },
    });
    const authService = new AuthService();
    const stepUpService = new StepUpService();
    const localSession = await authService.login({ email, password }, {});
    const session = await prisma.authSession.findUniqueOrThrow({
      where: { refreshTokenHash: hashOpaqueToken(localSession.refreshToken) },
    });
    const principal: AuthPrincipal = {
      userId: user.id,
      email,
      role: 'USER',
      sessionId: session.id,
      authenticationType: 'access-token',
      scopes: ['*'],
    };
    const secret = generateTotpSecret();
    await prisma.userSecurity.update({
      where: { userId: user.id },
      data: {
        totpEnabled: true,
        totpSecretEncrypted: encryptSecret(secret, process.env.AUTH_ENCRYPTION_KEY!),
        lastTotpCounter: null,
      },
    });

    const stepUp = await stepUpService.issue(principal, {
      scope: 'EXTERNAL_IDENTITY_LINK',
      password,
      code: totpCode(secret),
    });
    const provider = new FakeGoogleIdentityClient();
    const service = new GoogleOAuthService(provider, authService, stepUpService);
    const link = await service.startLink(principal, stepUp.token);
    assert.match(link.authorizationUrl, /^https:\/\/accounts\.google\.test\/authorize/);
    assert.match(link.browserBinding, /^mpgob_/);
    await assert.rejects(
      service.startLink(principal, stepUp.token),
      /Invalid, expired, or consumed step-up token/,
    );

    const linkRequest = provider.requests[0]!;
    const storedAttempt = await prisma.oAuthAttempt.findUniqueOrThrow({
      where: { stateHash: hashOpaqueToken(linkRequest.state) },
    });
    assert.equal(storedAttempt.purpose, 'LINK');
    assert.equal(storedAttempt.userId, user.id);
    assert.notEqual(storedAttempt.stateHash, linkRequest.state);
    assert.notEqual(storedAttempt.nonceHash, linkRequest.nonce);
    assert.notEqual(storedAttempt.browserBindingHash, link.browserBinding);
    assert.equal(storedAttempt.browserBindingHash, hashOpaqueToken(link.browserBinding));
    assert.ok(!storedAttempt.codeVerifierEncrypted.includes(linkRequest.codeVerifier));

    await assert.rejects(
      service.complete({ state: linkRequest.state, code: 'missing-binding-code' }, {}, undefined),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'failed',
    );
    await assert.rejects(
      service.complete(
        { state: linkRequest.state, code: 'mismatched-binding-code' },
        {},
        'mpgob_wrong-browser-binding',
      ),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'failed',
    );
    assert.equal(provider.exchangeCount, 0);
    assert.equal(
      (
        await prisma.oAuthAttempt.findUniqueOrThrow({
          where: { stateHash: hashOpaqueToken(linkRequest.state) },
        })
      ).consumedAt,
      null,
    );

    provider.identity = {
      subject: `google-subject-${suffix}`,
      email,
      emailVerified: true,
      nonce: linkRequest.nonce,
    };
    const linked = await service.complete(
      { state: linkRequest.state, code: 'link-code' },
      {},
      link.browserBinding,
    );
    assert.deepEqual(linked, {
      purpose: 'LINK',
      redirectPath: '/dashboard/security?oauth=linked',
    });
    assert.equal((await service.connection(user.id)).linked, true);
    await assert.rejects(
      service.complete({ state: linkRequest.state, code: 'replay-code' }, {}, link.browserBinding),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'failed',
    );

    const signIn = await service.startSignIn('https://attacker.example/redirect');
    const signInRequest = provider.requests.at(-1)!;
    provider.identity = {
      subject: `google-subject-${suffix}`,
      email,
      emailVerified: true,
      nonce: signInRequest.nonce,
    };
    const signedIn = await service.complete(
      { state: signInRequest.state, code: 'sign-in-code' },
      { ipHash: 'google-ip', userAgentHash: 'google-ua' },
      signIn.browserBinding,
    );
    assert.equal(signedIn.purpose, 'SIGN_IN');
    assert.equal(signedIn.redirectPath, '/dashboard');
    if (signedIn.purpose !== 'SIGN_IN') assert.fail('Expected a Google sign-in session');
    assert.equal(signedIn.session.user.id, user.id);
    assert.ok(signedIn.session.accessToken);
    assert.ok(signedIn.session.refreshToken);
    const loginAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: user.id, action: 'USER_LOGIN_SUCCEEDED' },
      orderBy: { occurredAt: 'desc' },
    });
    assert.deepEqual(loginAudit.metadata, { authenticationMethod: 'GOOGLE_OAUTH' });

    const unlinkedSignIn = await service.startSignIn('/dashboard');
    const unlinkedRequest = provider.requests.at(-1)!;
    provider.identity = {
      subject: `different-google-subject-${suffix}`,
      email,
      emailVerified: true,
      nonce: unlinkedRequest.nonce,
    };
    await assert.rejects(
      service.complete(
        { state: unlinkedRequest.state, code: 'unlinked-code' },
        {},
        unlinkedSignIn.browserBinding,
      ),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'not_linked',
    );

    const nonceSignIn = await service.startSignIn('/dashboard');
    const nonceRequest = provider.requests.at(-1)!;
    provider.identity = {
      subject: `google-subject-${suffix}`,
      email,
      emailVerified: true,
      nonce: 'incorrect-nonce',
    };
    await assert.rejects(
      service.complete(
        { state: nonceRequest.state, code: 'bad-nonce-code' },
        {},
        nonceSignIn.browserBinding,
      ),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'failed',
    );

    const cancelledSignIn = await service.startSignIn('/dashboard');
    const cancelledRequest = provider.requests.at(-1)!;
    await assert.rejects(
      service.cancel(cancelledRequest.state, 'mpgob_wrong-browser-binding'),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'failed',
    );
    assert.equal(
      (
        await prisma.oAuthAttempt.findUniqueOrThrow({
          where: { stateHash: hashOpaqueToken(cancelledRequest.state) },
        })
      ).consumedAt,
      null,
    );
    await assert.rejects(
      service.cancel(cancelledRequest.state, cancelledSignIn.browserBinding),
      (error: unknown) =>
        error instanceof GoogleOAuthCallbackError && error.publicCode === 'cancelled',
    );
    assert.ok(
      (
        await prisma.oAuthAttempt.findUniqueOrThrow({
          where: { stateHash: hashOpaqueToken(cancelledRequest.state) },
        })
      ).consumedAt,
    );

    await prisma.userSecurity.update({
      where: { userId: user.id },
      data: { lastTotpCounter: null },
    });
    const unlinkStepUp = await stepUpService.issue(principal, {
      scope: 'EXTERNAL_IDENTITY_LINK',
      password,
      code: totpCode(secret),
    });
    await service.unlink(principal, unlinkStepUp.token);
    assert.equal((await service.connection(user.id)).linked, false);
  },
);
