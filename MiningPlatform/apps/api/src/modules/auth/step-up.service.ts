/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { prisma, type Prisma, type StepUpScope } from '@mining/database';
import {
  decryptSecret,
  generateOpaqueToken,
  hashOpaqueToken,
  verifyPassword,
  verifyTotpCodeWithCounter,
} from '@mining/security';
import type { AuthPrincipal } from './auth.decorators.js';
import { authRuntimeConfig } from './auth-config.js';

const STEP_UP_TTL_SECONDS = 300;

class StepUpFactorReplayError extends Error {}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [result] = await tx.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  if (!result) throw new Error('Database did not return its current time');
  return result.now;
}

@Injectable()
export class StepUpService {
  async issue(
    principal: AuthPrincipal,
    input: { scope: StepUpScope; password: string; code: string },
  ) {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('Step-up authorization requires an interactive user session');
    }
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      include: { security: true },
    });
    if (!user?.security?.totpEnabled || !user.security.totpSecretEncrypted) {
      throw new ForbiddenException('TOTP must be enabled before sensitive payout changes');
    }

    const [passwordValid, totpCounter] = await Promise.all([
      verifyPassword(input.password, user.passwordHash),
      Promise.resolve(
        verifyTotpCodeWithCounter(
          decryptSecret(user.security.totpSecretEncrypted, authRuntimeConfig().encryptionKey),
          input.code,
        ),
      ),
    ]);
    if (!passwordValid || totpCounter === undefined) {
      await prisma.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'STEP_UP_AUTHORIZATION_FAILED',
          resourceType: 'StepUpAuthorization',
          resourceId: principal.sessionId,
          metadata: { scope: input.scope },
        },
      });
      throw new UnauthorizedException('Invalid step-up credentials');
    }

    const token = generateOpaqueToken('mpsu', 32);
    let authorization;
    try {
      authorization = await prisma.$transaction(async (tx) => {
        const now = await databaseNow(tx);
        const expiresAt = new Date(now.getTime() + STEP_UP_TTL_SECONDS * 1_000);
        const factorUse = await tx.userSecurity.updateMany({
          where: {
            userId: principal.userId,
            OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: totpCounter } }],
          },
          data: { lastTotpCounter: totpCounter },
        });
        if (factorUse.count !== 1) throw new StepUpFactorReplayError();
        await tx.stepUpAuthorization.updateMany({
          where: {
            userId: principal.userId,
            sessionId: principal.sessionId,
            scope: input.scope,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        const created = await tx.stepUpAuthorization.create({
          data: {
            userId: principal.userId,
            sessionId: principal.sessionId,
            scope: input.scope,
            tokenHash: hashOpaqueToken(token),
            expiresAt,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: principal.userId,
            action: 'STEP_UP_AUTHORIZATION_ISSUED',
            resourceType: 'StepUpAuthorization',
            resourceId: created.id,
            metadata: {
              scope: input.scope,
              sessionId: principal.sessionId,
              expiresAt: expiresAt.toISOString(),
            },
          },
        });
        return created;
      });
    } catch (error) {
      if (!(error instanceof StepUpFactorReplayError)) throw error;
      await prisma.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: 'STEP_UP_AUTHORIZATION_FAILED',
          resourceType: 'StepUpAuthorization',
          resourceId: principal.sessionId,
          metadata: { scope: input.scope, reason: 'TOTP_REPLAY' },
        },
      });
      throw new UnauthorizedException('TOTP code was already used for authentication');
    }
    return {
      token,
      authorizationId: authorization.id,
      scope: authorization.scope,
      expiresAt: authorization.expiresAt,
      singleUse: true,
    };
  }

  async consume(
    tx: Prisma.TransactionClient,
    principal: AuthPrincipal,
    scope: StepUpScope,
    token: string | undefined,
  ): Promise<{ id: string }> {
    if (principal.authenticationType !== 'access-token' || !token) {
      throw new UnauthorizedException('A single-use step-up token is required');
    }
    const now = await databaseNow(tx);
    const authorization = await tx.stepUpAuthorization.findFirst({
      where: {
        userId: principal.userId,
        sessionId: principal.sessionId,
        scope,
        tokenHash: hashOpaqueToken(token),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (!authorization)
      throw new UnauthorizedException('Invalid, expired, or consumed step-up token');

    const consumed = await tx.stepUpAuthorization.updateMany({
      where: { id: authorization.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Invalid, expired, or consumed step-up token');
    }
    return authorization;
  }
}
