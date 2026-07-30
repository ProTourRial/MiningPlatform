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
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
