/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  BitcoinJsonRpcClient,
  BitcoinWatchOnlyRpcAdapter,
  bitcoinToAtomic,
} from '@mining/blockchain-adapters';
import { prisma } from '@mining/database';
import {
  decryptWalletArtifact,
  encryptWalletArtifact,
} from '../apps/wallet-worker/src/artifact-crypto.js';
import { REGTEST_PAYOUT_ACK } from '../apps/wallet-worker/src/payout-boundary.js';
import { WalletPayoutExecutor } from '../apps/wallet-worker/src/payout-executor.js';
import { IsolatedSignerClient } from '../apps/wallet-worker/src/signer-client.js';

const EXPECTED_ACK = 'disposable-bitcoin-payout-regtest-only';
const rpcUrl = process.env.BITCOIN_REGTEST_RPC_URL ?? 'http://127.0.0.1:18443';
const rpcUser = process.env.BITCOIN_REGTEST_RPC_USER ?? 'miningplatform-regtest';
const rpcPassword =
  process.env.BITCOIN_REGTEST_RPC_PASSWORD ?? 'miningplatform-regtest-disposable-only';
const signerPort = Number(process.env.PAYOUT_REGTEST_SIGNER_PORT ?? 14100);
const require = createRequire(import.meta.url);

type AuthPrincipal = {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'OWNER';
  sessionId: string;
  authenticationType: 'access-token';
  scopes: string[];
};

type PayoutServiceRuntime = {
  request(
    principal: AuthPrincipal,
    input: { miningAccountId: string; amountAtomic: string; idempotencyKey: string },
  ): Promise<{ id: string; status: string }>;
  decide(
    principal: AuthPrincipal,
    input: {
      payoutId: string;
      decision: 'APPROVED' | 'REJECTED';
      reason: string;
      idempotencyKey: string;
    },
  ): Promise<{ id: string; status: string }>;
};

const { StepUpService } = require('../apps/api/dist/modules/auth/step-up.service.js') as {
  StepUpService: new () => unknown;
};
const { PayoutsService } = require('../apps/api/dist/modules/payouts/payouts.service.js') as {
  PayoutsService: new (stepUpService: unknown) => PayoutServiceRuntime;
};

function decimal(value: bigint): string {
  const whole = value / 100_000_000n;
  const fraction = (value % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function waitForSigner(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${signerPort}/health/ready`);
      if (response.ok) return;
    } catch {
      // The signer process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Isolated regtest signer did not become ready');
}

async function createWallet(
  node: BitcoinJsonRpcClient,
  name: string,
  disablePrivateKeys: boolean,
): Promise<BitcoinJsonRpcClient> {
  await node.call('createwallet', [name, disablePrivateKeys, false, '', false, true, false]);
  return new BitcoinJsonRpcClient({
    url: rpcUrl,
    username: rpcUser,
    password: rpcPassword,
    walletName: name,
    timeoutMilliseconds: 15_000,
    maximumResponseBytes: 16 * 1024 * 1024,
  });
}

async function importPublicDescriptors(
  signerWallet: BitcoinJsonRpcClient,
  watchWallet: BitcoinJsonRpcClient,
): Promise<void> {
  const listed = await signerWallet.call<{
    descriptors: Array<{
      desc: string;
      active?: boolean;
      internal?: boolean;
      range?: [number, number];
      next?: number;
    }>;
  }>('listdescriptors', [false]);
  const requests = listed.descriptors.map((descriptor) => ({
    desc: descriptor.desc,
    timestamp: 0,
    active: descriptor.active ?? false,
    internal: descriptor.internal ?? false,
    ...(descriptor.range ? { range: descriptor.range } : {}),
    ...(descriptor.next !== undefined ? { next_index: descriptor.next } : {}),
  }));
  const imported = await watchWallet.call<Array<{ success: boolean; error?: { message: string } }>>(
    'importdescriptors',
    [requests],
  );
  assert.equal(
    imported.every((entry) => entry.success),
    true,
    JSON.stringify(imported),
  );
}

async function ledgerBalance(ledgerAccountId: string, type: 'ASSET' | 'LIABILITY') {
  const totals = await prisma.journalLine.aggregate({
    where: {
      ledgerAccountId,
      journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
    },
    _sum: { debitAtomic: true, creditAtomic: true },
  });
  const debit = totals._sum.debitAtomic ?? 0n;
  const credit = totals._sum.creditAtomic ?? 0n;
  return type === 'ASSET' ? debit - credit : credit - debit;
}

async function main(): Promise<void> {
  if (process.env.PAYOUT_REGTEST_INTEGRATION_ACK !== EXPECTED_ACK) {
    throw new Error(`Set PAYOUT_REGTEST_INTEGRATION_ACK=${EXPECTED_ACK}`);
  }
  const parsedRpcUrl = new URL(rpcUrl);
  if (
    parsedRpcUrl.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(parsedRpcUrl.hostname)
  ) {
    throw new Error('Payout regtest integration requires a loopback Bitcoin RPC endpoint');
  }

  process.env.PAYOUTS_ENABLED = 'true';
  process.env.PAYOUT_REQUESTS_ENABLED = 'true';
  process.env.PAYOUT_SIGNING_ENABLED = 'true';
  process.env.PAYOUT_BROADCAST_ENABLED = 'true';
  process.env.PAYOUT_EXECUTION_NETWORK = 'regtest';
  process.env.PAYOUT_REGTEST_ACK = REGTEST_PAYOUT_ACK;
  process.env.PAYOUT_MAINNET_ENABLED = 'false';

  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const signerWalletName = `payout-signer-${suffix}`;
  const watchWalletName = `payout-watch-${suffix}`;
  const recipientWalletName = `payout-recipient-${suffix}`;
  const node = new BitcoinJsonRpcClient({
    url: rpcUrl,
    username: rpcUser,
    password: rpcPassword,
    timeoutMilliseconds: 15_000,
    maximumResponseBytes: 16 * 1024 * 1024,
  });
  const signerWallet = await createWallet(node, signerWalletName, false);
  const miningAddress = await signerWallet.call<string>('getnewaddress', [
    'payout-regtest-funding',
    'bech32',
  ]);
  const recipientWallet = await createWallet(node, recipientWalletName, false);
  const destination = await recipientWallet.call<string>('getnewaddress', [
    'payout-destination',
    'bech32',
  ]);
  const confirmationMiningAddress = await recipientWallet.call<string>('getnewaddress', [
    'confirmation-mining-sink',
    'bech32',
  ]);
  const reorgMiningAddress = await recipientWallet.call<string>('getnewaddress', [
    'reorg-mining-sink',
    'bech32',
  ]);
  await node.call('generatetoaddress', [1, miningAddress]);
  await node.call('generatetoaddress', [100, confirmationMiningAddress]);
  const watchWallet = await createWallet(node, watchWalletName, true);
  await importPublicDescriptors(signerWallet, watchWallet);
  assert.match(destination, /^bcrt1[0-9ac-hj-np-z]+$/);

  const watchAdapter = new BitcoinWatchOnlyRpcAdapter('regtest', watchWallet);
  const initialWalletSnapshot = await watchAdapter.getWalletSnapshot();
  const initialUtxoSnapshot = await watchAdapter.getConfirmedUtxoSnapshot();
  assert.equal(
    initialWalletSnapshot.confirmedBalanceAtomic,
    initialUtxoSnapshot.confirmedSolvableAtomic,
  );
  assert.equal(initialWalletSnapshot.confirmedBalanceAtomic > 0n, true);

  const btc = await prisma.asset.findUniqueOrThrow({ where: { symbol: 'BTC' } });
  const controlBefore = await prisma.payoutControl.findUniqueOrThrow({
    where: { assetId: btc.id },
  });
  await prisma.payoutControl.update({
    where: { assetId: btc.id },
    data: {
      paused: false,
      requestsEnabled: true,
      signingEnabled: true,
      broadcastEnabled: true,
      pauseReason: 'Disposable regtest integration has all execution gates explicitly enabled.',
      version: { increment: 1 },
    },
  });

  let signerProcess: ChildProcess | undefined;
  try {
    const feePolicy = await prisma.miningFeePolicy.findFirstOrThrow({
      where: { policyKey: 'platform-default', version: 1 },
    });
    const user = await prisma.user.create({
      data: {
        email: `payout-regtest-${suffix}@example.test`,
        passwordHash: 'REGTEST_ONLY',
        displayName: 'Payout Regtest User',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const approver = await prisma.user.create({
      data: {
        email: `payout-approver-${suffix}@example.test`,
        passwordHash: 'REGTEST_ONLY',
        displayName: 'Payout Regtest Checker',
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
        username: `payout_regtest_${suffix}`,
        platformFeePercent: '0.5',
      },
    });
    const network = await prisma.assetNetwork.create({
      data: {
        assetId: btc.id,
        networkKey: `bitcoin-regtest-${suffix}`,
        displayName: `Bitcoin Regtest ${suffix}`,
        chainFamily: 'BITCOIN',
        addressValidator: 'BITCOIN',
        isTestnet: true,
        enabled: true,
      },
    });
    const wallet = await prisma.wallet.create({
      data: {
        assetId: btc.id,
        type: 'HOT',
        name: `Regtest wallet ${suffix}`,
        rpcWalletName: watchWalletName,
        enabled: true,
        signerKeyReference: `regtest-key-${suffix}`,
        maximumSinglePayoutAtomic: 1_000_000n,
        dailyPayoutLimitAtomic: 5_000_000n,
        minimumReserveAtomic: 1_000_000n,
        lastReconciledAt: new Date(),
      },
    });
    const route = await prisma.payoutRoute.create({
      data: {
        assetNetworkId: network.id,
        payoutWalletId: wallet.id,
        routeKey: `regtest-${suffix}`,
        version: 1,
        status: 'PILOT',
        minimumPayoutAtomic: 10_000n,
        maximumPayoutAtomic: 1_000_000n,
        fixedNetworkFeeAtomic: 5_000n,
        addressCooldownSeconds: 0,
        requiredConfirmations: 3,
        manualApprovalRequired: true,
        effectiveFrom: new Date(Date.now() - 60_000),
        changeReason: 'Disposable Bitcoin regtest payout execution evidence.',
      },
    });
    const payoutAddress = await prisma.payoutAddress.create({
      data: {
        userId: user.id,
        assetId: btc.id,
        assetNetworkId: network.id,
        payoutRouteId: route.id,
        address: destination,
        addressHash: sha256(`${network.id}:${destination}`),
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
      data: { selectedPayoutAddressId: payoutAddress.id },
    });

    const hotWalletLedger = await prisma.ledgerAccount.findUniqueOrThrow({
      where: { code: 'BTC-HOT-WALLET' },
    });
    assert.equal(await ledgerBalance(hotWalletLedger.id, 'ASSET'), 0n);
    const clearing = await prisma.ledgerAccount.findUniqueOrThrow({
      where: { code: 'BTC-REWARD-CLEARING' },
    });
    const userLiability = await prisma.ledgerAccount.create({
      data: {
        code: `BTC-USER-LIABILITY-${user.id}`,
        name: 'BTC Regtest User Liability',
        type: 'LIABILITY',
        userId: user.id,
        assetId: btc.id,
      },
    });
    const userOpeningBalance = 300_000n;
    const fundingJournal = await prisma.$transaction(async (tx) => {
      const journal = await tx.journalEntry.create({
        data: {
          idempotencyKey: `payout-regtest-funding:${suffix}`,
          referenceType: 'RegtestFunding',
          referenceId: suffix,
          description: 'Mirror disposable regtest wallet and user liability in the ledger',
          correlationId: suffix,
          status: 'PENDING',
          effectiveAt: new Date(),
        },
      });
      for (const line of [
        {
          journalEntryId: journal.id,
          ledgerAccountId: hotWalletLedger.id,
          assetId: btc.id,
          debit: decimal(initialWalletSnapshot.confirmedBalanceAtomic),
          credit: '0',
          debitAtomic: initialWalletSnapshot.confirmedBalanceAtomic,
          creditAtomic: 0n,
        },
        {
          journalEntryId: journal.id,
          ledgerAccountId: clearing.id,
          assetId: btc.id,
          debit: '0',
          credit: decimal(initialWalletSnapshot.confirmedBalanceAtomic),
          debitAtomic: 0n,
          creditAtomic: initialWalletSnapshot.confirmedBalanceAtomic,
        },
        {
          journalEntryId: journal.id,
          ledgerAccountId: clearing.id,
          assetId: btc.id,
          debit: decimal(userOpeningBalance),
          credit: '0',
          debitAtomic: userOpeningBalance,
          creditAtomic: 0n,
        },
        {
          journalEntryId: journal.id,
          ledgerAccountId: userLiability.id,
          assetId: btc.id,
          debit: '0',
          credit: decimal(userOpeningBalance),
          debitAtomic: 0n,
          creditAtomic: userOpeningBalance,
        },
      ]) {
        await tx.journalLine.create({ data: line });
      }
      await tx.journalEntry.update({
        where: { id: journal.id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
      return journal;
    });
    await prisma.walletReconciliation.create({
      data: {
        idempotencyKey: `wallet-regtest-opening:${suffix}`,
        walletId: wallet.id,
        status: 'MATCHED',
        nodeBalanceAtomic: initialWalletSnapshot.confirmedBalanceAtomic,
        ledgerAssetAtomic: initialWalletSnapshot.confirmedBalanceAtomic,
        activeReservationAtomic: 0n,
        pendingBroadcastAtomic: 0n,
        varianceAtomic: 0n,
        chainHeight: initialWalletSnapshot.chainHeight,
        chainTipHash: initialWalletSnapshot.chainTipHash,
        evidenceDigest: sha256(initialUtxoSnapshot.outpointSetDigest),
      },
    });

    const userPrincipal: AuthPrincipal = {
      userId: user.id,
      email: user.email,
      role: 'USER',
      sessionId: `regtest-user-${suffix}`,
      authenticationType: 'access-token',
      scopes: ['*'],
    };
    const approverPrincipal: AuthPrincipal = {
      userId: approver.id,
      email: approver.email,
      role: 'ADMIN',
      sessionId: `regtest-approver-${suffix}`,
      authenticationType: 'access-token',
      scopes: ['*'],
    };
    const payouts = new PayoutsService(new StepUpService());
    const requestKey = `payout-regtest-request-${suffix}`;
    const requested = await payouts.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '100000',
      idempotencyKey: requestKey,
    });
    const requestRetry = await payouts.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '100000',
      idempotencyKey: requestKey,
    });
    assert.equal(requested.id, requestRetry.id);
    assert.equal(await prisma.payout.count({ where: { idempotencyKey: requestKey } }), 1);
    const approvalKey = `payout-regtest-approval-${suffix}`;
    const approved = await payouts.decide(approverPrincipal, {
      payoutId: requested.id,
      decision: 'APPROVED',
      reason: 'Disposable regtest payout evidence was reviewed by a separate checker.',
      idempotencyKey: approvalKey,
    });
    const approvalRetry = await payouts.decide(approverPrincipal, {
      payoutId: requested.id,
      decision: 'APPROVED',
      reason: 'Disposable regtest payout evidence was reviewed by a separate checker.',
      idempotencyKey: approvalKey,
    });
    assert.equal(approved.id, approvalRetry.id);
    assert.equal(approved.status, 'APPROVED');
    const approvedReservation = await prisma.balanceReservation.findUniqueOrThrow({
      where: { payoutId: requested.id },
    });
    await assert.rejects(
      prisma.balanceReservation.update({
        where: { id: approvedReservation.id },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      }),
      /Reservation consumption requires a posted payout settlement journal/,
    );
    assert.equal(
      (
        await prisma.balanceReservation.findUniqueOrThrow({
          where: { id: approvedReservation.id },
        })
      ).status,
      'ACTIVE',
    );

    const sharedSecret = `regtest-shared-${randomBytes(32).toString('hex')}`;
    signerProcess = spawn(process.execPath, ['apps/transaction-signer/dist/main.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SIGNER_ENABLED: 'true',
        SIGNER_HOST: '127.0.0.1',
        SIGNER_PORT: String(signerPort),
        SIGNER_SHARED_SECRET: sharedSecret,
        SIGNER_KEY_ALLOWLIST_JSON: JSON.stringify({
          [`regtest-key-${suffix}`]: signerWalletName,
        }),
        SIGNER_REQUIRE_MTLS: 'false',
        SIGNER_ALLOW_WITHOUT_MTLS: 'true',
        BITCOIN_SIGNER_RPC_URL: rpcUrl,
        BITCOIN_SIGNER_RPC_USER: rpcUser,
        BITCOIN_SIGNER_RPC_PASSWORD: rpcPassword,
        BITCOIN_SIGNER_RPC_ALLOW_INSECURE_HTTP: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let signerErrors = '';
    signerProcess.stderr?.on('data', (chunk) => {
      signerErrors += String(chunk);
    });
    await waitForSigner();
    const signerClient = new IsolatedSignerClient({
      url: `http://127.0.0.1:${signerPort}`,
      sharedSecret,
      allowInsecureHttp: true,
    });
    const artifactEncryptionKey = randomBytes(32);
    const executor = new WalletPayoutExecutor({
      adapter: watchAdapter,
      signer: signerClient,
      artifactEncryptionKey,
      batchSize: 5,
    });
    const firstRun = await executor.runOnce();
    assert.deepEqual(firstRun.errors, []);
    assert.equal(firstRun.broadcast, 1);
    const afterBroadcast = await prisma.payout.findUniqueOrThrow({ where: { id: requested.id } });
    assert.equal(afterBroadcast.status, 'CONFIRMING');
    assert.match(afterBroadcast.transactionId ?? '', /^[0-9a-f]{64}$/);
    const retryRun = await executor.runOnce();
    assert.deepEqual(retryRun.errors, []);
    assert.equal(
      await prisma.broadcastAttempt.count({
        where: { payoutId: requested.id, status: 'SUCCEEDED' },
      }),
      1,
    );

    assert.equal(
      await prisma.walletTransaction.count({
        where: { transactionId: afterBroadcast.transactionId! },
      }),
      0,
    );

    await node.call('generatetoaddress', [3, confirmationMiningAddress]);
    const completionRun = await executor.runOnce();
    assert.deepEqual(completionRun.errors, [], signerErrors);
    assert.equal(completionRun.completed, 1);
    const completed = await prisma.payout.findUniqueOrThrow({
      where: { id: requested.id },
      include: {
        reservation: true,
        reconciliations: true,
        signingRequest: true,
        broadcastAttempts: true,
        chainObservations: true,
        journalEntry: { include: { lines: true } },
      },
    });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.reservation?.status, 'CONSUMED');
    assert.equal(
      completed.reconciliations.some((entry) => entry.status === 'MATCHED'),
      true,
    );
    assert.equal(completed.signingRequest?.status, 'SIGNED');
    assert.equal(
      completed.broadcastAttempts.filter((entry) => entry.status === 'SUCCEEDED').length,
      1,
    );
    assert.equal(
      completed.chainObservations.some((entry) => entry.confirmations >= 3),
      true,
    );
    assert.equal(
      completed.journalEntry?.lines.reduce(
        (sum, line) => sum + line.debitAtomic - line.creditAtomic,
        0n,
      ),
      0n,
    );
    await assert.rejects(
      prisma.payout.update({
        where: { id: completed.id },
        data: { journalEntryId: null, rowVersion: { increment: 1 } },
      }),
      /Completed payout requires matched reconciliation and posted settlement evidence/,
    );
    const actualFee = completed.reconciliations.find(
      (entry) => entry.status === 'MATCHED',
    )!.networkFeeAtomic;
    assert.equal(
      await ledgerBalance(userLiability.id, 'LIABILITY'),
      userOpeningBalance - 100_000n - actualFee,
    );
    const reservedLedger = await prisma.ledgerAccount.findUniqueOrThrow({
      where: { id: completed.reservation!.reservedLedgerAccountId },
    });
    assert.equal(await ledgerBalance(reservedLedger.id, 'LIABILITY'), 0n);
    const finalSnapshot = await watchAdapter.getWalletSnapshot();
    assert.equal(
      await ledgerBalance(hotWalletLedger.id, 'ASSET'),
      finalSnapshot.confirmedBalanceAtomic,
    );
    const received = await recipientWallet.call<number>('getreceivedbyaddress', [destination, 1]);
    assert.equal(bitcoinToAtomic(received), 100_000n);

    const settlementJournalCount = await prisma.journalEntry.count({
      where: { referenceType: 'PayoutSettlement', referenceId: requested.id },
    });
    const confirmationBlock = completed.chainObservations
      .filter((entry) => entry.status === 'CONFIRMED' && entry.blockHash)
      .sort((left, right) => right.confirmations - left.confirmations)[0]?.blockHash;
    assert.match(confirmationBlock ?? '', /^[0-9a-f]{64}$/);
    assert.equal(await node.callNullable('invalidateblock', [confirmationBlock]), null);
    const regressionRun = await executor.runOnce();
    assert.deepEqual(regressionRun.errors, []);
    const regressed = await prisma.payout.findUniqueOrThrow({ where: { id: requested.id } });
    assert.equal(regressed.status, 'CONFIRMING');
    assert.ok(regressed.reorgDetectedAt);
    assert.equal(regressed.reconfirmationCount, 0);
    assert.equal(
      await prisma.payoutReconciliation.count({
        where: { payoutId: requested.id, status: 'EXCEPTION' },
      }),
      1,
    );
    await node.call('generatetoaddress', [3, reorgMiningAddress]);
    const reconfirmationRun = await executor.runOnce();
    assert.deepEqual(reconfirmationRun.errors, []);
    assert.equal(reconfirmationRun.completed, 1);
    const reconfirmed = await prisma.payout.findUniqueOrThrow({ where: { id: requested.id } });
    assert.equal(reconfirmed.status, 'COMPLETED');
    assert.equal(reconfirmed.reconfirmationCount, 1);
    assert.equal(
      await prisma.journalEntry.count({
        where: { referenceType: 'PayoutSettlement', referenceId: requested.id },
      }),
      settlementJournalCount,
    );
    assert.equal(
      await ledgerBalance(userLiability.id, 'LIABILITY'),
      userOpeningBalance - 100_000n - actualFee,
    );
    assert.equal(
      await prisma.broadcastAttempt.count({
        where: { payoutId: requested.id, status: 'SUCCEEDED' },
      }),
      1,
    );
    const finalRetry = await executor.runOnce();
    assert.deepEqual(finalRetry.errors, []);
    assert.equal(await prisma.payout.count({ where: { idempotencyKey: requestKey } }), 1);
    assert.equal(
      await prisma.broadcastAttempt.count({
        where: { payoutId: requested.id, status: 'SUCCEEDED' },
      }),
      1,
    );

    const legacyRequest = await payouts.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '20000',
      idempotencyKey: `payout-regtest-legacy-ambiguity-${suffix}`,
    });
    await payouts.decide(approverPrincipal, {
      payoutId: legacyRequest.id,
      decision: 'APPROVED',
      reason: 'Exercise safe recovery of pre-intent-digest raw transaction evidence.',
      idempotencyKey: `payout-regtest-legacy-ambiguity-approval-${suffix}`,
    });
    const broadcastRawTransaction = watchAdapter.broadcastRawTransaction.bind(watchAdapter);
    watchAdapter.broadcastRawTransaction = async (rawTransaction) => {
      await broadcastRawTransaction(rawTransaction);
      throw new Error('Simulated response loss after Bitcoin Core accepted the transaction');
    };
    const ambiguousLegacyRun = await executor.runOnce();
    watchAdapter.broadcastRawTransaction = broadcastRawTransaction;
    assert.equal(ambiguousLegacyRun.errors.length, 1);
    const legacySigning = await prisma.signingRequest.findUniqueOrThrow({
      where: { payoutId: legacyRequest.id },
    });
    assert.equal(
      await prisma.broadcastAttempt.count({
        where: { payoutId: legacyRequest.id, status: 'UNKNOWN' },
      }),
      1,
    );
    const artifactContext = `payout:${legacyRequest.id}:manifest:${legacySigning.manifestDigest}`;
    const legacyArtifacts = JSON.parse(
      decryptWalletArtifact(
        legacySigning.signedArtifactReference!,
        artifactEncryptionKey,
        artifactContext,
      ),
    ) as Record<string, unknown>;
    delete legacyArtifacts.transactionIntentDigest;
    await prisma.signingRequest.update({
      where: { id: legacySigning.id },
      data: {
        signedArtifactReference: encryptWalletArtifact(
          JSON.stringify(legacyArtifacts),
          artifactEncryptionKey,
          artifactContext,
        ),
      },
    });
    const recoveredLegacyRun = await executor.runOnce();
    assert.deepEqual(recoveredLegacyRun.errors, []);
    assert.equal(recoveredLegacyRun.broadcast, 1);
    assert.equal(
      (
        await prisma.payout.findUniqueOrThrow({
          where: { id: legacyRequest.id },
        })
      ).status,
      'CONFIRMING',
    );
    assert.equal(
      await prisma.broadcastAttempt.count({
        where: { payoutId: legacyRequest.id, status: 'SUCCEEDED' },
      }),
      1,
    );
    await node.call('generatetoaddress', [3, confirmationMiningAddress]);
    const completedLegacyRun = await executor.runOnce();
    assert.deepEqual(completedLegacyRun.errors, []);
    assert.equal(completedLegacyRun.completed, 1);

    const revokedRequest = await payouts.request(userPrincipal, {
      miningAccountId: account.id,
      amountAtomic: '20000',
      idempotencyKey: `payout-regtest-revocation-${suffix}`,
    });
    await payouts.decide(approverPrincipal, {
      payoutId: revokedRequest.id,
      decision: 'APPROVED',
      reason: 'Exercise the post-signer scoped revocation boundary.',
      idempotencyKey: `payout-regtest-revocation-approval-${suffix}`,
    });
    let destinationRevoked = false;
    let revocationBlockedWhileSignerActive = false;
    let revocationPromise: Promise<void> | undefined;
    const revocationExecutor = new WalletPayoutExecutor({
      adapter: watchAdapter,
      signer: {
        sign: async (request) => {
          const response = await signerClient.sign(request);
          if (!revocationPromise) {
            revocationPromise = prisma.$transaction(async (tx) => {
              await tx.miningAccount.update({
                where: { id: account.id },
                data: { selectedPayoutAddressId: null },
              });
              await tx.payoutAddress.update({
                where: { id: payoutAddress.id },
                data: { status: 'DISABLED', active: false, disabledAt: new Date() },
              });
              destinationRevoked = true;
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            revocationBlockedWhileSignerActive = !destinationRevoked;
          }
          return response;
        },
      },
      artifactEncryptionKey: randomBytes(32),
      batchSize: 5,
    });
    const revokedRun = await revocationExecutor.runOnce();
    await revocationPromise;
    assert.deepEqual(revokedRun.errors, []);
    assert.equal(revocationBlockedWhileSignerActive, true);
    assert.equal(revokedRun.broadcast, 0);
    const quarantined = await prisma.payout.findUniqueOrThrow({
      where: { id: revokedRequest.id },
      include: { reservation: true, signingRequest: true, broadcastAttempts: true },
    });
    assert.equal(quarantined.status, 'SIGNING');
    assert.equal(quarantined.failureCode, 'PAYOUT_DESTINATION_REVOKED');
    assert.equal(quarantined.signingRequest?.status, 'FAILED');
    assert.equal(quarantined.reservation?.status, 'ACTIVE');
    assert.equal(quarantined.broadcastAttempts.length, 0);
    assert.equal(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: revokedRequest.id,
          eventName: 'payout.execution.quarantined.v1',
        },
      }),
      1,
    );
  } finally {
    signerProcess?.kill('SIGTERM');
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
    await prisma.$disconnect();
  }
}

await main();
