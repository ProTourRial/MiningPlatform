/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { hmacSensitiveValue, verifyWorkerCredentialSecret } from '@mining/security';
import { randomUUID } from 'node:crypto';
import type { StratumServerConfig } from './config.js';
import { RedisWorkerAuthRateLimiter, type WorkerAuthRateLimiter } from './auth-rate-limiter.js';
import type {
  WorkerAuthenticationContext,
  WorkerAuthenticationFailureCode,
  WorkerAuthenticationResult,
  WorkerAuthenticator,
} from './worker-authenticator.js';

export interface WorkerCredentialCandidate {
  workerId: string;
  workerName: string;
  userId: string;
  miningAccountId: string;
  workerStatus: string;
  userStatus: string;
  accountEnabled: boolean;
  credentialId: string;
  credentialStatus: string;
  secretHash: string;
  failedAttempts: number;
  lockedUntil?: Date;
  expiresAt?: Date;
}

export interface WorkerCredentialStore {
  findCandidates(
    accountUsername: string,
    workerName: string,
  ): Promise<readonly WorkerCredentialCandidate[]>;
  recordSuccess(
    candidate: WorkerCredentialCandidate,
    context: WorkerAuthenticationContext,
    referralCode: string | undefined,
    workerNameHash: string,
  ): Promise<
    | { accepted: true }
    | { accepted: false; code: 'INVALID_REFERRAL_CODE' | 'SELF_REFERRAL' | 'REFERRAL_CONFLICT' }
  >;
  recordFailure(input: {
    candidate?: WorkerCredentialCandidate;
    context: WorkerAuthenticationContext;
    workerNameHash: string;
    reason: WorkerAuthenticationFailureCode;
    maximumFailures: number;
    lockMs: number;
  }): Promise<void>;
}

interface PrismaWorkerCredentialClient {
  worker: {
    findFirst(input: unknown): Promise<unknown>;
    update(input: unknown): Promise<unknown>;
  };
  workerCredential: {
    update(input: unknown): Promise<unknown>;
  };
  auditLog: {
    create(input: unknown): Promise<unknown>;
  };
  referralCode: {
    findUnique(input: unknown): Promise<unknown>;
  };
  referralAttribution: {
    findUnique(input: unknown): Promise<unknown>;
    createMany(input: unknown): Promise<unknown>;
  };
  $transaction<T>(callback: (tx: PrismaWorkerCredentialClient) => Promise<T>): Promise<T>;
}

interface WorkerRecord {
  id: string;
  name: string;
  userId: string;
  miningAccountId: string;
  status: string;
  user: { status: string };
  miningAccount: { enabled: boolean };
  credentials: Array<{
    credentialId: string;
    status: string;
    secretHash: string;
    failedAttempts: number;
    lockedUntil: Date | null;
    expiresAt: Date | null;
  }>;
}

export class PrismaWorkerCredentialStore implements WorkerCredentialStore {
  constructor(private readonly client: PrismaWorkerCredentialClient) {}

  static async create(): Promise<PrismaWorkerCredentialStore> {
    const { prisma } = await import('@mining/database');
    return new PrismaWorkerCredentialStore(prisma as unknown as PrismaWorkerCredentialClient);
  }

  async findCandidates(
    accountUsername: string,
    workerName: string,
  ): Promise<readonly WorkerCredentialCandidate[]> {
    const record = (await this.client.worker.findFirst({
      where: {
        name: workerName,
        deletedAt: null,
        miningAccount: {
          username: accountUsername,
          deletedAt: null,
        },
        user: {
          deletedAt: null,
        },
      },
      include: {
        user: { select: { status: true } },
        miningAccount: { select: { enabled: true } },
        credentials: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })) as WorkerRecord | null;

    if (!record) return [];
    return record.credentials.map((credential) => ({
      workerId: record.id,
      workerName: `${accountUsername}.${record.name}`,
      userId: record.userId,
      miningAccountId: record.miningAccountId,
      workerStatus: record.status,
      userStatus: record.user.status,
      accountEnabled: record.miningAccount.enabled,
      credentialId: credential.credentialId,
      credentialStatus: credential.status,
      secretHash: credential.secretHash,
      failedAttempts: credential.failedAttempts,
      lockedUntil: credential.lockedUntil ?? undefined,
      expiresAt: credential.expiresAt ?? undefined,
    }));
  }

  async recordSuccess(
    candidate: WorkerCredentialCandidate,
    context: WorkerAuthenticationContext,
    referralCode: string | undefined,
    workerNameHash: string,
  ): Promise<
    | { accepted: true }
    | {
        accepted: false;
        code: 'INVALID_REFERRAL_CODE' | 'SELF_REFERRAL' | 'REFERRAL_CONFLICT';
      }
  > {
    return this.client.$transaction(async (tx) => {
      if (referralCode) {
        const now = new Date();
        const code = (await tx.referralCode.findUnique({
          where: { code: referralCode },
          include: { program: true },
        })) as {
          id: string;
          ownerUserId: string | null;
          active: boolean;
          program: {
            status: string;
            effectiveFrom: Date;
            effectiveUntil: Date | null;
          };
        } | null;
        const invalid =
          !code ||
          !code.active ||
          code.program.status !== 'ACTIVE' ||
          code.program.effectiveFrom > now ||
          (code.program.effectiveUntil !== null && code.program.effectiveUntil <= now);
        const existing = (await tx.referralAttribution.findUnique({
          where: { miningAccountId: candidate.miningAccountId },
          select: { referralCodeId: true },
        })) as { referralCodeId: string } | null;
        const rejection = invalid
          ? 'INVALID_REFERRAL_CODE'
          : code?.ownerUserId === candidate.userId
          ? 'SELF_REFERRAL'
          : existing && existing.referralCodeId !== code?.id
          ? 'REFERRAL_CONFLICT'
          : null;
        if (rejection) {
          await tx.auditLog.create({
            data: {
              actorUserId: candidate.userId,
              action: 'WORKER_REFERRAL_REJECTED',
              resourceType: 'Worker',
              resourceId: candidate.workerId,
              ipHash: context.remoteIpHash,
              userAgentHash: context.userAgentHash,
              metadata: { sessionId: context.sessionId, referralCode, reason: rejection },
            },
          });
          return { accepted: false as const, code: rejection };
        }
        if (!existing) {
          await tx.referralAttribution.createMany({
            data: {
              id: randomUUID(),
              miningAccountId: candidate.miningAccountId,
              referralCodeId: code!.id,
              sourceWorkerId: candidate.workerId,
              sourceWorkerNameHash: workerNameHash,
            },
            skipDuplicates: true,
          });
          const persisted = (await tx.referralAttribution.findUnique({
            where: { miningAccountId: candidate.miningAccountId },
            select: { referralCodeId: true },
          })) as { referralCodeId: string };
          if (persisted.referralCodeId !== code!.id) {
            await tx.auditLog.create({
              data: {
                actorUserId: candidate.userId,
                action: 'WORKER_REFERRAL_REJECTED',
                resourceType: 'Worker',
                resourceId: candidate.workerId,
                ipHash: context.remoteIpHash,
                userAgentHash: context.userAgentHash,
                metadata: {
                  sessionId: context.sessionId,
                  referralCode,
                  reason: 'REFERRAL_CONFLICT',
                },
              },
            });
            return { accepted: false as const, code: 'REFERRAL_CONFLICT' as const };
          }
        }
      }
      await tx.workerCredential.update({
        where: { credentialId: candidate.credentialId },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
          lastUsedAt: new Date(),
          lastIpHash: context.remoteIpHash,
        },
      });
      await tx.worker.update({
        where: { id: candidate.workerId },
        data: {
          lastConnectedAt: new Date(),
          lastIpHash: context.remoteIpHash,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: candidate.userId,
          action: 'WORKER_AUTHENTICATION_SUCCEEDED',
          resourceType: 'Worker',
          resourceId: candidate.workerId,
          ipHash: context.remoteIpHash,
          userAgentHash: context.userAgentHash,
          metadata: {
            sessionId: context.sessionId,
            credentialId: candidate.credentialId,
            referralCode: referralCode ?? null,
          },
        },
      });
      return { accepted: true as const };
    });
  }

  async recordFailure(input: {
    candidate?: WorkerCredentialCandidate;
    context: WorkerAuthenticationContext;
    workerNameHash: string;
    reason: WorkerAuthenticationFailureCode;
    maximumFailures: number;
    lockMs: number;
  }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      if (input.candidate) {
        const failedAttempts = input.candidate.failedAttempts + 1;
        await tx.workerCredential.update({
          where: { credentialId: input.candidate.credentialId },
          data: {
            failedAttempts: { increment: 1 },
            lockedUntil:
              failedAttempts >= input.maximumFailures
                ? new Date(Date.now() + input.lockMs)
                : input.candidate.lockedUntil,
            lastIpHash: input.context.remoteIpHash,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: input.candidate?.userId,
          action: 'WORKER_AUTHENTICATION_FAILED',
          resourceType: 'Worker',
          resourceId: input.candidate?.workerId,
          ipHash: input.context.remoteIpHash,
          userAgentHash: input.context.userAgentHash,
          metadata: {
            sessionId: input.context.sessionId,
            credentialId: input.candidate?.credentialId,
            workerNameHash: input.workerNameHash,
            reason: input.reason,
          },
        },
      });
    });
  }
}

export function parseWorkerIdentity(
  value: string,
): { accountUsername: string; workerName: string; referralCode?: string } | null {
  const hashSeparator = value.indexOf('#');
  if (hashSeparator !== -1 && hashSeparator !== value.lastIndexOf('#')) return null;
  const referralCode =
    hashSeparator === -1
      ? undefined
      : value
          .slice(hashSeparator + 1)
          .trim()
          .toUpperCase();
  if (referralCode !== undefined && !/^[A-Z0-9]{3,24}$/.test(referralCode)) return null;
  const identity = (hashSeparator === -1 ? value : value.slice(0, hashSeparator)).trim();
  const separator = identity.indexOf('.');
  if (separator <= 0 || separator === identity.length - 1) return null;
  const accountUsername = identity.slice(0, separator).trim();
  const workerName = identity.slice(separator + 1).trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(accountUsername)) return null;
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(workerName)) return null;
  return { accountUsername, workerName, ...(referralCode ? { referralCode } : {}) };
}

export class ProductionWorkerAuthenticator implements WorkerAuthenticator {
  constructor(
    private readonly config: StratumServerConfig,
    private readonly store: WorkerCredentialStore,
    private readonly limiter: WorkerAuthRateLimiter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static async create(config: StratumServerConfig): Promise<ProductionWorkerAuthenticator> {
    const [store, limiter] = await Promise.all([
      PrismaWorkerCredentialStore.create(),
      RedisWorkerAuthRateLimiter.connect({
        redisUrl: config.redisUrl,
        maximumFailures: config.workerAuthMaximumFailures,
        windowMs: config.workerAuthWindowMs,
        lockMs: config.workerAuthLockMs,
      }),
    ]);
    return new ProductionWorkerAuthenticator(config, store, limiter);
  }

  async authenticate(
    workerName: string,
    password: string,
    context: WorkerAuthenticationContext,
  ): Promise<WorkerAuthenticationResult> {
    const referralSeparator = workerName.indexOf('#');
    const rateLimitIdentity = (
      referralSeparator === -1 ? workerName : workerName.slice(0, referralSeparator)
    )
      .trim()
      .toLowerCase();
    const rateLimitKey = `${context.remoteIpHash}:${rateLimitIdentity}`;
    if (await this.limiter.isBlocked(rateLimitKey)) {
      await this.store.recordFailure({
        context,
        workerNameHash: hmacSensitiveValue(workerName.toLowerCase(), this.config.ipHashKey),
        reason: 'RATE_LIMITED',
        maximumFailures: this.config.workerAuthMaximumFailures,
        lockMs: this.config.workerAuthLockMs,
      });
      return { authenticated: false, code: 'RATE_LIMITED' };
    }

    const identity = parseWorkerIdentity(workerName);
    if (!identity) {
      await this.fail(rateLimitKey, undefined, workerName, context, 'INVALID_FORMAT');
      return { authenticated: false, code: 'INVALID_FORMAT' };
    }

    const candidates = await this.store.findCandidates(
      identity.accountUsername,
      identity.workerName,
    );
    let matching: WorkerCredentialCandidate | undefined;
    for (const candidate of candidates) {
      if (await verifyWorkerCredentialSecret(password, candidate.secretHash)) matching = candidate;
    }

    if (!matching) {
      await this.fail(rateLimitKey, candidates[0], workerName, context, 'INVALID_CREDENTIALS');
      return { authenticated: false, code: 'INVALID_CREDENTIALS' };
    }

    const now = this.now();
    if (
      ['DISABLED', 'PENDING'].includes(matching.workerStatus) ||
      matching.userStatus !== 'ACTIVE' ||
      !matching.accountEnabled
    ) {
      await this.fail(rateLimitKey, matching, workerName, context, 'ACCOUNT_DISABLED');
      return { authenticated: false, code: 'ACCOUNT_DISABLED' };
    }
    if (matching.credentialStatus === 'REVOKED') {
      await this.fail(rateLimitKey, matching, workerName, context, 'CREDENTIAL_REVOKED');
      return { authenticated: false, code: 'CREDENTIAL_REVOKED' };
    }
    if (matching.credentialStatus !== 'ACTIVE') {
      await this.fail(rateLimitKey, matching, workerName, context, 'CREDENTIAL_EXPIRED');
      return { authenticated: false, code: 'CREDENTIAL_EXPIRED' };
    }
    if (matching.expiresAt && matching.expiresAt <= now) {
      await this.fail(rateLimitKey, matching, workerName, context, 'CREDENTIAL_EXPIRED');
      return { authenticated: false, code: 'CREDENTIAL_EXPIRED' };
    }
    if (matching.lockedUntil && matching.lockedUntil > now) {
      await this.fail(rateLimitKey, matching, workerName, context, 'CREDENTIAL_LOCKED');
      return { authenticated: false, code: 'CREDENTIAL_LOCKED' };
    }

    const workerNameHash = hmacSensitiveValue(workerName.toLowerCase(), this.config.ipHashKey);
    const success = await this.store.recordSuccess(
      matching,
      context,
      identity.referralCode,
      workerNameHash,
    );
    if (!success.accepted) {
      await this.limiter.recordFailure(rateLimitKey);
      return { authenticated: false, code: success.code };
    }
    await this.limiter.recordSuccess(rateLimitKey);
    return {
      authenticated: true,
      worker: {
        workerId: matching.workerId,
        workerName: identity.referralCode
          ? `${matching.workerName}#${identity.referralCode}`
          : matching.workerName,
        userId: matching.userId,
        miningAccountId: matching.miningAccountId,
      },
    };
  }

  async close(): Promise<void> {
    await this.limiter.close?.();
  }

  private async fail(
    rateLimitKey: string,
    candidate: WorkerCredentialCandidate | undefined,
    workerName: string,
    context: WorkerAuthenticationContext,
    reason: WorkerAuthenticationFailureCode,
  ): Promise<void> {
    await this.limiter.recordFailure(rateLimitKey);
    await this.store.recordFailure({
      candidate,
      context,
      workerNameHash: hmacSensitiveValue(workerName.toLowerCase(), this.config.ipHashKey),
      reason,
      maximumFailures: this.config.workerAuthMaximumFailures,
      lockMs: this.config.workerAuthLockMs,
    });
  }
}
