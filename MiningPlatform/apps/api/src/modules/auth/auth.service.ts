/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';
import {
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  findBackupCodeIndex,
  generateAccountToken,
  generateBackupCodes,
  generateTotpSecret,
  hashAccountToken,
  hashBackupCode,
  hashPassword,
  parseDeviceMetadata,
  randomToken,
  safeEqual,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
  verifyTotp,
} from '@mining/security';
import type { AuthPrincipal, RequestSecurityContext } from '../../common/auth/auth.types';
import type {
  ChangePasswordDto,
  DisableTotpDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TotpCodeDto,
} from './dto/auth.dto';
import { AuditService } from '../audit/audit.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthorizationService } from './authorization.service';
import { identityConfig } from './identity-config';
import { IdentityDeliveryService } from './identity-delivery.service';

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  status: string;
  accountType: string;
  emailVerifiedAt: Date | null;
  locale: string;
  timezone: string;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    accountType: user.accountType,
    emailVerified: Boolean(user.emailVerifiedAt),
    locale: user.locale,
    timezone: user.timezone,
  };
}

@Injectable()
export class AuthService {
  private readonly config = identityConfig();
  private readonly dummyHash = hashPassword('MiningPlatformDummyPassword123');

  constructor(
    private readonly audit: AuditService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly authorization: AuthorizationService,
    private readonly delivery: IdentityDeliveryService,
  ) {}

  async register(input: RegisterDto, context: RequestSecurityContext) {
    const email = normalizeEmail(input.email);
    await this.rateLimit.assertRegistration(context);
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('Email is already registered');
    const passwordHash = await hashPassword(input.password);
    await this.authorization.ensureSystemDefinitions();
    const usernameBase = email.split('@')[0]!.replace(/[^a-z0-9]/g, '').slice(0, 20) || 'miner';
    const username = `${usernameBase}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: input.displayName.trim(),
          accountType: input.accountType ?? 'INDIVIDUAL',
          status: 'PENDING_VERIFICATION',
        },
      });
      await tx.userSecurity.create({ data: { userId: created.id } });
      const asset = await tx.asset.upsert({
        where: { symbol: 'BTC' },
        create: {
          symbol: 'BTC',
          name: 'Bitcoin',
          algorithm: 'SHA256',
          decimals: 8,
          enabled: true,
          minimumPayout: '0.00010000',
          requiredConfirmations: 3,
        },
        update: {},
      });
      await tx.miningAccount.create({
        data: {
          userId: created.id,
          assetId: asset.id,
          username,
          platformFeePercent: '2.0000',
          rewardMethod: 'FOLLOW_UPSTREAM',
        },
      });
      const role = await tx.role.findUniqueOrThrow({ where: { key: 'USER' } });
      await tx.userRoleAssignment.create({ data: { userId: created.id, roleId: role.id } });
      return created;
    });

    const token = await this.createAccountToken(user.id, 'EMAIL_VERIFICATION', this.config.emailTokenTtlSeconds);
    const delivery = await this.delivery.deliver('VERIFY_EMAIL', user.email, token);
    await this.audit.record({
      actorUserId: user.id,
      category: 'AUTH',
      action: 'account.registered',
      resourceType: 'User',
      resourceId: user.id,
      requestId: context.requestId,
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
      metadata: { deliveryAdapter: delivery.adapter },
    });
    return {
      user: publicUser(user),
      verificationRequired: true,
      delivery,
      developmentToken: this.config.exposeDevelopmentTokens ? token : undefined,
    };
  }

  async login(input: LoginDto, context: RequestSecurityContext) {
    const email = normalizeEmail(input.email);
    await this.rateLimit.assertLogin(email, context);
    const user = await prisma.user.findUnique({ where: { email }, include: { security: true } });
    const validPassword = await verifyPassword(input.password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !validPassword) {
      if (user) await this.recordLoginFailure(user.id, user.security?.failedLoginCount ?? 0, context, 'INVALID_CREDENTIALS');
      else await this.audit.recordSafely({ category: 'AUTH', outcome: 'FAILURE', action: 'login.failed', resourceType: 'User', ipHash: context.ipHash, userAgentHash: context.userAgentHash, metadata: { reason: 'INVALID_CREDENTIALS' } });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.deletedAt || user.status === 'CLOSED' || user.status === 'SUSPENDED') {
      await this.audit.recordSafely({ actorUserId: user.id, category: 'AUTH', outcome: 'FAILURE', action: 'login.failed', resourceType: 'User', resourceId: user.id, ipHash: context.ipHash, userAgentHash: context.userAgentHash, metadata: { reason: 'ACCOUNT_UNAVAILABLE' } });
      throw new UnauthorizedException('Account is unavailable');
    }
    if (user.security?.lockedUntil && user.security.lockedUntil > new Date()) throw new UnauthorizedException('Account is temporarily locked');
    if (!user.emailVerifiedAt || user.status === 'PENDING_VERIFICATION') {
      throw new UnauthorizedException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Email verification is required' });
    }
    if (user.security?.totpEnabled) {
      if (!input.totpCode) throw new UnauthorizedException({ code: 'TWO_FACTOR_REQUIRED', message: 'Two-factor authentication code is required' });
      const verified = await this.verifySecondFactor(user.id, input.totpCode);
      if (!verified) {
        await this.recordLoginFailure(user.id, user.security.failedLoginCount, context, 'INVALID_SECOND_FACTOR');
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    await prisma.userSecurity.update({ where: { userId: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    const authorization = await this.authorization.getAuthorization(user.id);
    const session = await this.issueSession(user, authorization.roles, context);
    await this.audit.record({
      actorUserId: user.id,
      category: 'AUTH',
      action: 'login.succeeded',
      resourceType: 'UserSession',
      resourceId: session.session.id,
      sessionId: session.session.id,
      requestId: context.requestId,
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
      metadata: { deviceName: session.session.deviceName },
    });
    return { user: publicUser(user), roles: authorization.roles, permissions: authorization.permissions, ...session };
  }

  async refresh(refreshToken: string, context: RequestSecurityContext) {
    const sessionId = refreshToken.split('.')[0];
    if (!sessionId) throw new UnauthorizedException('Invalid refresh token');
    const session = await prisma.userSession.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date()) throw new UnauthorizedException('Refresh session expired');
    const actualHash = hashAccountToken(refreshToken);
    if (!safeEqual(actualHash, session.refreshTokenHash)) {
      await prisma.userSession.update({ where: { id: session.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'REFRESH_TOKEN_REUSE' } });
      await this.audit.recordSafely({ actorUserId: session.userId, category: 'SECURITY', outcome: 'FAILURE', action: 'session.refresh-reuse', resourceType: 'UserSession', resourceId: session.id, sessionId: session.id, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt) throw new UnauthorizedException('Account is unavailable');
    const nextRefreshToken = this.refreshTokenValue(session.id, session.tokenFamilyId);
    const authorization = await this.authorization.getAuthorization(session.userId);
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashAccountToken(nextRefreshToken),
        lastActiveAt: new Date(),
        ipHash: context.ipHash ?? session.ipHash,
        userAgentHash: context.userAgentHash ?? session.userAgentHash,
      },
    });
    return {
      accessToken: this.accessToken(session.userId, session.id, authorization.roles),
      refreshToken: nextRefreshToken,
      accessExpiresInSeconds: this.config.accessTtlSeconds,
      refreshExpiresAt: session.expiresAt.toISOString(),
    };
  }

  async authenticateAccessToken(token: string): Promise<AuthPrincipal> {
    let payload;
    try {
      payload = verifyAccessToken(token, {
        secret: this.config.jwtSecret,
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Invalid access token');
    }
    const session = await prisma.userSession.findUnique({ where: { id: payload.sid }, include: { user: true } });
    if (!session || session.userId !== payload.sub || session.status !== 'ACTIVE') throw new UnauthorizedException('Session is unavailable');
    const now = new Date();
    if (session.expiresAt <= now) {
      await prisma.userSession.updateMany({ where: { id: session.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', revokedAt: now, revokeReason: 'SESSION_EXPIRED' } });
      throw new UnauthorizedException('Session is unavailable');
    }
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt) throw new UnauthorizedException('Account is unavailable');
    if (now.getTime() - session.lastActiveAt.getTime() >= 120_000) {
      await prisma.userSession.update({ where: { id: session.id }, data: { lastActiveAt: now } });
    }
    return { userId: payload.sub, sessionId: payload.sid, roles: payload.roles ?? [] };
  }

  async logout(principal: AuthPrincipal, context: RequestSecurityContext): Promise<void> {
    await prisma.userSession.updateMany({
      where: { id: principal.sessionId, userId: principal.userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'USER_LOGOUT' },
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'AUTH', action: 'logout', resourceType: 'UserSession', resourceId: principal.sessionId, sessionId: principal.sessionId, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
  }

  async verifyEmail(token: string, context: RequestSecurityContext) {
    await this.rateLimit.assertTokenAction(context, 'email-verify');
    const tokenHash = hashAccountToken(token);
    const accountToken = await prisma.accountToken.findUnique({ where: { tokenHash } });
    if (!accountToken || accountToken.type !== 'EMAIL_VERIFICATION' || accountToken.consumedAt || accountToken.expiresAt <= new Date()) {
      throw new BadRequestException('Verification token is invalid or expired');
    }
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.accountToken.update({ where: { id: accountToken.id }, data: { consumedAt: new Date() } });
      return tx.user.update({ where: { id: accountToken.userId }, data: { emailVerifiedAt: new Date(), status: 'ACTIVE' } });
    });
    await this.audit.record({ actorUserId: user.id, category: 'ACCOUNT', action: 'email.verified', resourceType: 'User', resourceId: user.id, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
    return { user: publicUser(user) };
  }

  async resendVerification(emailRaw: string, context: RequestSecurityContext) {
    const email = normalizeEmail(emailRaw);
    await this.rateLimit.assertAccountDelivery(email, context);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return { accepted: true };
    const token = await this.createAccountToken(user.id, 'EMAIL_VERIFICATION', this.config.emailTokenTtlSeconds);
    const delivery = await this.delivery.deliver('VERIFY_EMAIL', user.email, token);
    return { accepted: true, delivery, developmentToken: this.config.exposeDevelopmentTokens ? token : undefined };
  }

  async forgotPassword(emailRaw: string, context: RequestSecurityContext) {
    const email = normalizeEmail(emailRaw);
    await this.rateLimit.assertAccountDelivery(email, context);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return { accepted: true };
    const token = await this.createAccountToken(user.id, 'PASSWORD_RESET', this.config.resetTokenTtlSeconds);
    const delivery = await this.delivery.deliver('RESET_PASSWORD', user.email, token);
    return { accepted: true, delivery, developmentToken: this.config.exposeDevelopmentTokens ? token : undefined };
  }

  async resetPassword(input: ResetPasswordDto, context: RequestSecurityContext) {
    await this.rateLimit.assertTokenAction(context, 'password-reset');
    const tokenHash = hashAccountToken(input.token);
    const accountToken = await prisma.accountToken.findUnique({ where: { tokenHash } });
    if (!accountToken || accountToken.type !== 'PASSWORD_RESET' || accountToken.consumedAt || accountToken.expiresAt <= new Date()) {
      throw new BadRequestException('Password reset token is invalid or expired');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.accountToken.update({ where: { id: accountToken.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: accountToken.userId }, data: { passwordHash } });
      await tx.userSecurity.update({ where: { userId: accountToken.userId }, data: { passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
      await tx.userSession.updateMany({ where: { userId: accountToken.userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'PASSWORD_RESET' } });
    });
    await this.audit.record({ actorUserId: accountToken.userId, category: 'SECURITY', action: 'password.reset', resourceType: 'User', resourceId: accountToken.userId, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
    return { changed: true, sessionsRevoked: true };
  }

  async changePassword(principal: AuthPrincipal, input: ChangePasswordDto, context: RequestSecurityContext) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw new UnauthorizedException('Current password is invalid');
    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.userSecurity.update({ where: { userId: user.id }, data: { passwordChangedAt: new Date() } });
      await tx.userSession.updateMany({ where: { userId: user.id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGED' } });
    });
    await this.audit.record({ actorUserId: user.id, category: 'SECURITY', action: 'password.changed', resourceType: 'User', resourceId: user.id, sessionId: principal.sessionId, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
    return { changed: true, sessionsRevoked: true };
  }

  async setupTotp(principal: AuthPrincipal) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    const secret = generateTotpSecret();
    await prisma.totpEnrollment.deleteMany({ where: { userId: user.id } });
    await prisma.totpEnrollment.create({
      data: {
        userId: user.id,
        encryptedSecret: encryptSecret(secret, this.config.encryptionKey),
        expiresAt: new Date(Date.now() + this.config.totpEnrollmentTtlSeconds * 1000),
      },
    });
    return { secret, uri: buildTotpUri(user.email, 'MiningPlatform', secret), expiresInSeconds: this.config.totpEnrollmentTtlSeconds };
  }

  async enableTotp(principal: AuthPrincipal, input: TotpCodeDto, context: RequestSecurityContext) {
    await this.rateLimit.assertTwoFactor(context, principal.userId);
    const enrollment = await prisma.totpEnrollment.findFirst({ where: { userId: principal.userId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!enrollment) throw new BadRequestException('TOTP enrollment is unavailable or expired');
    const secret = decryptSecret(enrollment.encryptedSecret, this.config.encryptionKey);
    if (!verifyTotp(input.code, secret)) throw new BadRequestException('Invalid TOTP code');
    const backupCodes = generateBackupCodes();
    const hashes = backupCodes.map((code) => hashBackupCode(code, this.config.backupCodePepper));
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userSecurity.update({ where: { userId: principal.userId }, data: { totpEnabled: true, totpSecretEncrypted: enrollment.encryptedSecret, recoveryCodesHash: hashes } });
      await tx.totpEnrollment.deleteMany({ where: { userId: principal.userId } });
    });
    await this.audit.record({ actorUserId: principal.userId, category: 'SECURITY', action: 'two-factor.enabled', resourceType: 'UserSecurity', resourceId: principal.userId, sessionId: principal.sessionId, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
    return { enabled: true, backupCodes };
  }

  async disableTotp(principal: AuthPrincipal, input: DisableTotpDto, context: RequestSecurityContext) {
    await this.rateLimit.assertTwoFactor(context, principal.userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.userId }, include: { security: true } });
    if (!(await verifyPassword(input.password, user.passwordHash))) throw new UnauthorizedException('Password is invalid');
    if (!user.security?.totpEnabled || !(await this.verifySecondFactor(user.id, input.code))) throw new UnauthorizedException('Two-factor code is invalid');
    await prisma.userSecurity.update({ where: { userId: user.id }, data: { totpEnabled: false, totpSecretEncrypted: null, recoveryCodesHash: [] } });
    await this.audit.record({ actorUserId: user.id, category: 'SECURITY', action: 'two-factor.disabled', resourceType: 'UserSecurity', resourceId: user.id, sessionId: principal.sessionId, ipHash: context.ipHash, userAgentHash: context.userAgentHash });
    return { enabled: false };
  }

  async listSessions(principal: AuthPrincipal) {
    const sessions = await prisma.userSession.findMany({ where: { userId: principal.userId }, orderBy: { lastActiveAt: 'desc' }, take: 100 });
    return sessions.map((session: { id: string; status: string; deviceName: string | null; deviceType: string | null; browser: string | null; operatingSystem: string | null; countryCode: string | null; city: string | null; createdAt: Date; lastActiveAt: Date; expiresAt: Date; revokedAt: Date | null }) => ({
      id: session.id,
      current: session.id === principal.sessionId,
      status: session.status,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      browser: session.browser,
      operatingSystem: session.operatingSystem,
      countryCode: session.countryCode,
      city: session.city,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    }));
  }

  async revokeSession(principal: AuthPrincipal, sessionId: string, reason = 'USER_REVOKED') {
    const result = await prisma.userSession.updateMany({ where: { id: sessionId, userId: principal.userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason } });
    if (result.count === 0) throw new NotFoundException('Session not found');
    await this.audit.record({ actorUserId: principal.userId, category: 'SECURITY', action: 'session.revoked', resourceType: 'UserSession', resourceId: sessionId, sessionId: principal.sessionId });
    return { revoked: true, currentSession: sessionId === principal.sessionId };
  }

  async revokeAllSessions(principal: AuthPrincipal) {
    const result = await prisma.userSession.updateMany({ where: { userId: principal.userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'USER_REVOKED_ALL' } });
    await this.audit.record({ actorUserId: principal.userId, category: 'SECURITY', action: 'sessions.revoked-all', resourceType: 'UserSession', sessionId: principal.sessionId, metadata: { count: result.count } });
    return { revoked: result.count };
  }

  private async recordLoginFailure(userId: string, currentFailures: number, context: RequestSecurityContext, reason: string) {
    const nextFailures = currentFailures + 1;
    const lockedUntil = nextFailures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await prisma.userSecurity.update({ where: { userId }, data: { failedLoginCount: nextFailures, lockedUntil } });
    await this.audit.recordSafely({ actorUserId: userId, category: 'AUTH', outcome: 'FAILURE', action: 'login.failed', resourceType: 'User', resourceId: userId, ipHash: context.ipHash, userAgentHash: context.userAgentHash, metadata: { reason, failedAttempts: nextFailures, lockedUntil: lockedUntil?.toISOString() } });
  }

  private async createAccountToken(userId: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', ttlSeconds: number): Promise<string> {
    const generated = generateAccountToken();
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.accountToken.deleteMany({ where: { userId, type, consumedAt: null } });
      await tx.accountToken.create({ data: { userId, type, tokenHash: generated.tokenHash, expiresAt: new Date(Date.now() + ttlSeconds * 1000) } });
    });
    return generated.token;
  }

  private async issueSession(user: { id: string }, roles: readonly string[], context: RequestSecurityContext): Promise<SessionTokens & { session: { id: string; deviceName: string; lastActiveAt: string } }> {
    const sessionId = `sess_${randomToken(18)}`;
    const tokenFamilyId = `fam_${randomToken(18)}`;
    const refreshToken = this.refreshTokenValue(sessionId, tokenFamilyId);
    const expiresAt = new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
    const device = parseDeviceMetadata(context.userAgent);
    const session = await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenFamilyId,
        refreshTokenHash: hashAccountToken(refreshToken),
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        browser: device.browser,
        operatingSystem: device.operatingSystem,
        ipHash: context.ipHash,
        countryCode: context.countryCode,
        city: context.city,
        userAgentHash: context.userAgentHash,
        expiresAt,
      },
    });
    return {
      accessToken: this.accessToken(user.id, session.id, roles),
      refreshToken,
      accessExpiresInSeconds: this.config.accessTtlSeconds,
      refreshExpiresAt: expiresAt.toISOString(),
      session: { id: session.id, deviceName: session.deviceName ?? device.deviceName, lastActiveAt: session.lastActiveAt.toISOString() },
    };
  }

  private accessToken(userId: string, sessionId: string, roles: readonly string[]): string {
    return signAccessToken(
      { sub: userId, sid: sessionId, jti: randomToken(16), type: 'access', roles },
      { secret: this.config.jwtSecret, issuer: this.config.issuer, audience: this.config.audience, expiresInSeconds: this.config.accessTtlSeconds },
    );
  }

  private refreshTokenValue(sessionId: string, tokenFamilyId: string): string {
    return `${sessionId}.${tokenFamilyId}.${randomToken(48)}`;
  }

  private async verifySecondFactor(userId: string, code: string): Promise<boolean> {
    const security = await prisma.userSecurity.findUnique({ where: { userId } });
    if (!security?.totpEnabled || !security.totpSecretEncrypted) return false;
    const secret = decryptSecret(security.totpSecretEncrypted, this.config.encryptionKey);
    if (verifyTotp(code, secret)) return true;
    const index = findBackupCodeIndex(code, security.recoveryCodesHash, this.config.backupCodePepper);
    if (index < 0) return false;
    const nextCodes = security.recoveryCodesHash.filter((_hash: string, candidateIndex: number) => candidateIndex !== index);
    await prisma.userSecurity.update({ where: { userId }, data: { recoveryCodesHash: nextCodes } });
    return true;
  }
}
