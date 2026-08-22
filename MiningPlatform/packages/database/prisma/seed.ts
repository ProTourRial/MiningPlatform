/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const defaultFeePolicy = await prisma.miningFeePolicy.upsert({
    where: { policyKey_version: { policyKey: 'platform-default', version: 1 } },
    update: {
      status: 'ACTIVE',
      feeBasisPoints: 50,
      feePartsPerMillion: 5000,
      effectiveUntil: null,
      changeReason: 'Owner-approved initial platform fee baseline: 0.5%.',
    },
    create: {
      id: 'fee-policy-platform-default-v1',
      policyKey: 'platform-default',
      version: 1,
      status: 'ACTIVE',
      scope: 'PLATFORM_DEFAULT',
      feeBasisPoints: 50,
      feePartsPerMillion: 5000,
      effectiveFrom: new Date('2026-08-12T17:00:00.000Z'),
      changeReason: 'Owner-approved initial platform fee baseline: 0.5%.',
    },
  });

  const referralProgram = await prisma.referralProgram.upsert({
    where: { programKey_version: { programKey: 'standard-referral', version: 1 } },
    update: { status: 'ACTIVE' },
    create: {
      id: 'referral-program-standard-v1',
      programKey: 'standard-referral',
      version: 1,
      status: 'ACTIVE',
      minerFeePartsPerMillion: 3750,
      commissionPartsPerMillion: 1250,
      effectiveFrom: new Date('2026-08-21T00:00:00.000Z'),
      changeReason:
        'Owner-approved referral economics: miner fee 0.375% and referral commission 0.125%.',
    },
  });
  await prisma.referralCode.upsert({
    where: { code: 'MP05' },
    update: {},
    create: {
      id: 'referral-code-default-mp05',
      code: 'MP05',
      programId: referralProgram.id,
      beneficiaryType: 'SITE_DONATION',
    },
  });

  const btc = await prisma.asset.upsert({
    where: { symbol: 'BTC' },
    update: {},
    create: {
      symbol: 'BTC',
      name: 'Bitcoin',
      algorithm: 'SHA256',
      decimals: 8,
      enabled: true,
      minimumPayout: '0.001',
      requiredConfirmations: 3,
    },
  });

  const btcNetwork = await prisma.assetNetwork.upsert({
    where: { assetId_networkKey: { assetId: btc.id, networkKey: 'bitcoin-mainnet' } },
    update: { enabled: true },
    create: {
      id: `asset-network-${btc.id}`,
      assetId: btc.id,
      networkKey: 'bitcoin-mainnet',
      displayName: 'Bitcoin Mainnet',
      chainFamily: 'BITCOIN',
      addressValidator: 'BITCOIN',
      isTestnet: false,
      enabled: true,
    },
  });
  const payoutRouteKey = {
    assetNetworkId_routeKey_version: {
      assetNetworkId: btcNetwork.id,
      routeKey: 'default',
      version: 1,
    },
  } as const;
  const existingPayoutRoute = await prisma.payoutRoute.findUnique({ where: payoutRouteKey });
  if (!existingPayoutRoute) {
    await prisma.payoutRoute.create({
      data: {
        id: `payout-route-${btc.id}`,
        assetNetworkId: btcNetwork.id,
        routeKey: 'default',
        version: 1,
        status: 'ADDRESS_REGISTRATION',
        minimumPayoutAtomic: 100_000n,
        fixedNetworkFeeAtomic: 0n,
        addressCooldownSeconds: 86_400,
        requiredConfirmations: 3,
        manualApprovalRequired: true,
        effectiveFrom: new Date('2026-08-22T00:00:00.000Z'),
        changeReason:
          'P0.4 address-registration foundation; signing and broadcast remain disabled.',
      },
    });
  }

  await prisma.payoutControl.upsert({
    where: { assetId: btc.id },
    update: {},
    create: {
      id: `payout-control-${btc.id}`,
      assetId: btc.id,
      requestsEnabled: false,
      signingEnabled: false,
      broadcastEnabled: false,
      paused: true,
      pauseReason:
        'Controlled payout execution is installed but remains paused pending production approval.',
    },
  });

  await prisma.ledgerAccount.createMany({
    data: [
      {
        code: 'BTC-HOT-WALLET',
        name: 'BTC Hot Wallet',
        type: 'ASSET',
        assetId: btc.id,
        systemAccount: true,
      },
      {
        code: 'BTC-REWARD-CLEARING',
        name: 'BTC Reward Clearing',
        type: 'CLEARING',
        assetId: btc.id,
        systemAccount: true,
      },
      {
        code: 'BTC-USER-LIABILITY',
        name: 'BTC User Reward Liability',
        type: 'LIABILITY',
        assetId: btc.id,
        systemAccount: true,
      },
      {
        code: 'BTC-PLATFORM-FEE',
        name: 'BTC Platform Fee Revenue',
        type: 'REVENUE',
        assetId: btc.id,
        systemAccount: true,
      },
      {
        code: 'BTC-NETWORK-FEE',
        name: 'BTC Network Fee Expense',
        type: 'EXPENSE',
        assetId: btc.id,
        systemAccount: true,
      },
    ],
    skipDuplicates: true,
  });
  if (process.env.SEED_DEVELOPMENT_DATA === 'true') {
    const user = await prisma.user.upsert({
      where: { email: 'dev@local.invalid' },
      update: {},
      create: {
        id: 'dev-user-0000000000000001',
        email: 'dev@local.invalid',
        passwordHash: 'DEVELOPMENT_ONLY_NOT_FOR_LOGIN',
        displayName: 'Development Miner',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userSecurity.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, recoveryCodesHash: [] },
    });
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    const miningAccount = await prisma.miningAccount.upsert({
      where: { userId_assetId: { userId: user.id, assetId: btc.id } },
      update: {
        feePolicyId: defaultFeePolicy.id,
        platformFeePercent: '0.5',
      },
      create: {
        id: 'dev-mining-account-btc',
        userId: user.id,
        assetId: btc.id,
        feePolicyId: defaultFeePolicy.id,
        username: 'demo',
        rewardMethod: 'FOLLOW_UPSTREAM',
        platformFeePercent: '0.5',
      },
    });
    const personalCode = `MP${createHash('sha256')
      .update(user.id)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase()}`;
    await prisma.referralCode.upsert({
      where: { code: personalCode },
      update: {},
      create: {
        code: personalCode,
        programId: referralProgram.id,
        ownerUserId: user.id,
        beneficiaryType: 'USER',
      },
    });
    await prisma.worker.upsert({
      where: { miningAccountId_name: { miningAccountId: miningAccount.id, name: 'worker1' } },
      update: {},
      create: {
        id: 'dev-7d9a4df2e77952c0657de069',
        userId: user.id,
        miningAccountId: miningAccount.id,
        name: 'worker1',
        passwordHash: 'DEVELOPMENT_STRATUM_AUTH_IS_ENV_BASED',
        status: 'OFFLINE',
      },
    });
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
