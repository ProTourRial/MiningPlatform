/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '@mining/database';
import {
  MiningEvents,
  type ContributionAcceptedPayload,
  type DomainEvent,
  type SettlementImportedPayload,
} from '@mining/shared';
import { AccountingService } from '../apps/accounting-worker/src/accounting-service.js';

const service = new AccountingService();
const periodStart = new Date('2026-08-16T00:00:00.000Z');
const periodEnd = new Date('2026-08-16T01:00:00.000Z');

async function main(): Promise<void> {
  const runId = randomUUID();
  const fixtureId = (name: string): string => `financial-truth-${name}-${runId}`;
  const asset = await prisma.asset.findUniqueOrThrow({ where: { symbol: 'BTC' } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dev@local.invalid' } });
  const miningAccount = await prisma.miningAccount.findUniqueOrThrow({
    where: { userId_assetId: { userId: user.id, assetId: asset.id } },
  });
  const worker = await prisma.worker.findUniqueOrThrow({
    where: { miningAccountId_name: { miningAccountId: miningAccount.id, name: 'worker1' } },
  });
  const upstreamPool = await prisma.upstreamPool.create({
    data: {
      id: fixtureId('upstream-pool'),
      assetId: asset.id,
      poolKey: fixtureId('reference'),
      name: fixtureId('reference-pool'),
      host: '127.0.0.1',
      port: 3333,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'OPERATIONAL',
    },
  });
  const session = await prisma.minerSession.create({
    data: {
      id: fixtureId('session'),
      eventId: fixtureId('session-event'),
      workerId: worker.id,
      status: 'ACTIVE',
      remoteIpHash: 'integration-ip-hash',
      activeDifficulty: '1.000000000000',
      connectedAt: periodStart,
      authorizedAt: periodStart,
    },
  });
  const job = await prisma.stratumJob.create({
    data: {
      id: fixtureId('job'),
      assetId: asset.id,
      upstreamPoolId: upstreamPool.id,
      externalJobId: fixtureId('external-job'),
      previousBlockHash: '00'.repeat(32),
      coinbase1: '00',
      coinbase2: '00',
      merkleBranches: [],
      version: '20000000',
      networkBits: '1d00ffff',
      networkTime: '00000000',
      receivedAt: periodStart,
      expiresAt: periodEnd,
    },
  });
  const share = await prisma.share.create({
    data: {
      id: fixtureId('share'),
      eventId: fixtureId('local-share-event'),
      fingerprint: fixtureId('share-fingerprint'),
      workerId: worker.id,
      assetId: asset.id,
      sessionId: session.id,
      stratumJobId: job.id,
      status: 'UPSTREAM_ACCEPTED',
      assignedDifficulty: '1.000000000000',
      achievedDifficulty: '1.500000000000',
      extranonce2: '00000001',
      networkTime: '00000000',
      nonce: '00000001',
      upstreamAccepted: true,
      upstreamSubmittedAt: new Date('2026-08-16T00:29:59.000Z'),
      upstreamRespondedAt: new Date('2026-08-16T00:30:00.000Z'),
      submittedAt: new Date('2026-08-16T00:29:58.000Z'),
    },
  });

  const contributionEvent: DomainEvent<ContributionAcceptedPayload> = {
    eventId: fixtureId('contribution-event'),
    eventName: MiningEvents.contributionAccepted,
    eventVersion: 1,
    occurredAt: '2026-08-16T00:30:00.000Z',
    producer: 'integration-test',
    aggregateType: 'ContributionFact',
    aggregateId: share.id,
    correlationId: fixtureId('correlation'),
    causationId: fixtureId('upstream-accepted-event'),
    idempotencyKey: fixtureId('contribution-v1'),
    payload: {
      sourceEventId: fixtureId('upstream-accepted-event'),
      shareId: share.id,
      miningAccountId: miningAccount.id,
      assetId: asset.id,
      upstreamPoolId: upstreamPool.id,
      acceptedDifficulty: '1.000000000000',
      acceptedAt: '2026-08-16T00:30:00.000Z',
    },
  };
  const concurrentContributions = await Promise.all([
    service.handle(contributionEvent),
    service.handle(contributionEvent),
  ]);
  assert.equal(concurrentContributions.filter((result) => result.processed).length, 1);
  assert.equal(
    concurrentContributions.filter((result) => !result.processed && result.reason === 'DUPLICATE')
      .length,
    1,
  );
  assert.equal(await prisma.contributionFact.count({ where: { shareId: share.id } }), 1);

  const rewardPeriod = await prisma.rewardPeriod.create({
    data: {
      id: fixtureId('period'),
      assetId: asset.id,
      upstreamPoolId: upstreamPool.id,
      method: 'FOLLOW_UPSTREAM',
      status: 'OPEN',
      reconciliationStatus: 'MATCHED',
      periodStart,
      periodEnd,
      grossReward: '0.00100000',
      distributableReward: '0.00100000',
      grossAtomic: 100_000n,
      distributableAtomic: 100_000n,
      userNetAtomic: 100_000n,
    },
  });
  const reconciliation = await prisma.upstreamReconciliation.create({
    data: {
      id: fixtureId('reconciliation'),
      assetId: asset.id,
      upstreamPoolId: upstreamPool.id,
      rewardPeriodId: rewardPeriod.id,
      upstreamGrossReward: '0.00100000',
      upstreamFee: '0',
      receivedAmount: '0.00100000',
      internalExpectedAmount: '0.00100000',
      varianceAmount: '0',
      status: 'MATCHED',
      sourceReference: fixtureId('reference-001'),
      sourceChecksum: 'a'.repeat(64),
      importIdempotencyKey: fixtureId('import-001'),
      upstreamGrossAtomic: 100_000n,
      upstreamFeeAtomic: 0n,
      networkFeeAtomic: 0n,
      receivedAtomic: 100_000n,
      internalExpectedAtomic: 100_000n,
      varianceAtomic: 0n,
      toleranceAtomic: 0n,
    },
  });
  const settlementEvent: DomainEvent<SettlementImportedPayload> = {
    eventId: fixtureId('settlement-event'),
    eventName: MiningEvents.settlementImported,
    eventVersion: 1,
    occurredAt: '2026-08-16T01:01:00.000Z',
    producer: 'integration-test',
    aggregateType: 'UpstreamReconciliation',
    aggregateId: reconciliation.id,
    correlationId: fixtureId('correlation'),
    idempotencyKey: fixtureId('settlement-v1'),
    payload: {
      rewardPeriodId: rewardPeriod.id,
      reconciliationId: reconciliation.id,
      importIdempotencyKey: reconciliation.importIdempotencyKey,
      importedAt: '2026-08-16T01:01:00.000Z',
    },
  };
  const concurrentSettlements = await Promise.all([
    service.handle(settlementEvent),
    service.handle(settlementEvent),
  ]);
  assert.equal(concurrentSettlements.filter((result) => result.processed).length, 1);
  assert.equal(
    concurrentSettlements.filter((result) => !result.processed && result.reason === 'DUPLICATE')
      .length,
    1,
  );

  const closed = await prisma.rewardPeriod.findUniqueOrThrow({ where: { id: rewardPeriod.id } });
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.platformFeeAtomic, 500n);
  assert.equal(closed.userNetAtomic, 99_500n);
  const allocation = await prisma.rewardAllocation.findUniqueOrThrow({
    where: {
      rewardPeriodId_miningAccountId: {
        rewardPeriodId: rewardPeriod.id,
        miningAccountId: miningAccount.id,
      },
    },
  });
  assert.equal(allocation.feeBasisPoints, 50);
  assert.equal(allocation.platformFeeAtomic, 500n);
  assert.equal(allocation.netAtomic, 99_500n);
  assert.ok(allocation.journalEntryId);
  const journal = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: allocation.journalEntryId! },
    include: { lines: true },
  });
  assert.equal(journal.status, 'POSTED');
  assert.equal(
    journal.lines.reduce((sum, line) => sum + line.debitAtomic, 0n),
    100_000n,
  );
  assert.equal(
    journal.lines.reduce((sum, line) => sum + line.creditAtomic, 0n),
    100_000n,
  );

  const balanceBeforeReversal = await prisma.journalLine.aggregate({
    where: {
      ledgerAccount: { userId: user.id, type: 'LIABILITY' },
      journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
    },
    _sum: { debitAtomic: true, creditAtomic: true },
  });
  assert.equal(
    (balanceBeforeReversal._sum.creditAtomic ?? 0n) -
      (balanceBeforeReversal._sum.debitAtomic ?? 0n),
    99_500n,
  );

  await assert.rejects(
    prisma.rewardAllocation.update({
      where: { id: allocation.id },
      data: { netAtomic: 1n },
    }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.journalEntry.create({
      data: {
        idempotencyKey: fixtureId('atomic-mismatch'),
        referenceType: 'IntegrationTest',
        referenceId: 'atomic-mismatch',
        description: 'This decimal/atomic mismatch must be rejected',
        correlationId: fixtureId('correlation'),
        status: 'PENDING',
        effectiveAt: new Date(),
        lines: {
          create: [
            {
              ledgerAccountId: journal.lines[0]!.ledgerAccountId,
              assetId: asset.id,
              debit: '0.00000001',
              credit: '0',
              debitAtomic: 2n,
              creditAtomic: 0n,
            },
          ],
        },
      },
    }),
    /decimal and atomic/i,
  );
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const invalid = await tx.journalEntry.create({
        data: {
          idempotencyKey: fixtureId('unbalanced'),
          referenceType: 'IntegrationTest',
          referenceId: 'unbalanced',
          description: 'This journal must be rejected',
          correlationId: fixtureId('correlation'),
          status: 'PENDING',
          effectiveAt: new Date(),
          lines: {
            create: [
              {
                ledgerAccountId: journal.lines[0]!.ledgerAccountId,
                assetId: asset.id,
                debit: '0.00000001',
                credit: '0',
                debitAtomic: 1n,
                creditAtomic: 0n,
              },
            ],
          },
        },
      });
      await tx.journalEntry.update({
        where: { id: invalid.id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
    }),
    /not balanced/i,
  );

  const reversal = await service.reverseJournal({
    journalEntryId: journal.id,
    actorUserId: user.id,
    reason: 'Integration test validates immutable equal-and-opposite reversal.',
  });
  assert.equal(reversal.processed, true);
  const duplicateReversal = await service.reverseJournal({
    journalEntryId: journal.id,
    actorUserId: user.id,
    reason: 'Integration test validates immutable equal-and-opposite reversal.',
  });
  assert.equal(duplicateReversal.processed, false);
  const originalAfterReversal = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: journal.id },
  });
  assert.equal(originalAfterReversal.status, 'REVERSED');
  const balanceAfterReversal = await prisma.journalLine.aggregate({
    where: {
      ledgerAccount: { userId: user.id, type: 'LIABILITY' },
      journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
    },
    _sum: { debitAtomic: true, creditAtomic: true },
  });
  assert.equal(
    (balanceAfterReversal._sum.creditAtomic ?? 0n) - (balanceAfterReversal._sum.debitAtomic ?? 0n),
    0n,
  );
  await assert.rejects(
    prisma.journalLine.update({
      where: { id: journal.lines[0]!.id },
      data: { createdAt: new Date(0) },
    }),
    /immutable/i,
  );

  assert.equal(await prisma.payout.count(), 0);
  process.stdout.write(
    `${JSON.stringify(
      {
        contributionConcurrency: 'PASS',
        settlementConcurrency: 'PASS',
        exactFeeBasisPoints: allocation.feeBasisPoints,
        exactPlatformFeeAtomic: allocation.platformFeeAtomic.toString(),
        exactUserNetAtomic: allocation.netAtomic.toString(),
        balancedJournal: 'PASS',
        atomicConsistency: 'PASS',
        immutableFacts: 'PASS',
        reversalBalanceAtomic: '0',
        payoutsCreated: 0,
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
