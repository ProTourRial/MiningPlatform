/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '@mining/database';
import { ReconciliationResolutionService } from '../apps/accounting-worker/src/reconciliation-resolution-service.js';

const service = new ReconciliationResolutionService();

async function createOwner(id: string, email: string): Promise<string> {
  const owner = await prisma.user.create({
    data: {
      id,
      email,
      passwordHash: 'INTEGRATION_ONLY_NOT_FOR_LOGIN',
      displayName: `Resolution Owner ${id}`,
      role: 'OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      security: {
        create: {
          totpEnabled: true,
          totpSecretEncrypted: 'INTEGRATION_ONLY_TOTP_ENROLLMENT_MARKER',
          recoveryCodesHash: [],
        },
      },
    },
  });
  return owner.id;
}

async function main(): Promise<void> {
  const runId = randomUUID();
  const fixtureId = (name: string): string => `reconciliation-resolution-${name}-${runId}`;
  const asset = await prisma.asset.findUniqueOrThrow({ where: { symbol: 'BTC' } });
  const requesterId = await createOwner(
    fixtureId('requester'),
    `resolution-requester-${runId}@local.invalid`,
  );
  const approverId = await createOwner(
    fixtureId('approver'),
    `resolution-approver-${runId}@local.invalid`,
  );
  const upstreamPool = await prisma.upstreamPool.create({
    data: {
      id: fixtureId('pool'),
      assetId: asset.id,
      poolKey: fixtureId('pool-key'),
      name: fixtureId('pool-name'),
      host: '127.0.0.1',
      port: 3333,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'OPERATIONAL',
    },
  });

  async function createException(label: string, periodStart: Date, periodEnd: Date) {
    const rewardPeriod = await prisma.rewardPeriod.create({
      data: {
        id: fixtureId(`${label}-period`),
        assetId: asset.id,
        upstreamPoolId: upstreamPool.id,
        method: 'FOLLOW_UPSTREAM',
        status: 'OPEN',
        reconciliationStatus: 'EXCEPTION',
        periodStart,
        periodEnd,
        grossReward: '0.00100000',
        upstreamFee: '0.00001000',
        networkFee: '0.00000500',
        distributableReward: '0.00098500',
        grossAtomic: 100_000n,
        upstreamFeeAtomic: 1_000n,
        networkFeeAtomic: 500n,
        distributableAtomic: 98_500n,
        userNetAtomic: 98_500n,
        failureCode: 'UPSTREAM_SETTLEMENT_VARIANCE',
      },
    });
    const reconciliation = await prisma.upstreamReconciliation.create({
      data: {
        id: fixtureId(`${label}-exception`),
        assetId: asset.id,
        upstreamPoolId: upstreamPool.id,
        rewardPeriodId: rewardPeriod.id,
        importedByUserId: requesterId,
        upstreamGrossReward: '0.00100000',
        upstreamFee: '0.00001000',
        receivedAmount: '0.00098000',
        internalExpectedAmount: '0.00098500',
        varianceAmount: '-0.00000500',
        status: 'EXCEPTION',
        sourceReference: fixtureId(`${label}-original-source`),
        sourceChecksum: 'a'.repeat(64),
        importIdempotencyKey: fixtureId(`${label}-original-import`),
        upstreamGrossAtomic: 100_000n,
        upstreamFeeAtomic: 1_000n,
        networkFeeAtomic: 500n,
        receivedAtomic: 98_000n,
        internalExpectedAtomic: 98_500n,
        varianceAtomic: -500n,
        toleranceAtomic: 0n,
        exceptionCode: 'RECEIVED_AMOUNT_MISMATCH',
        exceptionMessage: 'Provider evidence is short by 500 atomic units',
      },
    });
    return { rewardPeriod, reconciliation };
  }

  const approvalFixture = await createException(
    'approval',
    new Date('2026-08-21T00:00:00.000Z'),
    new Date('2026-08-21T01:00:00.000Z'),
  );
  const approvalEvidence = {
    assetSymbol: asset.symbol,
    upstreamPoolKey: upstreamPool.poolKey,
    periodStart: approvalFixture.rewardPeriod.periodStart.toISOString(),
    periodEnd: approvalFixture.rewardPeriod.periodEnd.toISOString(),
    sourceReference: fixtureId('approval-corrected-source'),
    sourceChecksum: 'b'.repeat(64),
    importIdempotencyKey: fixtureId('approval-corrected-import'),
    grossAtomic: 100_000n,
    upstreamFeeAtomic: 1_000n,
    networkFeeAtomic: 500n,
    receivedAtomic: 98_500n,
    toleranceAtomic: 0n,
  };
  const requestInput = {
    reconciliationId: approvalFixture.reconciliation.id,
    requestIdempotencyKey: fixtureId('approval-request'),
    requestedByUserId: requesterId,
    requestReason:
      'Provider supplied a corrected signed settlement statement for independent review.',
    evidence: approvalEvidence,
  };
  const request = await service.request(requestInput);
  assert.equal(request.processed, true);
  const duplicateRequest = await service.request(requestInput);
  assert.equal(duplicateRequest.processed, false);
  assert.equal(duplicateRequest.reason, 'DUPLICATE');
  assert.equal(duplicateRequest.resolutionId, request.resolutionId);
  assert.equal(
    await prisma.upstreamReconciliation.count({
      where: { rewardPeriodId: approvalFixture.rewardPeriod.id },
    }),
    1,
  );
  assert.equal(
    await prisma.outboxEvent.count({
      where: { idempotencyKey: `settlement-imported:${approvalEvidence.importIdempotencyKey}:v1` },
    }),
    0,
  );

  await assert.rejects(
    service.decide({
      resolutionId: request.resolutionId,
      decidedByUserId: requesterId,
      decision: 'APPROVE',
      decisionReason: 'A requester must never approve their own corrected evidence.',
    }),
    /cannot approve or reject their own request/,
  );
  const approval = await service.decide({
    resolutionId: request.resolutionId,
    decidedByUserId: approverId,
    decision: 'APPROVE',
    decisionReason:
      'Independent owner verified source identity, checksum, period, and exact amounts.',
  });
  assert.equal(approval.processed, true);
  assert.equal(approval.status, 'APPROVED');
  assert.ok(approval.replacementReconciliationId);
  const duplicateApproval = await service.decide({
    resolutionId: request.resolutionId,
    decidedByUserId: approverId,
    decision: 'APPROVE',
    decisionReason:
      'Independent owner verified source identity, checksum, period, and exact amounts.',
  });
  assert.equal(duplicateApproval.processed, false);
  assert.equal(duplicateApproval.reason, 'DUPLICATE');
  assert.equal(duplicateApproval.replacementReconciliationId, approval.replacementReconciliationId);

  const originalAfterApproval = await prisma.upstreamReconciliation.findUniqueOrThrow({
    where: { id: approvalFixture.reconciliation.id },
  });
  assert.equal(originalAfterApproval.status, 'RESOLVED');
  assert.equal(originalAfterApproval.receivedAtomic, 98_000n);
  assert.equal(originalAfterApproval.sourceChecksum, 'a'.repeat(64));
  assert.ok(originalAfterApproval.resolvedAt);
  const replacement = await prisma.upstreamReconciliation.findUniqueOrThrow({
    where: { id: approval.replacementReconciliationId! },
  });
  assert.equal(replacement.status, 'MATCHED');
  assert.equal(replacement.receivedAtomic, 98_500n);
  assert.equal(replacement.sourceChecksum, approvalEvidence.sourceChecksum);
  assert.equal(replacement.importedByUserId, requesterId);
  const approvedResolution = await prisma.reconciliationResolution.findUniqueOrThrow({
    where: { id: request.resolutionId },
  });
  assert.equal(approvedResolution.status, 'APPROVED');
  assert.equal(approvedResolution.requestedByUserId, requesterId);
  assert.equal(approvedResolution.decidedByUserId, approverId);
  assert.equal(approvedResolution.replacementReconciliationId, replacement.id);
  assert.equal(
    await prisma.upstreamReconciliation.count({
      where: {
        rewardPeriodId: approvalFixture.rewardPeriod.id,
        status: { in: ['PENDING', 'MATCHED', 'EXCEPTION'] },
      },
    }),
    1,
  );
  assert.equal(
    await prisma.outboxEvent.count({
      where: { idempotencyKey: `settlement-imported:${approvalEvidence.importIdempotencyKey}:v1` },
    }),
    1,
  );
  const matchedPeriod = await prisma.rewardPeriod.findUniqueOrThrow({
    where: { id: approvalFixture.rewardPeriod.id },
  });
  assert.equal(matchedPeriod.reconciliationStatus, 'MATCHED');
  assert.equal(matchedPeriod.failureCode, null);

  await assert.rejects(
    prisma.upstreamReconciliation.update({
      where: { id: originalAfterApproval.id },
      data: { sourceChecksum: 'c'.repeat(64) },
    }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.reconciliationResolution.update({
      where: { id: approvedResolution.id },
      data: { decisionReason: 'A finalized decision cannot be rewritten under any circumstance.' },
    }),
    /immutable/i,
  );

  const rejectionFixture = await createException(
    'rejection',
    new Date('2026-08-21T01:00:00.000Z'),
    new Date('2026-08-21T02:00:00.000Z'),
  );
  const rejectionRequest = await service.request({
    reconciliationId: rejectionFixture.reconciliation.id,
    requestIdempotencyKey: fixtureId('rejection-request'),
    requestedByUserId: requesterId,
    requestReason:
      'Provider supplied a second correction that requires independent rejection testing.',
    evidence: {
      ...approvalEvidence,
      periodStart: rejectionFixture.rewardPeriod.periodStart.toISOString(),
      periodEnd: rejectionFixture.rewardPeriod.periodEnd.toISOString(),
      sourceReference: fixtureId('rejection-corrected-source'),
      sourceChecksum: 'd'.repeat(64),
      importIdempotencyKey: fixtureId('rejection-corrected-import'),
    },
  });
  assert.equal(rejectionRequest.processed, true);
  const rejection = await service.decide({
    resolutionId: rejectionRequest.resolutionId,
    decidedByUserId: approverId,
    decision: 'REJECT',
    decisionReason:
      'Independent review rejected the correction because provider provenance is incomplete.',
  });
  assert.equal(rejection.processed, true);
  assert.equal(rejection.status, 'REJECTED');
  assert.equal(rejection.replacementReconciliationId, null);
  const duplicateRejection = await service.decide({
    resolutionId: rejectionRequest.resolutionId,
    decidedByUserId: approverId,
    decision: 'REJECT',
    decisionReason:
      'Independent review rejected the correction because provider provenance is incomplete.',
  });
  assert.equal(duplicateRejection.processed, false);
  assert.equal(duplicateRejection.reason, 'DUPLICATE');
  const rejectedOriginal = await prisma.upstreamReconciliation.findUniqueOrThrow({
    where: { id: rejectionFixture.reconciliation.id },
  });
  assert.equal(rejectedOriginal.status, 'EXCEPTION');
  assert.equal(rejectedOriginal.resolvedAt, null);
  assert.equal(
    await prisma.upstreamReconciliation.count({
      where: { rewardPeriodId: rejectionFixture.rewardPeriod.id },
    }),
    1,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        requestIdempotency: 'PASS',
        twoOwnerSeparation: 'PASS',
        originalEvidenceImmutable: 'PASS',
        replacementEvidenceVersioned: 'PASS',
        approvalEmitsSingleSettlement: 'PASS',
        approvalRetryDoesNotDuplicate: 'PASS',
        rejectionRemainsNonPosting: 'PASS',
        finalizedResolutionImmutable: 'PASS',
        activeReconciliationPerPeriod: 1,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
