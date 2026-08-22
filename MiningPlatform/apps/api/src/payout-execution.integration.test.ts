/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import type { AuthPrincipal } from './modules/auth/auth.decorators.js';
import { StepUpService } from './modules/auth/step-up.service.js';
import { PayoutsService } from './modules/payouts/payouts.service.js';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function liabilityBalance(ledgerAccountId: string): Promise<bigint> {
  const balance = await prisma.journalLine.aggregate({
    where: {
      ledgerAccountId,
      journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
    },
    _sum: { debitAtomic: true, creditAtomic: true },
  });
  return (balance._sum.creditAtomic ?? 0n) - (balance._sum.debitAtomic ?? 0n);
}

test('controlled payout reserves once, separates approval, and reverses rejected reservations', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 20);
  const previousEnvironment = {
    payouts: process.env.PAYOUTS_ENABLED,
    requests: process.env.PAYOUT_REQUESTS_ENABLED,
    signing: process.env.PAYOUT_SIGNING_ENABLED,
    broadcast: process.env.PAYOUT_BROADCAST_ENABLED,
  };
  process.env.PAYOUTS_ENABLED = 'true';
  process.env.PAYOUT_REQUESTS_ENABLED = 'true';
  process.env.PAYOUT_SIGNING_ENABLED = 'false';
  process.env.PAYOUT_BROADCAST_ENABLED = 'false';

  const btc = await prisma.asset.findUniqueOrThrow({ where: { symbol: 'BTC' } });
  const controlBefore = await prisma.payoutControl.findUniqueOrThrow({
    where: { assetId: btc.id },
  });
  try {
    await prisma.payoutControl.update({
      where: { assetId: btc.id },
      data: {
        paused: false,
        requestsEnabled: true,
        signingEnabled: false,
        broadcastEnabled: false,
        pauseReason: 'Integration test enables reservation requests without signing or broadcast.',
        version: { increment: 1 },
      },
    });
    const feePolicy = await prisma.miningFeePolicy.findFirstOrThrow({
      where: { policyKey: 'platform-default', version: 1 },
    });
    const user = await prisma.user.create({
      data: {
        email: `payout-execution-${suffix}@example.test`,
        passwordHash: 'INTEGRATION_ONLY',
        displayName: 'Payout Execution User',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const approver = await prisma.user.create({
      data: {
        email: `payout-approver-${suffix}@example.test`,
        passwordHash: 'INTEGRATION_ONLY',
        displayName: 'Payout Execution Approver',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const account = await prisma.miningAccount.create({
      data: {
        userId: user.id,
        assetId: btc.id,
        feePolicyId: feePolicy.id,
        username: `payout_exec_${suffix}`,
        platformFeePercent: '0.5',
      },
    });
    const network = await prisma.assetNetwork.create({
      data: {
        assetId: btc.id,
        networkKey: `bitcoin-payout-exec-${suffix}`,
        displayName: 'Bitcoin Payout Execution Integration',
        chainFamily: 'BITCOIN',
        addressValidator: 'BITCOIN',
        enabled: true,
      },
    });
    const wallet = await prisma.wallet.create({
      data: {
        assetId: btc.id,
        type: 'HOT',
        name: `Payout integration ${suffix}`,
        enabled: true,
        signerKeyReference: `integration-key-${suffix}`,
        maximumSinglePayoutAtomic: 500_000n,
        dailyPayoutLimitAtomic: 1_000_000n,
        minimumReserveAtomic: 100_000n,
        lastReconciledAt: new Date(),
      },
    });
    await prisma.walletReconciliation.create({
      data: {
        idempotencyKey: `wallet-reconciliation-${suffix}`,
        walletId: wallet.id,
        status: 'MATCHED',
        nodeBalanceAtomic: 251_000n,
        ledgerAssetAtomic: 251_000n,
        activeReservationAtomic: 0n,
        pendingBroadcastAtomic: 0n,
        varianceAtomic: 0n,
        chainHeight: 1n,
        chainTipHash: digest(`tip-${suffix}`),
        evidenceDigest: digest(`wallet-reconciliation-${suffix}`),
      },
    });
    const route = await prisma.payoutRoute.create({
      data: {
        assetNetworkId: network.id,
        payoutWalletId: wallet.id,
        routeKey: `pilot-${suffix}`,
        version: 1,
        status: 'PILOT',
        minimumPayoutAtomic: 1n,
        maximumPayoutAtomic: 500_000n,
        fixedNetworkFeeAtomic: 1_000n,
        addressCooldownSeconds: 0,
        requiredConfirmations: 3,
        manualApprovalRequired: true,
        effectiveFrom: new Date(Date.now() - 60_000),
        changeReason: 'Controlled payout integration pilot route.',
      },
    });
    const destination = await prisma.payoutAddress.create({
      data: {
        userId: user.id,
        assetId: btc.id,
        assetNetworkId: network.id,
        payoutRouteId: route.id,
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        addressHash: digest(`${network.id}:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`),
        status: 'ACTIVE',
        verified: true,
        verifiedAt: new Date(Date.now() - 60_000),
        active: true,
        cooldownUntil: new Date(Date.now() - 60_000),
        activatedAt: new Date(Date.now() - 30_000),
      },
    });
    await prisma.miningAccount.update({
      where: { id: account.id },
      data: { selectedPayoutAddressId: destination.id },
    });

    const available = await prisma.ledgerAccount.create({
      data: {
        code: `BTC-USER-LIABILITY-${user.id}`,
        name: 'BTC User Reward Liability',
        type: 'LIABILITY',
        userId: user.id,
        assetId: btc.id,
      },
    });
    const clearing = await prisma.ledgerAccount.findUniqueOrThrow({
      where: { code: 'BTC-REWARD-CLEARING' },
    });
    const funding = await prisma.journalEntry.create({
      data: {
        idempotencyKey: `payout-test-funding-${suffix}`,
        referenceType: 'IntegrationFunding',
        referenceId: suffix,
        description: 'Controlled payout integration liability funding',
        correlationId: suffix,
        status: 'PENDING',
        effectiveAt: new Date(),
        lines: {
          create: [
            {
              ledgerAccountId: clearing.id,
              assetId: btc.id,
              debit: '0.003',
              credit: '0',
              debitAtomic: 300_000n,
              creditAtomic: 0n,
            },
            {
              ledgerAccountId: available.id,
              assetId: btc.id,
              debit: '0',
              credit: '0.003',
              debitAtomic: 0n,
              creditAtomic: 300_000n,
            },
          ],
        },
      },
    });
    await prisma.journalEntry.update({
      where: { id: funding.id },
      data: { status: 'POSTED', postedAt: new Date() },
    });

    const userPrincipal: AuthPrincipal = {
      userId: user.id,
      email: user.email,
      role: 'USER',
      sessionId: `integration-user-${suffix}`,
      authenticationType: 'access-token',
      scopes: ['*'],
    };
    const approverPrincipal: AuthPrincipal = {
      userId: approver.id,
      email: approver.email,
      role: 'ADMIN',
      sessionId: `integration-approver-${suffix}`,
      authenticationType: 'access-token',
      scopes: ['*'],
    };
    const service = new PayoutsService(new StepUpService());
    const requestKey = `payout-request-${suffix}`;
    const first = await service.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '100000',
      idempotencyKey: requestKey,
    });
    assert.equal(first.status, 'REVIEW');
    assert.equal(first.amountAtomic, '100000');
    assert.equal(first.networkFeeAtomic, '1000');
    assert.equal(first.reservation?.amountAtomic, '101000');
    assert.equal(first.reservation?.status, 'ACTIVE');
    assert.equal(await liabilityBalance(available.id), 199_000n);

    const retry = await service.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '100000',
      idempotencyKey: requestKey,
    });
    assert.equal(retry.id, first.id);
    assert.equal(await prisma.payout.count({ where: { idempotencyKey: requestKey } }), 1);
    assert.equal(await prisma.balanceReservation.count({ where: { payoutId: first.id } }), 1);

    await assert.rejects(
      service.request(userPrincipal, {
        miningAccountId: account.id,
        amountAtomic: '50000',
        idempotencyKey: `payout-request-oversubscribed-${suffix}`,
      }),
      (error: unknown) => {
        const response = (error as { getResponse?: () => unknown }).getResponse?.() as
          | { blockers?: string[] }
          | undefined;
        assert.ok(response?.blockers?.includes('HOT_WALLET_RESERVE_INSUFFICIENT'));
        return true;
      },
    );
    assert.equal(
      await prisma.payout.count({
        where: { idempotencyKey: `payout-request-oversubscribed-${suffix}` },
      }),
      0,
    );
    await prisma.walletReconciliation.create({
      data: {
        idempotencyKey: `wallet-reconciliation-expanded-${suffix}`,
        walletId: wallet.id,
        status: 'MATCHED',
        nodeBalanceAtomic: 2_000_000n,
        ledgerAssetAtomic: 2_000_000n,
        activeReservationAtomic: 101_000n,
        pendingBroadcastAtomic: 0n,
        varianceAtomic: 0n,
        chainHeight: 2n,
        chainTipHash: digest(`tip-expanded-${suffix}`),
        evidenceDigest: digest(`wallet-reconciliation-expanded-${suffix}`),
        reconciledAt: new Date(Date.now() + 1_000),
      },
    });

    await assert.rejects(
      service.decide(
        { ...userPrincipal, role: 'ADMIN' },
        {
          payoutId: first.id,
          decision: 'APPROVED',
          reason: 'Requester must never approve the same payout.',
          idempotencyKey: `self-approval-${suffix}`,
        },
      ),
      /cannot decide their own payout/,
    );
    const approved = await service.decide(approverPrincipal, {
      payoutId: first.id,
      decision: 'APPROVED',
      reason: 'Pilot evidence reviewed and reservation is valid.',
      idempotencyKey: `payout-approval-${suffix}`,
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.approvals.length, 1);
    await assert.rejects(
      service.cancel(userPrincipal, first.id, 'Cannot cancel after approval evidence exists.'),
      /has not been approved/,
    );

    const second = await service.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '50000',
      idempotencyKey: `payout-request-reject-${suffix}`,
    });
    assert.equal(await liabilityBalance(available.id), 148_000n);
    const rejected = await service.decide(approverPrincipal, {
      payoutId: second.id,
      decision: 'REJECTED',
      reason: 'Risk review intentionally rejects this integration payout.',
      idempotencyKey: `payout-rejection-${suffix}`,
    });
    assert.equal(rejected.status, 'FAILED');
    assert.equal(rejected.reservation?.status, 'RELEASED');
    assert.equal(await liabilityBalance(available.id), 199_000n);
    const reversal = await prisma.balanceReservation.findUniqueOrThrow({
      where: { payoutId: second.id },
      include: { reversalJournalEntry: { include: { lines: true } } },
    });
    assert.equal(reversal.reversalJournalEntry?.status, 'POSTED');
    assert.equal(
      reversal.reversalJournalEntry?.lines.reduce(
        (sum, line) => sum + line.debitAtomic - line.creditAtomic,
        0n,
      ),
      0n,
    );
  } finally {
    await prisma.payoutControl.update({
      where: { assetId: btc.id },
      data: {
        paused: controlBefore.paused,
        requestsEnabled: controlBefore.requestsEnabled,
        signingEnabled: controlBefore.signingEnabled,
        broadcastEnabled: controlBefore.broadcastEnabled,
        pauseReason: controlBefore.pauseReason,
        version: { increment: 1 },
      },
    });
    for (const [key, value] of [
      ['PAYOUTS_ENABLED', previousEnvironment.payouts],
      ['PAYOUT_REQUESTS_ENABLED', previousEnvironment.requests],
      ['PAYOUT_SIGNING_ENABLED', previousEnvironment.signing],
      ['PAYOUT_BROADCAST_ENABLED', previousEnvironment.broadcast],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
