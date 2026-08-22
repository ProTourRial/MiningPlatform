/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';
import {
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  generateTotpSecret,
  hashOpaqueToken,
  hashPassword,
  signAccessToken,
  verifyPassword,
  verifyTotpCodeWithCounter,
} from '@mining/security';
import { authRuntimeConfig } from './auth-config.js';
import type { AuthPrincipal } from './auth.decorators.js';
import type {
  DisableTotpDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto.js';
import {
  feePercentFromPartsPerMillion,
  requireActiveDefaultFeePolicy,
} from '../fees/fee-policy.js';

export interface RequestFingerprint {
  ipHash?: string;
  userAgentHash?: string;
}

interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;
  user: { id: string; email: string; displayName: string; role: string };
}

const LOGIN_MAXIMUM_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1_000;
const dummyHash = hashPassword('MiningPlatform-Invalid-Password-2026');

class RefreshTokenReuseError extends Error {
  constructor(readonly familyId: string) {
    super('Refresh token was already rotated');
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function personalReferralCode(userId: string): string {
  return `MP${createHash('sha256').update(userId).digest('hex').slice(0, 16).toUpperCase()}`;
}

function plusHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1_000);
}

async function appendOutbox(
  tx: Prisma.TransactionClient,
  input: {
    eventName: string;
    aggregateType: string;
    aggregateId: string;
    payload: Prisma.InputJsonValue;
  },
): Promise<void> {
  const eventId = randomUUID();
  await tx.outboxEvent.create({
    data: {
      eventId,
      eventName: input.eventName,
      eventVersion: 1,
      producer: 'control-plane-api',
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: eventId,
      idempotencyKey: `${input.eventName}:${eventId}`,
      payload: input.payload,
      occurredAt: new Date(),
    },
  });
}

@Injectable()
export class AuthService {
  async register(dto: RegisterDto, fingerprint: RequestFingerprint) {
    const email = normalizeEmail(dto.email);
    const [existing, existingMiningAccount] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.miningAccount.findUnique({
        where: { username: dto.miningUsername.toLowerCase() },
        select: { id: true },
      }),
    ]);
    if (existing) throw new ConflictException('Email is already registered');
    if (existingMiningAccount) throw new ConflictException('Mining username is already registered');

    const passwordHash = await hashPassword(dto.password);
    const rawVerificationToken = generateOpaqueToken('mpv');
    const tokenHash = hashOpaqueToken(rawVerificationToken);

    const user = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { symbol: 'BTC', enabled: true },
        select: { id: true },
      });
      if (!asset)
        throw new ServiceUnavailableException('BTC asset must be seeded before registration');
      const feePolicy = await requireActiveDefaultFeePolicy(tx);
      const created = await tx.user.create({
        data: {
          email,
          displayName: dto.displayName.trim(),
          passwordHash,
          security: { create: { recoveryCodesHash: [] } },
          profile: { create: {} },
        },
        select: { id: true, email: true, displayName: true, role: true, status: true },
      });
      const referralProgram = await tx.referralProgram.findFirst({
        where: {
          status: 'ACTIVE',
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }],
        },
        orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }],
      });
      if (!referralProgram) {
        throw new ServiceUnavailableException('No active referral program is configured');
      }
      await tx.referralCode.create({
        data: {
          code: personalReferralCode(created.id),
          programId: referralProgram.id,
          ownerUserId: created.id,
          beneficiaryType: 'USER',
        },
      });
      await tx.miningAccount.create({
        data: {
          userId: created.id,
          assetId: asset.id,
          feePolicyId: feePolicy.id,
          username: dto.miningUsername.toLowerCase(),
          rewardMethod: 'FOLLOW_UPSTREAM',
          platformFeePercent: feePercentFromPartsPerMillion(feePolicy.feePartsPerMillion),
        },
      });
      const verificationToken = await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash,
          tokenEncrypted: encryptSecret(rawVerificationToken, authRuntimeConfig().encryptionKey),
          expiresAt: plusHours(24),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: created.id,
          action: 'USER_REGISTERED',
          resourceType: 'User',
          resourceId: created.id,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
        },
      });
      await appendOutbox(tx, {
        eventName: 'identity.email-verification.requested.v1',
        aggregateType: 'User',
        aggregateId: created.id,
        payload: { userId: created.id, email: created.email, tokenId: verificationToken.id },
      });
      return created;
    });

    const response: Record<string, unknown> = { user, verificationRequired: true };
    if (authRuntimeConfig().exposeTestTokens) response.verificationToken = rawVerificationToken;
    return response;
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashOpaqueToken(rawToken);
    return prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findFirst({
        where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!token) throw new UnauthorizedException('Verification token is invalid or expired');
      const now = new Date();
      const user = await tx.user.update({
        where: { id: token.userId },
        data: { status: 'ACTIVE', emailVerifiedAt: now },
        select: { id: true, email: true, status: true, emailVerifiedAt: true },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId: token.userId, consumedAt: null },
        data: { consumedAt: now, tokenEncrypted: null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'EMAIL_VERIFIED',
          resourceType: 'User',
          resourceId: user.id,
        },
      });
      return user;
    });
  }

  async login(dto: LoginDto, fingerprint: RequestFingerprint): Promise<IssuedSession> {
    const email = normalizeEmail(dto.email);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { security: true },
    });
    const passwordMatches = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await dummyHash),
    );
    if (!user || !user.security || !passwordMatches) {
      if (user?.security) await this.recordFailedLogin(user.id, user.security.failedLoginCount);
      throw new UnauthorizedException('Invalid email, password, or second factor');
    }
    if (user.security.lockedUntil && user.security.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is temporarily locked');
    }
    if (user.status !== 'ACTIVE' || !user.emailVerifiedAt || user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }
    if (user.security.totpEnabled) {
      const totpCounter =
        dto.totpCode && user.security.totpSecretEncrypted
          ? verifyTotpCodeWithCounter(
              decryptSecret(user.security.totpSecretEncrypted, authRuntimeConfig().encryptionKey),
              dto.totpCode,
            )
          : undefined;
      const recoveryHash = dto.recoveryCode ? hashOpaqueToken(dto.recoveryCode) : undefined;
      const recoveryValid = Boolean(
        recoveryHash && user.security.recoveryCodesHash.includes(recoveryHash),
      );
      if (totpCounter === undefined && !recoveryValid) {
        await this.recordFailedLogin(user.id, user.security.failedLoginCount);
        throw new UnauthorizedException('Invalid email, password, or second factor');
      }
      if (recoveryValid && recoveryHash) {
        const consumed = await prisma.$executeRaw`
          UPDATE "UserSecurity"
          SET "recoveryCodesHash" = array_remove("recoveryCodesHash", ${recoveryHash}),
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "userId" = ${user.id}
            AND ${recoveryHash} = ANY("recoveryCodesHash")
        `;
        if (consumed !== 1) {
          await this.recordFailedLogin(user.id, user.security.failedLoginCount);
          throw new UnauthorizedException('Invalid email, password, or second factor');
        }
      } else if (totpCounter !== undefined) {
        const consumed = await prisma.userSecurity.updateMany({
          where: {
            userId: user.id,
            OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: totpCounter } }],
          },
          data: { lastTotpCounter: totpCounter },
        });
        if (consumed.count !== 1) {
          await this.recordFailedLogin(user.id, user.security.failedLoginCount);
          throw new UnauthorizedException('Invalid email, password, or second factor');
        }
      }
    }
    return this.issueSession(user, fingerprint);
  }

  async refresh(rawRefreshToken: string, fingerprint: RequestFingerprint): Promise<IssuedSession> {
    const currentHash = hashOpaqueToken(rawRefreshToken);
    const token = await prisma.authRefreshToken.findUnique({
      where: { tokenHash: currentHash },
      include: {
        session: {
          include: { user: true },
        },
      },
    });

    if (!token) throw new UnauthorizedException('Refresh token is invalid or expired');
    if (token.status === 'ROTATED' || token.status === 'REUSED') {
      await this.revokeTokenFamily(token.familyId, token.session.userId, token.id, fingerprint);
      throw new UnauthorizedException(
        'Refresh token reuse detected; the session family was revoked',
      );
    }
    if (
      token.status !== 'ACTIVE' ||
      token.expiresAt <= new Date() ||
      token.session.revokedAt ||
      token.session.expiresAt <= new Date() ||
      token.session.user.status !== 'ACTIVE' ||
      token.session.user.deletedAt
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const config = authRuntimeConfig();
    const nextRefreshToken = generateOpaqueToken('mpr');
    const nextHash = hashOpaqueToken(nextRefreshToken);
    const expiresAt = new Date(Date.now() + config.refreshTokenDays * 86_400_000);
    try {
      await prisma.$transaction(async (tx) => {
        const rotated = await tx.authRefreshToken.updateMany({
          where: {
            id: token.id,
            tokenHash: currentHash,
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
          data: { status: 'ROTATED', rotatedAt: new Date() },
        });
        if (rotated.count !== 1) throw new RefreshTokenReuseError(token.familyId);

        await tx.authRefreshToken.create({
          data: {
            sessionId: token.sessionId,
            familyId: token.familyId,
            tokenHash: nextHash,
            expiresAt,
          },
        });
        const updated = await tx.authSession.updateMany({
          where: {
            id: token.sessionId,
            tokenFamilyId: token.familyId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            refreshTokenHash: nextHash,
            expiresAt,
            lastUsedAt: new Date(),
            ipHash: fingerprint.ipHash,
            userAgentHash: fingerprint.userAgentHash,
          },
        });
        if (updated.count !== 1) throw new UnauthorizedException('Session is no longer active');
      });
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.revokeTokenFamily(error.familyId, token.session.userId, token.id, fingerprint);
        throw new UnauthorizedException(
          'Refresh token reuse detected; the session family was revoked',
        );
      }
      throw error;
    }

    return {
      accessToken: this.accessToken(token.session.user, token.session.id),
      refreshToken: nextRefreshToken,
      accessTokenExpiresIn: config.accessTokenSeconds,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      user: {
        id: token.session.user.id,
        email: token.session.user.email,
        displayName: token.session.user.displayName,
        role: token.session.user.role,
      },
    };
  }

  async logout(principal: AuthPrincipal): Promise<{ revoked: boolean }> {
    if (principal.authenticationType !== 'access-token') return { revoked: false };
    const now = new Date();
    const revoked = await prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findFirst({
        where: { id: principal.sessionId, userId: principal.userId, revokedAt: null },
        select: { id: true, tokenFamilyId: true },
      });
      if (!session) return false;
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now, revokeReason: 'USER_LOGOUT' },
      });
      await tx.authRefreshToken.updateMany({
        where: { familyId: session.tokenFamilyId, status: { in: ['ACTIVE', 'ROTATED'] } },
        data: { status: 'REVOKED', revokedAt: now },
      });
      return true;
    });
    return { revoked };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    let rawToken: string | undefined;
    if (user && !user.deletedAt && user.status !== 'CLOSED') {
      rawToken = generateOpaqueToken('mpp');
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date(), tokenEncrypted: null },
        });
        const resetToken = await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashOpaqueToken(rawToken!),
            tokenEncrypted: encryptSecret(rawToken!, authRuntimeConfig().encryptionKey),
            expiresAt: plusHours(1),
          },
        });
        await appendOutbox(tx, {
          eventName: 'identity.password-reset.requested.v1',
          aggregateType: 'User',
          aggregateId: user.id,
          payload: { userId: user.id, email: user.email, tokenId: resetToken.id },
        });
      });
    }
    const response: Record<string, unknown> = { accepted: true };
    if (rawToken && authRuntimeConfig().exposeTestTokens) response.resetToken = rawToken;
    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const passwordHash = await hashPassword(dto.password);
    const tokenHash = hashOpaqueToken(dto.token);
    await prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findFirst({
        where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!token) throw new UnauthorizedException('Reset token is invalid or expired');
      const now = new Date();
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.userSecurity.update({
        where: { userId: token.userId },
        data: { passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, consumedAt: null },
        data: { consumedAt: now, tokenEncrypted: null },
      });
      const activeSessions = await tx.authSession.findMany({
        where: { userId: token.userId, revokedAt: null },
        select: { tokenFamilyId: true },
      });
      await tx.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'PASSWORD_RESET' },
      });
      const familyIds = [...new Set(activeSessions.map((session) => session.tokenFamilyId))];
      if (familyIds.length > 0) {
        await tx.authRefreshToken.updateMany({
          where: { familyId: { in: familyIds }, status: { in: ['ACTIVE', 'ROTATED'] } },
          data: { status: 'REVOKED', revokedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: token.userId,
          action: 'PASSWORD_RESET',
          resourceType: 'User',
          resourceId: token.userId,
        },
      });
    });
    return { reset: true };
  }

  async beginTotpSetup(principal: AuthPrincipal) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('TOTP management requires an interactive user session');
    }
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      include: { security: true },
    });
    if (!user?.security) throw new NotFoundException('User security profile not found');
    if (user.security.totpEnabled) {
      throw new ConflictException('TOTP is already enabled; disable it before re-enrollment');
    }
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, authRuntimeConfig().encryptionKey);
    const pending = await prisma.userSecurity.updateMany({
      where: { userId: user.id, totpEnabled: false },
      data: { totpPendingSecretEncrypted: encrypted },
    });
    if (pending.count !== 1) {
      throw new ConflictException('TOTP is already enabled; disable it before re-enrollment');
    }
    return {
      secret,
      otpAuthUri: buildTotpUri({ secret, account: user.email, issuer: 'MiningPlatform' }),
    };
  }

  async enableTotp(principal: AuthPrincipal, code: string) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('TOTP management requires an interactive user session');
    }
    const security = await prisma.userSecurity.findUnique({ where: { userId: principal.userId } });
    if (!security?.totpPendingSecretEncrypted) throw new NotFoundException('No pending TOTP setup');
    if (security.totpEnabled) {
      throw new ConflictException('TOTP is already enabled; disable it before re-enrollment');
    }
    const config = authRuntimeConfig();
    const secret = decryptSecret(security.totpPendingSecretEncrypted, config.encryptionKey);
    const totpCounter = verifyTotpCodeWithCounter(secret, code);
    if (totpCounter === undefined) throw new UnauthorizedException('Invalid TOTP code');
    const recoveryCodes = Array.from({ length: 8 }, () => generateOpaqueToken('mprc', 10));
    await prisma.$transaction(async (tx) => {
      const enabled = await tx.userSecurity.updateMany({
        where: {
          userId: principal.userId,
          totpEnabled: false,
          totpPendingSecretEncrypted: security.totpPendingSecretEncrypted,
        },
        data: {
          totpEnabled: true,
          totpSecretEncrypted: security.totpPendingSecretEncrypted,
          totpPendingSecretEncrypted: null,
          recoveryCodesHash: recoveryCodes.map(hashOpaqueToken),
          lastTotpCounter: totpCounter,
        },
      });
      if (enabled.count !== 1) {
        throw new ConflictException('TOTP enrollment state changed; start setup again');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'TOTP_ENABLED',
          resourceType: 'UserSecurity',
          resourceId: security.id,
        },
      });
    });
    return { enabled: true, recoveryCodes };
  }

  async disableTotp(principal: AuthPrincipal, dto: DisableTotpDto) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('TOTP management requires an interactive user session');
    }
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      include: { security: true },
    });
    if (!user?.security?.totpEnabled || !user.security.totpSecretEncrypted) {
      throw new NotFoundException('TOTP is not enabled');
    }
    const passwordValid = await verifyPassword(dto.password, user.passwordHash);
    const secret = decryptSecret(
      user.security.totpSecretEncrypted,
      authRuntimeConfig().encryptionKey,
    );
    const totpCounter = verifyTotpCodeWithCounter(secret, dto.code);
    if (!passwordValid || totpCounter === undefined)
      throw new UnauthorizedException('Invalid credentials');
    await prisma.$transaction(async (tx) => {
      const disabled = await tx.userSecurity.updateMany({
        where: {
          userId: user.id,
          totpEnabled: true,
          totpSecretEncrypted: user.security!.totpSecretEncrypted,
          OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: totpCounter } }],
        },
        data: {
          totpEnabled: false,
          totpSecretEncrypted: null,
          totpPendingSecretEncrypted: null,
          recoveryCodesHash: [],
          lastTotpCounter: totpCounter,
        },
      });
      if (disabled.count !== 1) throw new UnauthorizedException('Invalid credentials');
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'TOTP_DISABLED',
          resourceType: 'UserSecurity',
          resourceId: user.security!.id,
        },
      });
    });
    return { enabled: false };
  }

  private async revokeTokenFamily(
    familyId: string,
    userId: string,
    replayedTokenId: string,
    fingerprint: RequestFingerprint,
  ): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const sessions = await tx.authSession.updateMany({
        where: { tokenFamilyId: familyId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'REFRESH_TOKEN_REUSE' },
      });
      await tx.authRefreshToken.updateMany({
        where: { familyId, status: { in: ['ACTIVE', 'ROTATED'] } },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await tx.authRefreshToken.updateMany({
        where: { id: replayedTokenId },
        data: { status: 'REUSED', revokedAt: now },
      });
      if (sessions.count > 0) {
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            action: 'REFRESH_TOKEN_REUSE_DETECTED',
            resourceType: 'AuthSession',
            resourceId: familyId,
            ipHash: fingerprint.ipHash,
            userAgentHash: fingerprint.userAgentHash,
            metadata: { tokenFamilyId: familyId, replayedTokenId, revokedSessions: sessions.count },
          },
        });
      }
    });
  }

  private async recordFailedLogin(userId: string, previousFailures: number): Promise<void> {
    const next = previousFailures + 1;
    await prisma.userSecurity.update({
      where: { userId },
      data: {
        failedLoginCount: { increment: 1 },
        lockedUntil:
          next >= LOGIN_MAXIMUM_FAILURES ? new Date(Date.now() + LOGIN_LOCK_MS) : undefined,
      },
    });
  }

  private async issueSession(
    user: { id: string; email: string; displayName: string; role: 'USER' | 'ADMIN' | 'OWNER' },
    fingerprint: RequestFingerprint,
  ): Promise<IssuedSession> {
    const config = authRuntimeConfig();
    const refreshToken = generateOpaqueToken('mpr');
    const expiresAt = new Date(Date.now() + config.refreshTokenDays * 86_400_000);
    const tokenFamilyId = randomUUID();
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({
        data: {
          userId: user.id,
          tokenFamilyId,
          refreshTokenHash,
          expiresAt,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
          refreshTokens: {
            create: {
              familyId: tokenFamilyId,
              tokenHash: refreshTokenHash,
              expiresAt,
            },
          },
        },
      });
      await tx.userSecurity.update({
        where: { userId: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'USER_LOGIN_SUCCEEDED',
          resourceType: 'AuthSession',
          resourceId: created.id,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
        },
      });
      return created;
    });
    return {
      accessToken: this.accessToken(user, session.id),
      refreshToken,
      accessTokenExpiresIn: config.accessTokenSeconds,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    };
  }

  private accessToken(
    user: { id: string; email: string; role: 'USER' | 'ADMIN' | 'OWNER' },
    sessionId: string,
  ): string {
    const config = authRuntimeConfig();
    return signAccessToken(
      {
        sub: user.id,
        sid: sessionId,
        email: user.email,
        role: user.role,
        iss: config.issuer,
        aud: config.audience,
      },
      config.jwtSecret,
      config.accessTokenSeconds,
    );
  }
}
