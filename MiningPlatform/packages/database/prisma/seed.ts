import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
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

  await prisma.ledgerAccount.createMany({
    data: [
      { code: 'BTC-HOT-WALLET', name: 'BTC Hot Wallet', type: 'ASSET', assetId: btc.id, systemAccount: true },
      { code: 'BTC-REWARD-CLEARING', name: 'BTC Reward Clearing', type: 'CLEARING', assetId: btc.id, systemAccount: true },
      { code: 'BTC-USER-LIABILITY', name: 'BTC User Reward Liability', type: 'LIABILITY', assetId: btc.id, systemAccount: true },
      { code: 'BTC-PLATFORM-FEE', name: 'BTC Platform Fee Revenue', type: 'REVENUE', assetId: btc.id, systemAccount: true },
      { code: 'BTC-NETWORK-FEE', name: 'BTC Network Fee Expense', type: 'EXPENSE', assetId: btc.id, systemAccount: true }
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
    const miningAccount = await prisma.miningAccount.upsert({
      where: { userId_assetId: { userId: user.id, assetId: btc.id } },
      update: {},
      create: {
        id: 'dev-mining-account-btc',
        userId: user.id,
        assetId: btc.id,
        username: 'demo',
        rewardMethod: 'FOLLOW_UPSTREAM',
        platformFeePercent: '2',
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

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
