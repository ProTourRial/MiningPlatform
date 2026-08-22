/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomUUID } from 'node:crypto';
import { type Prisma } from '@mining/database';
import {
  MiningEvents,
  type ReconciliationResolutionDecisionPayload,
  type ReconciliationResolutionRequestedPayload,
  type SettlementImportedPayload,
} from '@mining/shared';
import { serializableTransaction } from './serializable-transaction.js';

export interface CorrectedSettlementEvidence {
  assetSymbol: string;
  upstreamPoolKey: string;
  periodStart: string;
  periodEnd: string;
  sourceReference: string;
  sourceChecksum: string;
  importIdempotencyKey: string;
  grossAtomic: bigint;
  upstreamFeeAtomic: bigint;
  networkFeeAtomic: bigint;
  receivedAtomic: bigint;
  toleranceAtomic: bigint;
}

export interface ResolutionRequestInput {
  reconciliationId: string;
  requestIdempotencyKey: string;
  requestedByUserId: string;
  requestReason: string;
  evidence: CorrectedSettlementEvidence;
}

export interface ResolutionDecisionInput {
  resolutionId: string;
  decidedByUserId: string;
  decision: 'APPROVE' | 'REJECT';
  decisionReason: string;
}

export type ResolutionRequestResult =
  | { processed: true; resolutionId: string; status: 'PENDING' }
  | {
      processed: false;
      reason: 'DUPLICATE';
      resolutionId: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
    };

export type ResolutionDecisionResult =
  | {
      processed: true;
      resolutionId: string;
      status: 'APPROVED' | 'REJECTED';
      replacementReconciliationId: string | null;
    }
  | {
      processed: false;
      reason: 'DUPLICATE';
      resolutionId: string;
      status: 'APPROVED' | 'REJECTED';
      replacementReconciliationId: string | null;
    };

function requiredText(value: string, field: string, minimumLength = 1): string {
  const normalized = value.trim();
  if (normalized.length < minimumLength) {
    throw new Error(`${field} must contain at least ${minimumLength} characters`);
  }
  if (normalized.length > 2_000) throw new Error(`${field} exceeds 2000 characters`);
  return normalized;
}

function atomicToDecimal(value: bigint, decimals: number): string {
  if (value < 0n) throw new Error('Settlement display amounts cannot be negative');
  const digits = value.toString().padStart(decimals + 1, '0');
  return decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

export function validateCorrectedSettlementEvidence(
  evidence: CorrectedSettlementEvidence,
): CorrectedSettlementEvidence & { internalExpectedAtomic: bigint; varianceAtomic: 0n } {
  const assetSymbol = requiredText(evidence.assetSymbol, 'assetSymbol').toUpperCase();
  const upstreamPoolKey = requiredText(evidence.upstreamPoolKey, 'upstreamPoolKey');
  const periodStart = new Date(evidence.periodStart);
  const periodEnd = new Date(evidence.periodEnd);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw new Error('Corrected evidence period must contain valid ISO timestamps');
  }
  if (periodStart >= periodEnd)
    throw new Error('Corrected evidence periodStart must precede periodEnd');
  const sourceReference = requiredText(evidence.sourceReference, 'sourceReference');
  const sourceChecksum = requiredText(evidence.sourceChecksum, 'sourceChecksum').toLowerCase();
  const importIdempotencyKey = requiredText(evidence.importIdempotencyKey, 'importIdempotencyKey');
  if (!/^[0-9a-f]{64}$/.test(sourceChecksum)) {
    throw new Error('sourceChecksum must be a lowercase SHA-256 digest');
  }
  for (const [field, value] of Object.entries({
    grossAtomic: evidence.grossAtomic,
    upstreamFeeAtomic: evidence.upstreamFeeAtomic,
    networkFeeAtomic: evidence.networkFeeAtomic,
    receivedAtomic: evidence.receivedAtomic,
    toleranceAtomic: evidence.toleranceAtomic,
  })) {
    if (value < 0n) throw new Error(`${field} cannot be negative`);
  }
  if (evidence.toleranceAtomic !== 0n) {
    throw new Error('Resolution safety policy requires toleranceAtomic=0');
  }
  if (evidence.upstreamFeeAtomic + evidence.networkFeeAtomic > evidence.grossAtomic) {
    throw new Error('Corrected provider costs cannot exceed grossAtomic');
  }
  const internalExpectedAtomic =
    evidence.grossAtomic - evidence.upstreamFeeAtomic - evidence.networkFeeAtomic;
  if (evidence.receivedAtomic !== internalExpectedAtomic) {
    throw new Error('Corrected evidence must match exactly before a resolution can be requested');
  }
  return {
    ...evidence,
    assetSymbol,
    upstreamPoolKey,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    sourceReference,
    sourceChecksum,
    importIdempotencyKey,
    internalExpectedAtomic,
    varianceAtomic: 0n,
  };
}

async function requireResolutionOwner(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const owner = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, emailVerifiedAt: true },
  });
  const security = owner
    ? await tx.userSecurity.findUnique({
        where: { userId },
        select: { totpEnabled: true, totpSecretEncrypted: true },
      })
    : null;
  if (
    !owner ||
    owner.role !== 'OWNER' ||
    owner.status !== 'ACTIVE' ||
    !owner.emailVerifiedAt ||
    !security?.totpEnabled ||
    !security.totpSecretEncrypted
  ) {
    throw new Error('Reconciliation operator must be an ACTIVE, verified OWNER with TOTP enabled');
  }
}

function sameRequest(
  existing: {
    reconciliationId: string;
    requestIdempotencyKey: string;
    requestedByUserId: string;
    requestReason: string;
    correctedSourceReference: string;
    correctedSourceChecksum: string;
    correctedImportIdempotencyKey: string;
    correctedGrossAtomic: bigint;
    correctedUpstreamFeeAtomic: bigint;
    correctedNetworkFeeAtomic: bigint;
    correctedReceivedAtomic: bigint;
    correctedToleranceAtomic: bigint;
  },
  input: ResolutionRequestInput,
  reason: string,
  evidence: ReturnType<typeof validateCorrectedSettlementEvidence>,
): boolean {
  return (
    existing.reconciliationId === input.reconciliationId &&
    existing.requestIdempotencyKey === input.requestIdempotencyKey &&
    existing.requestedByUserId === input.requestedByUserId &&
    existing.requestReason === reason &&
    existing.correctedSourceReference === evidence.sourceReference &&
    existing.correctedSourceChecksum === evidence.sourceChecksum &&
    existing.correctedImportIdempotencyKey === evidence.importIdempotencyKey &&
    existing.correctedGrossAtomic === evidence.grossAtomic &&
    existing.correctedUpstreamFeeAtomic === evidence.upstreamFeeAtomic &&
    existing.correctedNetworkFeeAtomic === evidence.networkFeeAtomic &&
    existing.correctedReceivedAtomic === evidence.receivedAtomic &&
    existing.correctedToleranceAtomic === evidence.toleranceAtomic
  );
}

export class ReconciliationResolutionService {
  async request(input: ResolutionRequestInput): Promise<ResolutionRequestResult> {
    const requestReason = requiredText(input.requestReason, 'requestReason', 20);
    const requestIdempotencyKey = requiredText(
      input.requestIdempotencyKey,
      'requestIdempotencyKey',
    );
    const evidence = validateCorrectedSettlementEvidence(input.evidence);

    return serializableTransaction(async (tx) => {
      await requireResolutionOwner(tx, input.requestedByUserId);
      const duplicate = await tx.reconciliationResolution.findUnique({
        where: { requestIdempotencyKey },
      });
      if (duplicate) {
        if (!sameRequest(duplicate, input, requestReason, evidence)) {
          throw new Error(`Resolution request idempotency conflict: ${requestIdempotencyKey}`);
        }
        return {
          processed: false,
          reason: 'DUPLICATE',
          resolutionId: duplicate.id,
          status: duplicate.status,
        };
      }

      const reconciliation = await tx.upstreamReconciliation.findUniqueOrThrow({
        where: { id: input.reconciliationId },
      });
      const asset = await tx.asset.findUniqueOrThrow({
        where: { id: reconciliation.assetId },
        select: { symbol: true },
      });
      const upstreamPool = await tx.upstreamPool.findUniqueOrThrow({
        where: { id: reconciliation.upstreamPoolId },
        select: { poolKey: true },
      });
      const rewardPeriod = await tx.rewardPeriod.findUniqueOrThrow({
        where: { id: reconciliation.rewardPeriodId },
        select: {
          status: true,
          reconciliationStatus: true,
          periodStart: true,
          periodEnd: true,
        },
      });
      const resolutionRequest = await tx.reconciliationResolution.findUnique({
        where: { reconciliationId: reconciliation.id },
        select: { id: true },
      });
      if (resolutionRequest) {
        throw new Error(`Reconciliation already has a resolution request: ${reconciliation.id}`);
      }
      if (
        reconciliation.status !== 'EXCEPTION' ||
        rewardPeriod.reconciliationStatus !== 'EXCEPTION' ||
        rewardPeriod.status !== 'OPEN'
      ) {
        throw new Error('Only an open reconciliation exception can enter resolution review');
      }
      if (
        evidence.assetSymbol !== asset.symbol ||
        evidence.upstreamPoolKey !== upstreamPool.poolKey ||
        evidence.periodStart !== rewardPeriod.periodStart.toISOString() ||
        evidence.periodEnd !== rewardPeriod.periodEnd.toISOString()
      ) {
        throw new Error('Corrected evidence identity does not match the original reward period');
      }
      if (
        evidence.sourceReference === reconciliation.sourceReference ||
        evidence.sourceChecksum === reconciliation.sourceChecksum ||
        evidence.importIdempotencyKey === reconciliation.importIdempotencyKey
      ) {
        throw new Error('Corrected evidence must use new source identity and idempotency values');
      }

      const correlationId = randomUUID();
      const requestedAt = new Date();
      const resolution = await tx.reconciliationResolution.create({
        data: {
          reconciliationId: reconciliation.id,
          requestIdempotencyKey,
          correlationId,
          correctedSourceReference: evidence.sourceReference,
          correctedSourceChecksum: evidence.sourceChecksum,
          correctedImportIdempotencyKey: evidence.importIdempotencyKey,
          correctedGrossAtomic: evidence.grossAtomic,
          correctedUpstreamFeeAtomic: evidence.upstreamFeeAtomic,
          correctedNetworkFeeAtomic: evidence.networkFeeAtomic,
          correctedReceivedAtomic: evidence.receivedAtomic,
          correctedInternalExpectedAtomic: evidence.internalExpectedAtomic,
          correctedVarianceAtomic: 0n,
          correctedToleranceAtomic: 0n,
          requestReason,
          requestedByUserId: input.requestedByUserId,
          requestedAt,
        },
      });
      const payload: ReconciliationResolutionRequestedPayload = {
        resolutionId: resolution.id,
        reconciliationId: reconciliation.id,
        rewardPeriodId: reconciliation.rewardPeriodId,
        correctedSourceReference: evidence.sourceReference,
        correctedSourceChecksum: evidence.sourceChecksum,
        requestedByUserId: input.requestedByUserId,
        requestedAt: requestedAt.toISOString(),
      };
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: MiningEvents.reconciliationResolutionRequested,
          eventVersion: 1,
          producer: 'reconciliation-resolution-service',
          aggregateType: 'ReconciliationResolution',
          aggregateId: resolution.id,
          correlationId,
          causationId: reconciliation.id,
          idempotencyKey: `reconciliation-resolution-requested:${resolution.id}:v1`,
          payload: { ...payload },
          occurredAt: requestedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.requestedByUserId,
          action: 'RECONCILIATION_RESOLUTION_REQUESTED',
          resourceType: 'ReconciliationResolution',
          resourceId: resolution.id,
          metadata: {
            reconciliationId: reconciliation.id,
            rewardPeriodId: reconciliation.rewardPeriodId,
            correctedSourceReference: evidence.sourceReference,
            correctedSourceChecksum: evidence.sourceChecksum,
            correctedImportIdempotencyKey: evidence.importIdempotencyKey,
            requestReason,
            correlationId,
          },
        },
      });
      return { processed: true, resolutionId: resolution.id, status: 'PENDING' };
    });
  }

  async decide(input: ResolutionDecisionInput): Promise<ResolutionDecisionResult> {
    const decisionReason = requiredText(input.decisionReason, 'decisionReason', 20);
    return serializableTransaction(async (tx) => {
      await requireResolutionOwner(tx, input.decidedByUserId);
      const resolution = await tx.reconciliationResolution.findUniqueOrThrow({
        where: { id: input.resolutionId },
      });
      if (resolution.requestedByUserId === input.decidedByUserId) {
        throw new Error('Resolution requester cannot approve or reject their own request');
      }
      if (resolution.status !== 'PENDING') {
        const requestedStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        if (resolution.status !== requestedStatus) {
          throw new Error(`Resolution is already ${resolution.status}`);
        }
        return {
          processed: false,
          reason: 'DUPLICATE',
          resolutionId: resolution.id,
          status: resolution.status,
          replacementReconciliationId: resolution.replacementReconciliationId,
        };
      }
      const original = await tx.upstreamReconciliation.findUniqueOrThrow({
        where: { id: resolution.reconciliationId },
      });

      const decidedAt = new Date();
      if (input.decision === 'REJECT') {
        await tx.reconciliationResolution.update({
          where: { id: resolution.id },
          data: {
            status: 'REJECTED',
            decidedByUserId: input.decidedByUserId,
            decisionReason,
            decidedAt,
          },
        });
        const payload: ReconciliationResolutionDecisionPayload = {
          resolutionId: resolution.id,
          reconciliationId: resolution.reconciliationId,
          rewardPeriodId: original.rewardPeriodId,
          decision: 'REJECTED',
          decidedByUserId: input.decidedByUserId,
          decidedAt: decidedAt.toISOString(),
          replacementReconciliationId: null,
        };
        await this.recordDecision(tx, resolution.correlationId, payload, decisionReason);
        return {
          processed: true,
          resolutionId: resolution.id,
          status: 'REJECTED',
          replacementReconciliationId: null,
        };
      }

      const originalRewardPeriod = await tx.rewardPeriod.findUniqueOrThrow({
        where: { id: original.rewardPeriodId },
        select: { status: true, reconciliationStatus: true },
      });
      const originalAsset = await tx.asset.findUniqueOrThrow({
        where: { id: original.assetId },
        select: { decimals: true },
      });
      if (
        original.status !== 'EXCEPTION' ||
        originalRewardPeriod.status !== 'OPEN' ||
        originalRewardPeriod.reconciliationStatus !== 'EXCEPTION'
      ) {
        throw new Error('Resolution approval requires the original open exception state');
      }
      await tx.upstreamReconciliation.update({
        where: { id: original.id },
        data: { status: 'RESOLVED', resolvedAt: decidedAt },
      });
      const decimals = originalAsset.decimals;
      const replacement = await tx.upstreamReconciliation.create({
        data: {
          assetId: original.assetId,
          upstreamPoolId: original.upstreamPoolId,
          rewardPeriodId: original.rewardPeriodId,
          importedByUserId: resolution.requestedByUserId,
          upstreamGrossReward: atomicToDecimal(resolution.correctedGrossAtomic, decimals),
          upstreamFee: atomicToDecimal(resolution.correctedUpstreamFeeAtomic, decimals),
          receivedAmount: atomicToDecimal(resolution.correctedReceivedAtomic, decimals),
          internalExpectedAmount: atomicToDecimal(
            resolution.correctedInternalExpectedAtomic,
            decimals,
          ),
          varianceAmount: atomicToDecimal(0n, decimals),
          status: 'MATCHED',
          sourceReference: resolution.correctedSourceReference,
          sourceChecksum: resolution.correctedSourceChecksum,
          importIdempotencyKey: resolution.correctedImportIdempotencyKey,
          upstreamGrossAtomic: resolution.correctedGrossAtomic,
          upstreamFeeAtomic: resolution.correctedUpstreamFeeAtomic,
          networkFeeAtomic: resolution.correctedNetworkFeeAtomic,
          receivedAtomic: resolution.correctedReceivedAtomic,
          internalExpectedAtomic: resolution.correctedInternalExpectedAtomic,
          varianceAtomic: 0n,
          toleranceAtomic: 0n,
          importedAt: decidedAt,
        },
      });
      await tx.rewardPeriod.update({
        where: { id: original.rewardPeriodId },
        data: {
          reconciliationStatus: 'MATCHED',
          grossReward: atomicToDecimal(resolution.correctedGrossAtomic, decimals),
          upstreamFee: atomicToDecimal(resolution.correctedUpstreamFeeAtomic, decimals),
          networkFee: atomicToDecimal(resolution.correctedNetworkFeeAtomic, decimals),
          distributableReward: atomicToDecimal(
            resolution.correctedInternalExpectedAtomic,
            decimals,
          ),
          grossAtomic: resolution.correctedGrossAtomic,
          upstreamFeeAtomic: resolution.correctedUpstreamFeeAtomic,
          networkFeeAtomic: resolution.correctedNetworkFeeAtomic,
          platformFeeAtomic: 0n,
          distributableAtomic: resolution.correctedInternalExpectedAtomic,
          userNetAtomic: resolution.correctedInternalExpectedAtomic,
          failureCode: null,
        },
      });
      await tx.reconciliationResolution.update({
        where: { id: resolution.id },
        data: {
          status: 'APPROVED',
          decidedByUserId: input.decidedByUserId,
          decisionReason,
          decidedAt,
          replacementReconciliationId: replacement.id,
        },
      });
      const decisionPayload: ReconciliationResolutionDecisionPayload = {
        resolutionId: resolution.id,
        reconciliationId: original.id,
        rewardPeriodId: original.rewardPeriodId,
        decision: 'APPROVED',
        decidedByUserId: input.decidedByUserId,
        decidedAt: decidedAt.toISOString(),
        replacementReconciliationId: replacement.id,
      };
      await this.recordDecision(tx, resolution.correlationId, decisionPayload, decisionReason);

      const settlementPayload: SettlementImportedPayload = {
        rewardPeriodId: original.rewardPeriodId,
        reconciliationId: replacement.id,
        importIdempotencyKey: replacement.importIdempotencyKey,
        importedAt: replacement.importedAt.toISOString(),
      };
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: MiningEvents.settlementImported,
          eventVersion: 1,
          producer: 'reconciliation-resolution-service',
          aggregateType: 'UpstreamReconciliation',
          aggregateId: replacement.id,
          correlationId: resolution.correlationId,
          causationId: resolution.id,
          idempotencyKey: `settlement-imported:${replacement.importIdempotencyKey}:v1`,
          payload: { ...settlementPayload },
          occurredAt: replacement.importedAt,
        },
      });
      return {
        processed: true,
        resolutionId: resolution.id,
        status: 'APPROVED',
        replacementReconciliationId: replacement.id,
      };
    });
  }

  private async recordDecision(
    tx: Prisma.TransactionClient,
    correlationId: string,
    payload: ReconciliationResolutionDecisionPayload,
    decisionReason: string,
  ): Promise<void> {
    const approved = payload.decision === 'APPROVED';
    await tx.outboxEvent.create({
      data: {
        eventId: randomUUID(),
        eventName: approved
          ? MiningEvents.reconciliationResolutionApproved
          : MiningEvents.reconciliationResolutionRejected,
        eventVersion: 1,
        producer: 'reconciliation-resolution-service',
        aggregateType: 'ReconciliationResolution',
        aggregateId: payload.resolutionId,
        correlationId,
        causationId: payload.reconciliationId,
        idempotencyKey: `reconciliation-resolution-${approved ? 'approved' : 'rejected'}:${
          payload.resolutionId
        }:v1`,
        payload: { ...payload },
        occurredAt: new Date(payload.decidedAt),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: payload.decidedByUserId,
        action: approved
          ? 'RECONCILIATION_RESOLUTION_APPROVED'
          : 'RECONCILIATION_RESOLUTION_REJECTED',
        resourceType: 'ReconciliationResolution',
        resourceId: payload.resolutionId,
        metadata: {
          reconciliationId: payload.reconciliationId,
          rewardPeriodId: payload.rewardPeriodId,
          replacementReconciliationId: payload.replacementReconciliationId,
          decisionReason,
          correlationId,
        },
      },
    });
  }
}
