/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashOpaqueToken,
} from '@mining/security';
import type { AuthPrincipal } from './auth.decorators.js';
import { authRuntimeConfig } from './auth-config.js';
import { AuthService, type IssuedSession, type RequestFingerprint } from './auth.service.js';
import { googleOAuthRuntimeConfig } from './google-oauth-config.js';
import { GoogleIdentityClient, type VerifiedGoogleIdentity } from './google-oauth.client.js';
import { StepUpService } from './step-up.service.js';

type CallbackDestination = 'login' | 'security';

export class GoogleOAuthCallbackError extends Error {
  constructor(
    readonly publicCode: 'cancelled' | 'failed' | 'not_linked' | 'email_mismatch',
    readonly destination: CallbackDestination,
  ) {
    super(`Google OAuth callback failed: ${publicCode}`);
  }
}

export type GoogleOAuthCallbackResult =
  | { purpose: 'LINK'; redirectPath: string }
  | { purpose: 'SIGN_IN'; redirectPath: string; session: IssuedSession };

export interface GoogleOAuthStartResult {
  authorizationUrl: string;
  browserBinding: string;
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function safeRedirectPath(value: string | undefined): string {
  if (
    !value ||
    value.length > 512 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return '/dashboard';
  }
  return value;
}

function equalHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [result] = await tx.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  if (!result) throw new Error('Database did not return its current time');
  return result.now;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly identityClient: GoogleIdentityClient,
    private readonly authService: AuthService,
    private readonly stepUpService: StepUpService,
  ) {}

  publicStatus() {
    const config = googleOAuthRuntimeConfig();
    return {
      enabled: config.enabled,
      signIn: config.enabled,
      signUp: false,
      linkingRequires: ['password', 'totp', 'single-use-step-up'],
    };
  }

  async connection(userId: string) {
    const identity = await prisma.externalIdentity.findUnique({
      where: { userId_provider: { userId, provider: 'GOOGLE' } },
      select: { email: true, createdAt: true, lastUsedAt: true },
    });
    return {
      provider: 'GOOGLE',
      enabled: googleOAuthRuntimeConfig().enabled,
      linked: Boolean(identity),
      identity,
    };
  }

  async startSignIn(next: string | undefined): Promise<GoogleOAuthStartResult> {
    const redirectPath = safeRedirectPath(next);
    return this.createAttempt({ purpose: 'SIGN_IN', redirectPath });
  }

  async startLink(
    principal: AuthPrincipal,
    stepUpToken: string | undefined,
  ): Promise<GoogleOAuthStartResult> {
    if (!googleOAuthRuntimeConfig().enabled) {
      throw new ServiceUnavailableException('Google Sign-In is not enabled');
    }
    const request = await this.createProviderRequest();
    const config = googleOAuthRuntimeConfig();
    if (!config.enabled) throw new ServiceUnavailableException('Google Sign-In is not enabled');
    await prisma.$transaction(async (tx) => {
      await this.stepUpService.consume(tx, principal, 'EXTERNAL_IDENTITY_LINK', stepUpToken);
      const existing = await tx.externalIdentity.findUnique({
        where: { userId_provider: { userId: principal.userId, provider: 'GOOGLE' } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('A Google identity is already linked');
      const now = await databaseNow(tx);
      await tx.oAuthAttempt.create({
        data: {
          provider: 'GOOGLE',
          purpose: 'LINK',
          stateHash: hashOpaqueToken(request.state),
          codeVerifierEncrypted: encryptSecret(
            request.codeVerifier,
            authRuntimeConfig().encryptionKey,
          ),
          nonceHash: hashOpaqueToken(request.nonce),
          browserBindingHash: hashOpaqueToken(request.browserBinding),
          userId: principal.userId,
          redirectPath: '/dashboard/security',
          expiresAt: new Date(now.getTime() + config.attemptTtlSeconds * 1_000),
        },
      });
    });
    return {
      authorizationUrl: request.authorizationUrl,
      browserBinding: request.browserBinding,
    };
  }

  async unlink(principal: AuthPrincipal, stepUpToken: string | undefined) {
    await prisma.$transaction(async (tx) => {
      await this.stepUpService.consume(tx, principal, 'EXTERNAL_IDENTITY_LINK', stepUpToken);
      const identity = await tx.externalIdentity.findUnique({
        where: { userId_provider: { userId: principal.userId, provider: 'GOOGLE' } },
        select: { id: true, email: true },
      });
      if (!identity) throw new NotFoundException('No Google identity is linked');
      await tx.externalIdentity.delete({ where: { id: identity.id } });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'EXTERNAL_IDENTITY_UNLINKED',
          resourceType: 'ExternalIdentity',
          resourceId: identity.id,
          metadata: { provider: 'GOOGLE', email: identity.email },
        },
      });
    });
    return { provider: 'GOOGLE', linked: false };
  }

  async complete(
    input: { state: string; code: string },
    fingerprint: RequestFingerprint,
    browserBinding: string | undefined,
  ): Promise<GoogleOAuthCallbackResult> {
    if (
      input.state.length > 512 ||
      input.code.length > 4096 ||
      !browserBinding ||
      browserBinding.length > 512
    ) {
      throw new GoogleOAuthCallbackError('failed', 'login');
    }
    const attempt = await prisma
      .$transaction(async (tx) => {
        const now = await databaseNow(tx);
        const found = await tx.oAuthAttempt.findFirst({
          where: {
            provider: 'GOOGLE',
            stateHash: hashOpaqueToken(input.state),
            consumedAt: null,
            expiresAt: { gt: now },
          },
        });
        if (!found) throw new UnauthorizedException('OAuth state is invalid, expired, or consumed');
        if (!equalHash(hashOpaqueToken(browserBinding), found.browserBindingHash)) {
          throw new UnauthorizedException('OAuth browser binding is invalid');
        }
        const consumed = await tx.oAuthAttempt.updateMany({
          where: { id: found.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          throw new UnauthorizedException('OAuth state is invalid, expired, or consumed');
        }
        return found;
      })
      .catch(() => {
        throw new GoogleOAuthCallbackError('failed', 'login');
      });

    const destination: CallbackDestination = attempt.purpose === 'LINK' ? 'security' : 'login';
    let googleIdentity: VerifiedGoogleIdentity;
    try {
      googleIdentity = await this.identityClient.exchangeAndVerify(
        input.code,
        decryptSecret(attempt.codeVerifierEncrypted, authRuntimeConfig().encryptionKey),
      );
    } catch {
      throw new GoogleOAuthCallbackError('failed', destination);
    }
    if (
      !googleIdentity.emailVerified ||
      googleIdentity.subject.length > 255 ||
      !equalHash(hashOpaqueToken(googleIdentity.nonce), attempt.nonceHash)
    ) {
      throw new GoogleOAuthCallbackError('failed', destination);
    }
    const email = normalizedEmail(googleIdentity.email);

    if (attempt.purpose === 'LINK') {
      if (!attempt.userId) throw new GoogleOAuthCallbackError('failed', 'security');
      await this.linkIdentity(attempt.userId, googleIdentity.subject, email);
      return { purpose: 'LINK', redirectPath: `${attempt.redirectPath}?oauth=linked` };
    }

    const identity = await prisma.externalIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: 'GOOGLE',
          providerSubject: googleIdentity.subject,
        },
      },
      include: { user: true },
    });
    if (!identity) {
      throw new GoogleOAuthCallbackError('not_linked', 'login');
    }
    if (
      identity.user.status !== 'ACTIVE' ||
      !identity.user.emailVerifiedAt ||
      identity.user.deletedAt
    ) {
      throw new GoogleOAuthCallbackError('failed', 'login');
    }
    await prisma.externalIdentity.update({
      where: { id: identity.id },
      data: { email, emailVerified: true, lastUsedAt: new Date() },
    });
    return {
      purpose: 'SIGN_IN',
      redirectPath: attempt.redirectPath,
      session: await this.authService.issueGoogleSession(identity.user, fingerprint),
    };
  }

  async cancel(state: string, browserBinding: string | undefined): Promise<never> {
    if (state.length > 512 || !browserBinding || browserBinding.length > 512) {
      throw new GoogleOAuthCallbackError('failed', 'login');
    }
    const attempt = await prisma
      .$transaction(async (tx) => {
        const now = await databaseNow(tx);
        const found = await tx.oAuthAttempt.findFirst({
          where: {
            provider: 'GOOGLE',
            stateHash: hashOpaqueToken(state),
            consumedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true, purpose: true, browserBindingHash: true },
        });
        if (!found) throw new Error('OAuth state is invalid, expired, or consumed');
        if (!equalHash(hashOpaqueToken(browserBinding), found.browserBindingHash)) {
          throw new Error('OAuth browser binding is invalid');
        }
        const consumed = await tx.oAuthAttempt.updateMany({
          where: { id: found.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new Error('OAuth state was already consumed');
        return found;
      })
      .catch(() => {
        throw new GoogleOAuthCallbackError('failed', 'login');
      });
    throw new GoogleOAuthCallbackError(
      'cancelled',
      attempt.purpose === 'LINK' ? 'security' : 'login',
    );
  }

  callbackErrorUrl(error: unknown): string {
    const config = googleOAuthRuntimeConfig();
    if (!config.enabled) throw new ServiceUnavailableException('Google Sign-In is not enabled');
    const known =
      error instanceof GoogleOAuthCallbackError
        ? error
        : new GoogleOAuthCallbackError('failed', 'login');
    const path = known.destination === 'security' ? '/dashboard/security' : '/login';
    const url = new URL(path, config.returnOrigin);
    url.searchParams.set('oauth', known.publicCode);
    return url.toString();
  }

  successUrl(path: string): string {
    const config = googleOAuthRuntimeConfig();
    if (!config.enabled) throw new ServiceUnavailableException('Google Sign-In is not enabled');
    return new URL(safeRedirectPath(path), config.returnOrigin).toString();
  }

  private async createAttempt(input: {
    purpose: 'SIGN_IN';
    redirectPath: string;
  }): Promise<GoogleOAuthStartResult> {
    const config = googleOAuthRuntimeConfig();
    if (!config.enabled) throw new ServiceUnavailableException('Google Sign-In is not enabled');
    const request = await this.createProviderRequest();
    await prisma.$transaction(async (tx) => {
      const now = await databaseNow(tx);
      await tx.oAuthAttempt.create({
        data: {
          provider: 'GOOGLE',
          purpose: input.purpose,
          stateHash: hashOpaqueToken(request.state),
          codeVerifierEncrypted: encryptSecret(
            request.codeVerifier,
            authRuntimeConfig().encryptionKey,
          ),
          nonceHash: hashOpaqueToken(request.nonce),
          browserBindingHash: hashOpaqueToken(request.browserBinding),
          redirectPath: input.redirectPath,
          expiresAt: new Date(now.getTime() + config.attemptTtlSeconds * 1_000),
        },
      });
    });
    return {
      authorizationUrl: request.authorizationUrl,
      browserBinding: request.browserBinding,
    };
  }

  private async createProviderRequest() {
    const state = generateOpaqueToken('mpgos', 32);
    const nonce = generateOpaqueToken('mpgon', 32);
    const browserBinding = generateOpaqueToken('mpgob', 32);
    const request = await this.identityClient.createAuthorizationRequest(state, nonce);
    return { ...request, state, nonce, browserBinding };
  }

  private async linkIdentity(userId: string, subject: string, email: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            status: 'ACTIVE',
            emailVerifiedAt: { not: null },
            deletedAt: null,
          },
          select: { id: true, email: true },
        });
        if (!user) throw new UnauthorizedException('Account is not active');
        if (normalizedEmail(user.email) !== email) {
          throw new GoogleOAuthCallbackError('email_mismatch', 'security');
        }
        const identity = await tx.externalIdentity.create({
          data: {
            userId,
            provider: 'GOOGLE',
            providerSubject: subject,
            email,
            emailVerified: true,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            action: 'EXTERNAL_IDENTITY_LINKED',
            resourceType: 'ExternalIdentity',
            resourceId: identity.id,
            metadata: { provider: 'GOOGLE', email },
          },
        });
      });
    } catch (error) {
      if (error instanceof GoogleOAuthCallbackError) throw error;
      throw new GoogleOAuthCallbackError('failed', 'security');
    }
  }
}
