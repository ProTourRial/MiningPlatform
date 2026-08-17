/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@mining/database';
import { MiningEvents } from '@mining/shared';
import type { AuthPrincipal } from '../auth/auth.decorators.js';
import type {
  OpenReconciliationExceptionDto,
  ResolveReconciliationExceptionDto,
  SubmitReconciliationExceptionDto,
  VersionedCommentDto,
} from './reconciliation.dto.js';
import {
  assertMakerCheckerExecutor,
  nextReconciliationStatus,
  ReconciliationWorkflowError,
  type ReconciliationWorkflowAction,
  type ReconciliationWorkflowStatus,
} from './reconciliation-workflow.js';

const exceptionInclude = {
  reconciliation: {
    select: {
      id: true,
      assetId: true,
      upstreamPoolId: true,
      rewardPeriodId: true,
      upstreamGrossReward: true,
      upstreamFee: true,
      receivedAmount: true,
      internalExpectedAmount: true,
      varianceAmount: true,
      status: true,
      sourceReference: true,
    },
  },
  actions: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ReconciliationExceptionInclude;

type Transaction = Prisma.TransactionClient;
type ExceptionResult = Prisma.ReconciliationExceptionGetPayload<{
  include: typeof exceptionInclude;
}>;
type OperationResult = { correlationId: string; replayed: boolean; exception: ExceptionResult };

const statuses = ['OPEN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RESOLVED'] as const;
const actionEventNames = {
  OPENED: MiningEvents.reconciliationExceptionOpened,
  SUBMITTED: MiningEvents.reconciliationExceptionSubmitted,
  APPROVED: MiningEvents.reconciliationExceptionApproved,
  REJECTED: MiningEvents.reconciliationExceptionRejected,
  RESOLVED: MiningEvents.reconciliationExceptionResolved,
} as const;

function requestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function requireHeader(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (
    !normalized ||
    normalized.length > 191 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(normalized)
  ) {
    throw new BadRequestException(`${name} must be 1-191 URL-safe characters`);
  }
  return normalized;
}

function normalizedCorrelationId(value: string | undefined): string {
  return value === undefined ? randomUUID() : requireHeader(value, 'X-Correlation-Id');
}

function isRetryableTransaction(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ReconciliationService {
  async list(principal: AuthPrincipal, status?: string) {
    await this.assertFinancialOperator(principal);
    if (status && !(statuses as readonly string[]).includes(status)) {
      throw new BadRequestException(`Unknown reconciliation exception status: ${status}`);
    }
    return prisma.reconciliationException.findMany({
      where: status ? { status: status as (typeof statuses)[number] } : undefined,
      include: exceptionInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(principal: AuthPrincipal, exceptionId: string) {
    await this.assertFinancialOperator(principal);
    return this.requireException(prisma, exceptionId);
  }

  async open(
    principal: AuthPrincipal,
    reconciliationId: string,
    dto: OpenReconciliationExceptionDto,
    suppliedIdempotencyKey?: string,
    suppliedCorrelationId?: string,
  ): Promise<OperationResult> {
    await this.assertFinancialOperator(principal);
    const idempotencyKey = requireHeader(suppliedIdempotencyKey, 'Idempotency-Key');
    const correlationId = normalizedCorrelationId(suppliedCorrelationId);
    return this.executeIdempotent(
      'open',
      reconciliationId,
      principal.userId,
      idempotencyKey,
      correlationId,
      dto,
      async (tx, durableKey) => {
        const reconciliation = await tx.upstreamReconciliation.findUnique({
          where: { id: reconciliationId },
        });
        if (!reconciliation) throw new NotFoundException('Upstream reconciliation not found');
        const existing = await tx.reconciliationException.findUnique({
          where: { reconciliationId },
        });
        if (existing)
          throw new ConflictException('This reconciliation already has an exception workflow');

        const exception = await tx.reconciliationException.create({
          data: {
            reconciliationId,
            category: dto.category,
            severity: dto.severity,
            summary: dto.summary.trim(),
            varianceAmount: reconciliation.varianceAmount,
            proposedResolution: dto.proposedResolution.trim(),
            openedByUserId: principal.userId,
          },
        });
        await tx.upstreamReconciliation.update({
          where: { id: reconciliationId },
          data: { status: 'EXCEPTION_OPEN' },
        });
        await tx.rewardPeriod.update({
          where: { id: reconciliation.rewardPeriodId },
          data: { reconciliationStatus: 'EXCEPTION_OPEN' },
        });
        await this.appendAction(tx, {
          exceptionId: exception.id,
          actorUserId: principal.userId,
          action: 'OPENED',
          fromStatus: null,
          toStatus: 'OPEN',
          comment: dto.summary.trim(),
          correlationId,
          durableKey,
          version: exception.version,
          metadata: { category: dto.category, severity: dto.severity },
        });
        return this.requireException(tx, exception.id);
      },
    );
  }

  submit(
    principal: AuthPrincipal,
    exceptionId: string,
    dto: SubmitReconciliationExceptionDto,
    suppliedIdempotencyKey?: string,
    suppliedCorrelationId?: string,
  ) {
    return this.transition(
      principal,
      exceptionId,
      'SUBMITTED',
      dto,
      suppliedIdempotencyKey,
      suppliedCorrelationId,
    );
  }

  approve(
    principal: AuthPrincipal,
    exceptionId: string,
    dto: VersionedCommentDto,
    suppliedIdempotencyKey?: string,
    suppliedCorrelationId?: string,
  ) {
    return this.transition(
      principal,
      exceptionId,
      'APPROVED',
      dto,
      suppliedIdempotencyKey,
      suppliedCorrelationId,
    );
  }

  reject(
    principal: AuthPrincipal,
    exceptionId: string,
    dto: VersionedCommentDto,
    suppliedIdempotencyKey?: string,
    suppliedCorrelationId?: string,
  ) {
    return this.transition(
      principal,
      exceptionId,
      'REJECTED',
      dto,
      suppliedIdempotencyKey,
      suppliedCorrelationId,
    );
  }

  resolve(
    principal: AuthPrincipal,
    exceptionId: string,
    dto: ResolveReconciliationExceptionDto,
    suppliedIdempotencyKey?: string,
    suppliedCorrelationId?: string,
  ) {
    return this.transition(
      principal,
      exceptionId,
      'RESOLVED',
      dto,
      suppliedIdempotencyKey,
      suppliedCorrelationId,
    );
  }

  private async transition(
    principal: AuthPrincipal,
    exceptionId: string,
    action: ReconciliationWorkflowAction,
    dto: VersionedCommentDto | SubmitReconciliationExceptionDto | ResolveReconciliationExceptionDto,
    suppliedIdempotencyKey?: string,
    suppliedCorrelationId?: string,
  ): Promise<OperationResult> {
    await this.assertFinancialOperator(principal);
    const idempotencyKey = requireHeader(suppliedIdempotencyKey, 'Idempotency-Key');
    const correlationId = normalizedCorrelationId(suppliedCorrelationId);
    return this.executeIdempotent(
      action.toLowerCase(),
      exceptionId,
      principal.userId,
      idempotencyKey,
      correlationId,
      dto,
      async (tx, durableKey) => {
        const current = await this.requireException(tx, exceptionId);
        if (current.version !== dto.expectedVersion) {
          throw new ConflictException(
            `Version conflict: expected ${dto.expectedVersion}, current ${current.version}`,
          );
        }
        let nextStatus: ReconciliationWorkflowStatus;
        try {
          nextStatus = nextReconciliationStatus(current.status, action);
          assertMakerCheckerExecutor({
            action,
            actorUserId: principal.userId,
            openedByUserId: current.openedByUserId,
            submittedByUserId: current.submittedByUserId,
            approvedByUserId: current.approvedByUserId,
          });
        } catch (error) {
          if (
            error instanceof ReconciliationWorkflowError &&
            /maker|approver/.test(error.message)
          ) {
            throw new ForbiddenException(error.message);
          }
          if (error instanceof ReconciliationWorkflowError)
            throw new ConflictException(error.message);
          throw error;
        }

        const now = new Date();
        const data: Prisma.ReconciliationExceptionUncheckedUpdateManyInput = {
          status: nextStatus,
          version: { increment: 1 },
        };
        if (action === 'SUBMITTED') {
          data.submittedByUserId = principal.userId;
          data.submittedAt = now;
          data.approvedByUserId = null;
          data.approvedAt = null;
          if ('proposedResolution' in dto && dto.proposedResolution) {
            data.proposedResolution = dto.proposedResolution.trim();
          }
        } else if (action === 'APPROVED') {
          data.approvedByUserId = principal.userId;
          data.approvedAt = now;
        } else if (action === 'RESOLVED') {
          const resolution = dto as ResolveReconciliationExceptionDto;
          await this.assertResolutionJournal(tx, current, resolution);
          data.resolvedByUserId = principal.userId;
          data.resolvedAt = now;
          data.resolutionCode = resolution.resolutionCode;
          data.resolutionNotes = resolution.resolutionNotes.trim();
          data.resolutionJournalEntryId = resolution.resolutionJournalEntryId ?? null;
        }

        const updated = await tx.reconciliationException.updateMany({
          where: { id: exceptionId, status: current.status, version: dto.expectedVersion },
          data,
        });
        if (updated.count !== 1)
          throw new ConflictException('Reconciliation exception changed concurrently');

        if (action === 'RESOLVED') {
          await tx.upstreamReconciliation.update({
            where: { id: current.reconciliationId },
            data: { status: 'RESOLVED', reconciledAt: now },
          });
          await tx.rewardPeriod.update({
            where: { id: current.reconciliation.rewardPeriodId },
            data: { reconciliationStatus: 'RESOLVED' },
          });
        }

        const nextVersion = current.version + 1;
        await this.appendAction(tx, {
          exceptionId,
          actorUserId: principal.userId,
          action,
          fromStatus: current.status,
          toStatus: nextStatus,
          comment: dto.comment?.trim(),
          correlationId,
          durableKey,
          version: nextVersion,
          metadata:
            action === 'RESOLVED'
              ? {
                  resolutionCode: (dto as ResolveReconciliationExceptionDto).resolutionCode,
                  resolutionJournalEntryId:
                    (dto as ResolveReconciliationExceptionDto).resolutionJournalEntryId ?? null,
                }
              : undefined,
        });
        return this.requireException(tx, exceptionId);
      },
    );
  }

  private async assertResolutionJournal(
    tx: Transaction,
    exception: ExceptionResult,
    dto: ResolveReconciliationExceptionDto,
  ): Promise<void> {
    if (dto.resolutionCode !== 'LEDGER_ADJUSTMENT') {
      if (dto.resolutionJournalEntryId) {
        throw new BadRequestException('A journal entry is only allowed for LEDGER_ADJUSTMENT');
      }
      return;
    }
    if (!dto.resolutionJournalEntryId) {
      throw new BadRequestException('LEDGER_ADJUSTMENT requires a posted journal entry');
    }
    const entry = await tx.journalEntry.findUnique({
      where: { id: dto.resolutionJournalEntryId },
      include: { lines: { select: { assetId: true } } },
    });
    if (!entry || entry.status !== 'POSTED')
      throw new ConflictException('Resolution journal entry must be POSTED');
    if (entry.referenceType !== 'RECONCILIATION_EXCEPTION' || entry.referenceId !== exception.id) {
      throw new ConflictException(
        'Resolution journal entry must reference this reconciliation exception',
      );
    }
    if (
      entry.lines.length < 2 ||
      entry.lines.some((line) => line.assetId !== exception.reconciliation.assetId)
    ) {
      throw new ConflictException(
        'Resolution journal entry must be balanced for the reconciliation asset',
      );
    }
  }

  private async executeIdempotent(
    operation: string,
    resourceId: string,
    actorUserId: string,
    clientKey: string,
    correlationId: string,
    payload: unknown,
    operationBody: (tx: Transaction, durableKey: string) => Promise<ExceptionResult>,
  ): Promise<OperationResult> {
    const durableKey = `reconciliation-exception:${operation}:${resourceId}:${clientKey}`;
    const hash = requestHash({ operation, resourceId, actorUserId, payload });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const record = await tx.idempotencyRecord.upsert({
              where: { key: durableKey },
              update: {},
              create: {
                key: durableKey,
                owner: correlationId,
                requestHash: hash,
                expiresAt: new Date('9999-12-31T23:59:59.999Z'),
              },
            });
            if (record.requestHash !== hash) {
              throw new ConflictException(
                'Idempotency key was already used with a different request',
              );
            }
            if (record.status === 'COMPLETED') {
              if (!record.resultReference)
                throw new ConflictException('Completed operation has no result reference');
              const action = await tx.reconciliationExceptionAction.findUnique({
                where: { idempotencyKey: durableKey },
              });
              return {
                exception: await this.requireException(tx, record.resultReference),
                correlationId: action?.correlationId ?? record.owner,
                replayed: true,
              };
            }
            if (record.status !== 'ACQUIRED' || record.owner !== correlationId) {
              throw new ConflictException('Idempotent operation is not available for execution');
            }
            const exception = await operationBody(tx, durableKey);
            await tx.idempotencyRecord.update({
              where: { id: record.id },
              data: { status: 'COMPLETED', resultReference: exception.id },
            });
            return { exception, correlationId, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryableTransaction(error) && attempt < 4) continue;
        if (isUniqueConflict(error))
          throw new ConflictException('Reconciliation workflow changed concurrently');
        throw error;
      }
    }
    throw new ConflictException('Reconciliation transaction retry budget exhausted');
  }

  private async appendAction(
    tx: Transaction,
    input: {
      exceptionId: string;
      actorUserId: string;
      action: 'OPENED' | ReconciliationWorkflowAction;
      fromStatus: ReconciliationWorkflowStatus | null;
      toStatus: ReconciliationWorkflowStatus;
      comment?: string;
      correlationId: string;
      durableKey: string;
      version: number;
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    const now = new Date();
    await tx.reconciliationExceptionAction.create({
      data: {
        exceptionId: input.exceptionId,
        actorUserId: input.actorUserId,
        action: input.action,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        comment: input.comment,
        correlationId: input.correlationId,
        idempotencyKey: input.durableKey,
        metadata: input.metadata,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: `RECONCILIATION_EXCEPTION_${input.action}`,
        resourceType: 'ReconciliationException',
        resourceId: input.exceptionId,
        metadata: {
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          correlationId: input.correlationId,
          version: input.version,
          ...(input.metadata ?? {}),
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventId: randomUUID(),
        eventName: actionEventNames[input.action],
        producer: 'api',
        aggregateType: 'ReconciliationException',
        aggregateId: input.exceptionId,
        correlationId: input.correlationId,
        idempotencyKey: `outbox:${input.durableKey}`,
        occurredAt: now,
        payload: {
          exceptionId: input.exceptionId,
          action: input.action,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          version: input.version,
        },
      },
    });
  }

  private async assertFinancialOperator(principal: AuthPrincipal): Promise<void> {
    if (principal.authenticationType !== 'access-token') {
      throw new ForbiddenException('Financial operations require an interactive step-up session');
    }
    const security = await prisma.userSecurity.findUnique({
      where: { userId: principal.userId },
      select: { totpEnabled: true },
    });
    if (!security?.totpEnabled)
      throw new ForbiddenException('Financial operations require TOTP 2FA');
  }

  private async requireException(
    client: Transaction | typeof prisma,
    exceptionId: string,
  ): Promise<ExceptionResult> {
    const exception = await client.reconciliationException.findUnique({
      where: { id: exceptionId },
      include: exceptionInclude,
    });
    if (!exception) throw new NotFoundException('Reconciliation exception not found');
    return exception;
  }
}
