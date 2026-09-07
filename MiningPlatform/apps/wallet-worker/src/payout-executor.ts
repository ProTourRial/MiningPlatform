/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import type {
  BitcoinWatchOnlyRpcAdapter,
  BitcoinChainObservation,
  BitcoinUtxoSnapshot,
  BitcoinWalletSnapshot,
} from '@mining/blockchain-adapters';
import { prisma, type Prisma } from '@mining/database';
import {
  digestSigningManifest,
  sha256Hex,
  type SignerRequestV1,
  type SigningManifestV1,
} from '@mining/signer-protocol';
import { decryptWalletArtifact, encryptWalletArtifact } from './artifact-crypto.js';
import { assertPayoutActionControl, assertRegtestPayoutBoundary } from './payout-boundary.js';
import type { IsolatedSignerClient } from './signer-client.js';

type StoredPayoutArtifacts = {
  version: 1;
  unsignedPsbt?: string;
  signedPsbt?: string;
  rawTransaction?: string;
  rawTransactionDigest?: string;
};

export type PayoutExecutorOptions = {
  adapter: BitcoinWatchOnlyRpcAdapter;
  signer: IsolatedSignerClient;
  artifactEncryptionKey: Buffer;
  maximumSigningAttempts?: number;
  batchSize?: number;
};

export type PayoutExecutorRunResult = {
  prepared: number;
  signed: number;
  broadcast: number;
  observed: number;
  completed: number;
  deferred: number;
  errors: Array<{ payoutId: string; message: string }>;
};

function digest(value: unknown): string {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_key, entry: unknown) =>
        typeof entry === 'bigint' ? entry.toString() : entry,
      ),
    )
    .digest('hex');
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown payout executor error';
}

function atomicToDecimal(value: bigint, decimals: number): string {
  if (value < 0n) throw new Error('Atomic amount cannot be negative');
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function artifactBinding(payoutId: string, manifestDigest: string): string {
  if (!payoutId || !/^[0-9a-f]{64}$/.test(manifestDigest)) {
    throw new Error('Payout artifact binding is invalid');
  }
  return `payout:${payoutId}:manifest:${manifestDigest}`;
}

function parseArtifacts(
  encrypted: string | null,
  key: Buffer,
  payoutId: string,
  manifestDigest: string,
): StoredPayoutArtifacts {
  if (!encrypted) throw new Error('Encrypted payout artifacts are missing');
  const parsed = JSON.parse(
    decryptWalletArtifact(encrypted, key, artifactBinding(payoutId, manifestDigest)),
  ) as StoredPayoutArtifacts;
  if (
    parsed.version !== 1 ||
    (!parsed.unsignedPsbt && !parsed.signedPsbt && !parsed.rawTransaction)
  ) {
    throw new Error('Encrypted payout artifacts are invalid');
  }
  return parsed;
}

function encryptArtifacts(
  artifacts: StoredPayoutArtifacts,
  key: Buffer,
  payoutId: string,
  manifestDigest: string,
): string {
  return encryptWalletArtifact(
    JSON.stringify(artifacts),
    key,
    artifactBinding(payoutId, manifestDigest),
  );
}

function parseManifest(value: Prisma.JsonValue): SigningManifestV1 {
  const manifest = value as unknown as SigningManifestV1;
  if (manifest.version !== 1 || manifest.network !== 'regtest' || manifest.asset !== 'BTC') {
    throw new Error('Stored signing manifest is outside the regtest payout boundary');
  }
  return manifest;
}

function isRegtestNetwork(network: { networkKey: string; isTestnet: boolean }): boolean {
  return network.isTestnet && /(^|[-_:])regtest($|[-_:])/i.test(network.networkKey);
}

async function ledgerBalanceAtomic(
  tx: Prisma.TransactionClient,
  ledgerAccountId: string,
  type: 'ASSET' | 'LIABILITY',
): Promise<bigint> {
  const balance = await tx.journalLine.aggregate({
    where: {
      ledgerAccountId,
      journalEntry: { status: { in: ['POSTED', 'REVERSED'] } },
    },
    _sum: { debitAtomic: true, creditAtomic: true },
  });
  const debit = balance._sum.debitAtomic ?? 0n;
  const credit = balance._sum.creditAtomic ?? 0n;
  return type === 'ASSET' ? debit - credit : credit - debit;
}

export class WalletPayoutExecutor {
  private readonly maximumSigningAttempts: number;
  private readonly batchSize: number;

  constructor(private readonly options: PayoutExecutorOptions) {
    if (options.artifactEncryptionKey.length !== 32) {
      throw new Error('Wallet artifact encryption key must be 32 bytes');
    }
    this.maximumSigningAttempts = options.maximumSigningAttempts ?? 3;
    this.batchSize = options.batchSize ?? 20;
    if (!Number.isInteger(this.maximumSigningAttempts) || this.maximumSigningAttempts < 1) {
      throw new Error('Maximum signing attempts must be a positive integer');
    }
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 100) {
      throw new Error('Wallet executor batch size must be between 1 and 100');
    }
  }

  async runOnce(): Promise<PayoutExecutorRunResult> {
    assertRegtestPayoutBoundary();
    const reorgMonitorConfirmations = Number(process.env.PAYOUT_REORG_MONITOR_CONFIRMATIONS ?? 100);
    if (!Number.isInteger(reorgMonitorConfirmations) || reorgMonitorConfirmations < 1) {
      throw new Error('PAYOUT_REORG_MONITOR_CONFIRMATIONS must be a positive integer');
    }
    const result: PayoutExecutorRunResult = {
      prepared: 0,
      signed: 0,
      broadcast: 0,
      observed: 0,
      completed: 0,
      deferred: 0,
      errors: [],
    };
    const activeCandidates = await prisma.payout.findMany({
      where: {
        executionVersion: 2,
        status: { in: ['APPROVED', 'SIGNING', 'BROADCAST', 'CONFIRMING'] },
        asset: { symbol: 'BTC', enabled: true },
        payoutAddress: {
          assetNetwork: {
            isTestnet: true,
            enabled: true,
            networkKey: { contains: 'regtest', mode: 'insensitive' },
          },
        },
      },
      select: { id: true, status: true },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
    });
    const completedCandidates = await prisma.payout.findMany({
      where: {
        executionVersion: 2,
        status: 'COMPLETED',
        asset: { symbol: 'BTC', enabled: true },
        payoutAddress: {
          assetNetwork: {
            isTestnet: true,
            enabled: true,
            networkKey: { contains: 'regtest', mode: 'insensitive' },
          },
        },
        chainObservations: {
          none: { status: 'CONFIRMED', confirmations: { gte: reorgMonitorConfirmations } },
        },
      },
      select: { id: true, status: true },
      orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
    });
    const candidates = [...activeCandidates, ...completedCandidates];
    for (const candidate of candidates) {
      try {
        if (candidate.status === 'COMPLETED') {
          const regressed = await this.monitorCompletedPayout(candidate.id);
          result.observed += 1;
          if (regressed) result.deferred += 1;
          continue;
        }
        if (candidate.status === 'APPROVED') {
          const prepared = await this.prepareSigning(candidate.id);
          if (prepared) result.prepared += 1;
        }
        const signing = await prisma.payout.findUnique({
          where: { id: candidate.id },
          select: { status: true },
        });
        if (signing?.status === 'SIGNING') {
          const signingResult = await this.signAndBroadcast(candidate.id);
          if (signingResult.signed) result.signed += 1;
          if (signingResult.broadcast) result.broadcast += 1;
          if (!signingResult.broadcast) result.deferred += 1;
        }
        const current = await prisma.payout.findUnique({
          where: { id: candidate.id },
          select: { status: true },
        });
        if (current?.status === 'BROADCAST') {
          await this.advanceBroadcastToConfirming(candidate.id);
        }
        const confirming = await prisma.payout.findUnique({
          where: { id: candidate.id },
          select: { status: true },
        });
        if (confirming?.status === 'CONFIRMING') {
          const completed = await this.observeAndReconcile(candidate.id);
          result.observed += 1;
          if (completed) result.completed += 1;
          else result.deferred += 1;
        }
      } catch (error) {
        result.errors.push({ payoutId: candidate.id, message: asErrorMessage(error) });
      }
    }
    return result;
  }

  private async prepareSigning(payoutId: string): Promise<boolean> {
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, executionVersion: 2, status: 'APPROVED' },
      include: {
        asset: { include: { payoutControls: true } },
        payoutAddress: { include: { assetNetwork: true } },
        payoutRoute: { include: { payoutWallet: true } },
        reservation: true,
        approvals: true,
        signingRequest: true,
      },
    });
    if (!payout) return false;
    if (
      payout.asset.symbol !== 'BTC' ||
      !payout.asset.enabled ||
      !payout.payoutAddress.assetNetwork.enabled ||
      !isRegtestNetwork(payout.payoutAddress.assetNetwork)
    ) {
      throw new Error('Wallet executor rejected a non-regtest payout');
    }
    assertPayoutActionControl(payout.asset.payoutControls[0], 'prepare');
    if (!payout.approvals.some((approval) => approval.decision === 'APPROVED')) {
      throw new Error('Payout does not have maker/checker approval evidence');
    }
    if (!payout.reservation || payout.reservation.status !== 'ACTIVE') {
      throw new Error('Payout does not have an active balance reservation');
    }
    const wallet = payout.payoutRoute.payoutWallet;
    if (!wallet?.enabled || !wallet.signerKeyReference) {
      throw new Error('Payout route has no enabled isolated-signer wallet');
    }
    if (payout.signingRequest) return false;
    const activeWalletPayout = await prisma.payout.findFirst({
      where: {
        id: { not: payout.id },
        status: { in: ['SIGNING', 'BROADCAST', 'CONFIRMING'] },
        payoutRoute: { payoutWalletId: wallet.id },
      },
      select: { id: true },
    });
    if (activeWalletPayout) return false;
    const amountAtomic = payout.amountAtomic;
    if (!amountAtomic) throw new Error('Controlled payout amount is missing');
    const prepared = await this.options.adapter.preparePayout({
      address: payout.payoutAddress.address,
      amountAtomic,
      maximumNetworkFeeAtomic: payout.networkFeeAtomic,
      feeRateSatPerVbyte: Number(process.env.PAYOUT_REGTEST_FEE_RATE_SAT_VBYTE ?? 1),
    });
    const requestId = `sign-${randomUUID()}`;
    const manifest: SigningManifestV1 = {
      version: 1,
      requestId,
      payoutId: payout.id,
      asset: 'BTC',
      network: 'regtest',
      keyReference: wallet.signerKeyReference,
      destination: payout.payoutAddress.address,
      destinationAmountAtomic: amountAtomic.toString(),
      reservedNetworkFeeAtomic: payout.networkFeeAtomic.toString(),
      actualNetworkFeeAtomic: prepared.actualNetworkFeeAtomic.toString(),
      psbtDigest: prepared.psbtDigest,
      unsignedTransactionDigest: prepared.unsignedTransactionDigest,
      expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(),
    };
    const manifestDigest = digestSigningManifest(manifest);
    const encryptedArtifacts = encryptArtifacts(
      { version: 1, unsignedPsbt: prepared.psbt },
      this.options.artifactEncryptionKey,
      payout.id,
      manifestDigest,
    );
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payout-wallet:${wallet.id}`}, 0))::text AS "lock"`;
        const walletAlreadyBusy = await tx.payout.findFirst({
          where: {
            id: { not: payout.id },
            status: { in: ['SIGNING', 'BROADCAST', 'CONFIRMING'] },
            payoutRoute: { payoutWalletId: wallet.id },
          },
          select: { id: true },
        });
        if (walletAlreadyBusy) throw new Error('PAYOUT_WALLET_BUSY');
        const claimed = await tx.payout.findFirst({
          where: { id: payout.id, status: 'APPROVED', signingRequest: null },
          select: { id: true },
        });
        if (!claimed) throw new Error('Payout was claimed by another executor');
        await tx.signingRequest.create({
          data: {
            idempotencyKey: `payout-signing:${payout.id}:v1`,
            payoutId: payout.id,
            signerKeyReference: wallet.signerKeyReference!,
            manifest: manifest as unknown as Prisma.InputJsonValue,
            manifestDigest,
            status: 'PENDING',
            unsignedTransactionDigest: prepared.unsignedTransactionDigest,
            signedArtifactReference: encryptedArtifacts,
          },
        });
        await tx.payout.update({
          where: { id: payout.id },
          data: { status: 'SIGNING', signingAt: new Date(), rowVersion: { increment: 1 } },
        });
        await tx.outboxEvent.create({
          data: {
            eventId: randomUUID(),
            eventName: 'payout.signing.started.v1',
            eventVersion: 1,
            producer: 'wallet-worker',
            aggregateType: 'Payout',
            aggregateId: payout.id,
            correlationId: payout.id,
            idempotencyKey: `payout-signing-started:${payout.id}:v1`,
            payload: { payoutId: payout.id, manifestDigest, network: 'regtest' },
            occurredAt: new Date(),
          },
        });
      });
      return true;
    } catch (error) {
      await this.options.adapter.releasePsbtInputs(prepared.psbt).catch(() => undefined);
      if (
        /PAYOUT_WALLET_BUSY|claimed by another executor|Unique constraint/i.test(
          asErrorMessage(error),
        )
      )
        return false;
      throw error;
    }
  }

  private async signAndBroadcast(
    payoutId: string,
  ): Promise<{ signed: boolean; broadcast: boolean }> {
    const record = await prisma.signingRequest.findUnique({ where: { payoutId } });
    if (!record) throw new Error('Signing evidence is missing');
    let signed = record.status === 'SIGNED';
    if (!signed) {
      if (!['PENDING', 'SUBMITTED'].includes(record.status)) {
        throw new Error(`Signing request cannot be resumed from ${record.status}`);
      }
      const manifest = parseManifest(record.manifest);
      if (new Date(manifest.expiresAt).getTime() <= Date.now()) {
        await this.failBeforeBroadcast(
          payoutId,
          'SIGNING_MANIFEST_EXPIRED',
          'Signing manifest expired before completion.',
        );
        return { signed: false, broadcast: false };
      }
      const artifacts = parseArtifacts(
        record.signedArtifactReference,
        this.options.artifactEncryptionKey,
        record.payoutId,
        record.manifestDigest,
      );
      if (!artifacts.unsignedPsbt) throw new Error('Unsigned PSBT artifact is missing');
      await this.assertDatabaseActionAllowed(payoutId, 'sign');
      const submitted = await prisma.signingRequest.update({
        where: { id: record.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: record.submittedAt ?? new Date(),
          attemptCount: { increment: 1 },
          failureCode: null,
          failureMessage: null,
        },
      });
      const request: SignerRequestV1 = {
        manifest,
        manifestDigest: record.manifestDigest,
        psbt: artifacts.unsignedPsbt,
      };
      try {
        const response = await this.options.signer.sign(request);
        if (!response.complete) {
          await this.failBeforeBroadcast(
            payoutId,
            'SIGNER_INCOMPLETE_PSBT',
            'Isolated signer did not complete every required signature.',
          );
          return { signed: false, broadcast: false };
        }
        const signedArtifacts: StoredPayoutArtifacts = {
          version: 1,
          signedPsbt: response.signedPsbt,
        };
        await prisma.signingRequest.update({
          where: { id: record.id },
          data: {
            status: 'SIGNED',
            signedAt: new Date(),
            signedTransactionDigest: response.signedPsbtDigest,
            signedArtifactReference: encryptArtifacts(
              signedArtifacts,
              this.options.artifactEncryptionKey,
              record.payoutId,
              record.manifestDigest,
            ),
          },
        });
        signed = true;
      } catch (error) {
        if (submitted.attemptCount >= this.maximumSigningAttempts) {
          await this.failBeforeBroadcast(
            payoutId,
            'SIGNER_RETRY_EXHAUSTED',
            `Isolated signer retry budget exhausted: ${asErrorMessage(error)}`,
          );
          return { signed: false, broadcast: false };
        }
        await prisma.signingRequest.update({
          where: { id: record.id },
          data: { failureCode: 'SIGNER_RETRY_PENDING', failureMessage: asErrorMessage(error) },
        });
        throw error;
      }
    }
    return { signed, broadcast: await this.broadcastSignedPayout(payoutId) };
  }

  private async broadcastSignedPayout(payoutId: string): Promise<boolean> {
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, status: 'SIGNING' },
      include: { signingRequest: true, broadcastAttempts: { orderBy: { attemptedAt: 'asc' } } },
    });
    if (!payout) return false;
    const signing = payout.signingRequest;
    if (!signing || signing.status !== 'SIGNED')
      throw new Error('Signed payout artifact is missing');
    const artifacts = parseArtifacts(
      signing.signedArtifactReference,
      this.options.artifactEncryptionKey,
      payout.id,
      signing.manifestDigest,
    );
    let rawTransaction = artifacts.rawTransaction;
    let rawTransactionDigest = artifacts.rawTransactionDigest;
    if (!rawTransaction || !rawTransactionDigest) {
      if (!artifacts.signedPsbt) throw new Error('Signed PSBT artifact is missing');
      if (
        !signing.signedTransactionDigest ||
        sha256Hex(artifacts.signedPsbt) !== signing.signedTransactionDigest
      ) {
        throw new Error('Signed PSBT artifact digest does not match signing evidence');
      }
      const finalized = await this.options.adapter.finalizeSignedPsbt(artifacts.signedPsbt);
      rawTransaction = finalized.rawTransaction;
      rawTransactionDigest = finalized.rawTransactionDigest;
      await prisma.signingRequest.update({
        where: { id: signing.id },
        data: {
          signedArtifactReference: encryptArtifacts(
            { version: 1, rawTransaction, rawTransactionDigest },
            this.options.artifactEncryptionKey,
            payout.id,
            signing.manifestDigest,
          ),
        },
      });
    }
    if (sha256Hex(rawTransaction.toLowerCase()) !== rawTransactionDigest) {
      throw new Error('Raw transaction artifact digest does not match signing evidence');
    }
    const expectedTransactionId = await this.options.adapter.decodeRawTransactionId(rawTransaction);
    const successful = payout.broadcastAttempts.find((attempt) => attempt.status === 'SUCCEEDED');
    if (successful) {
      if (successful.transactionId !== expectedTransactionId) {
        throw new Error('Successful broadcast evidence is bound to another transaction');
      }
      await this.advanceBroadcastToConfirming(payout.id);
      return true;
    }
    await this.assertDatabaseActionAllowed(payout.id, 'broadcast');
    let attempt = payout.broadcastAttempts.find((entry) => entry.status === 'PENDING');
    if (!attempt) {
      attempt = await prisma.broadcastAttempt.create({
        data: {
          idempotencyKey: `payout-broadcast:${payout.id}:attempt-${
            payout.broadcastAttempts.length + 1
          }`,
          payoutId: payout.id,
          signingRequestId: signing.id,
          provider: 'bitcoin-core-regtest',
          requestDigest: rawTransactionDigest,
          status: 'PENDING',
        },
      });
    }
    try {
      const previousObservation = await this.options.adapter.getTransactionObservation(
        expectedTransactionId,
      );
      const transactionId =
        previousObservation.status === 'DROPPED'
          ? await (async () => {
              await this.options.adapter.assertMempoolAcceptance(rawTransaction!);
              return this.options.adapter.broadcastRawTransaction(rawTransaction!);
            })()
          : expectedTransactionId;
      if (transactionId !== expectedTransactionId) {
        throw new Error('Bitcoin Core broadcast returned an unexpected transaction id');
      }
      await prisma.$transaction(async (tx) => {
        await tx.broadcastAttempt.update({
          where: { id: attempt!.id },
          data: {
            status: 'SUCCEEDED',
            transactionId,
            responseDigest: sha256Hex(transactionId),
            completedAt: new Date(),
          },
        });
        const current = await tx.payout.findUniqueOrThrow({ where: { id: payout.id } });
        if (current.status === 'SIGNING') {
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              status: 'BROADCAST',
              transactionId,
              broadcastAt: new Date(),
              rowVersion: { increment: 1 },
            },
          });
        }
        await tx.outboxEvent.create({
          data: {
            eventId: randomUUID(),
            eventName: 'wallet.transaction.broadcast.v1',
            eventVersion: 1,
            producer: 'wallet-worker',
            aggregateType: 'Payout',
            aggregateId: payout.id,
            correlationId: payout.id,
            idempotencyKey: `payout-broadcast-succeeded:${payout.id}:v1`,
            payload: { payoutId: payout.id, transactionId, network: 'regtest' },
            occurredAt: new Date(),
          },
        });
      });
      await this.advanceBroadcastToConfirming(payout.id);
      return true;
    } catch (error) {
      await prisma.broadcastAttempt
        .update({
          where: { id: attempt.id },
          data: {
            status: 'UNKNOWN',
            failureCode: 'BROADCAST_RESULT_AMBIGUOUS',
            failureMessage: asErrorMessage(error),
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async advanceBroadcastToConfirming(payoutId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id: payoutId } });
      if (!payout || payout.status === 'CONFIRMING' || payout.status === 'COMPLETED') return;
      if (payout.status !== 'BROADCAST') return;
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'CONFIRMING', confirmingAt: new Date(), rowVersion: { increment: 1 } },
      });
    });
  }

  private async observeAndReconcile(payoutId: string): Promise<boolean> {
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, status: 'CONFIRMING', transactionId: { not: null } },
      include: {
        asset: true,
        payoutRoute: { include: { payoutWallet: true } },
        reservation: true,
        signingRequest: true,
      },
    });
    if (!payout?.transactionId) return false;
    const observation = await this.options.adapter.getTransactionObservation(payout.transactionId);
    await this.persistChainObservation(payout.id, payout.transactionId, observation);
    if (
      observation.status !== 'CONFIRMED' ||
      observation.confirmations < payout.payoutRoute.requiredConfirmations
    ) {
      if (observation.status === 'DROPPED') {
        await this.rebroadcastExactTransaction(payout.id, payout.transactionId);
      }
      return false;
    }
    const wallet = payout.payoutRoute.payoutWallet;
    if (!wallet) throw new Error('Confirmed payout route wallet is missing');
    const manifest = payout.signingRequest ? parseManifest(payout.signingRequest.manifest) : null;
    if (!manifest) throw new Error('Confirmed payout signing manifest is missing');
    const actualNetworkFeeAtomic = BigInt(manifest.actualNetworkFeeAtomic);
    const [walletSnapshot, utxoSnapshot] = await Promise.all([
      this.options.adapter.getWalletSnapshot(),
      this.options.adapter.getConfirmedUtxoSnapshot(),
    ]);
    if (walletSnapshot.initialBlockDownload || walletSnapshot.verificationProgress < 0.999) {
      throw new Error('Bitcoin regtest watch node is not synchronized');
    }
    return this.completeReconciledPayout(
      payout.id,
      actualNetworkFeeAtomic,
      walletSnapshot,
      utxoSnapshot,
      observation,
    );
  }

  private async monitorCompletedPayout(payoutId: string): Promise<boolean> {
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, status: 'COMPLETED', transactionId: { not: null } },
      include: { payoutRoute: true, signingRequest: true },
    });
    if (!payout?.transactionId) return false;
    const observation = await this.options.adapter.getTransactionObservation(payout.transactionId);
    await this.persistChainObservation(payout.id, payout.transactionId, observation);
    if (
      observation.status === 'CONFIRMED' &&
      observation.confirmations >= payout.payoutRoute.requiredConfirmations
    ) {
      return false;
    }
    const manifest = payout.signingRequest ? parseManifest(payout.signingRequest.manifest) : null;
    if (!manifest || !payout.amountAtomic) {
      throw new Error('Completed payout is missing immutable signing evidence');
    }
    const actualNetworkFeeAtomic = BigInt(manifest.actualNetworkFeeAtomic);
    const evidence = {
      payoutId: payout.id,
      transactionId: payout.transactionId,
      previousCompletedAt: payout.completedAt?.toISOString() ?? null,
      observation: {
        ...observation,
        blockHeight: observation.blockHeight?.toString() ?? null,
      },
    };
    const evidenceDigest = digest(evidence);
    await prisma.$transaction(async (tx) => {
      const current = await tx.payout.findFirst({
        where: { id: payout.id, status: 'COMPLETED' },
      });
      if (!current) return;
      await tx.payoutReconciliation.create({
        data: {
          idempotencyKey: `payout-reorg-exception:${payout.id}:${evidenceDigest}`,
          payoutId: payout.id,
          status: 'EXCEPTION',
          expectedReservedAtomic: payout.amountAtomic! + payout.networkFeeAtomic,
          destinationAmountAtomic: payout.amountAtomic!,
          networkFeeAtomic: actualNetworkFeeAtomic,
          walletAssetDecreaseAtomic: payout.amountAtomic! + actualNetworkFeeAtomic,
          varianceAtomic: 0n,
          evidenceDigest,
          exceptionCode: 'CONFIRMATION_REGRESSION',
          exceptionMessage:
            'A completed payout lost required confirmations; only the exact signed transaction may be replayed.',
        },
      });
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: 'CONFIRMING',
          reorgDetectedAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: 'payout.confirmation.regressed.v1',
          eventVersion: 1,
          producer: 'wallet-worker',
          aggregateType: 'Payout',
          aggregateId: payout.id,
          correlationId: payout.id,
          idempotencyKey: `payout-confirmation-regressed:${payout.id}:${evidenceDigest}`,
          payload: {
            payoutId: payout.id,
            transactionId: payout.transactionId,
            observedStatus: observation.status,
            confirmations: observation.confirmations,
            evidenceDigest,
          },
          occurredAt: new Date(),
        },
      });
    });
    return true;
  }

  private async rebroadcastExactTransaction(
    payoutId: string,
    transactionId: string,
  ): Promise<void> {
    const signing = await prisma.signingRequest.findUnique({ where: { payoutId } });
    if (!signing || signing.status !== 'SIGNED') {
      throw new Error('Exact rebroadcast requires the original signed artifact');
    }
    const artifacts = parseArtifacts(
      signing.signedArtifactReference,
      this.options.artifactEncryptionKey,
      payoutId,
      signing.manifestDigest,
    );
    if (!artifacts.rawTransaction || !artifacts.rawTransactionDigest) {
      throw new Error('Exact rebroadcast raw transaction artifact is missing');
    }
    if (sha256Hex(artifacts.rawTransaction.toLowerCase()) !== artifacts.rawTransactionDigest) {
      throw new Error('Exact rebroadcast artifact digest does not match signing evidence');
    }
    await this.assertDatabaseActionAllowed(payoutId, 'broadcast');
    const decodedTransactionId = await this.options.adapter.decodeRawTransactionId(
      artifacts.rawTransaction,
    );
    if (decodedTransactionId !== transactionId) {
      throw new Error('Exact rebroadcast artifact is bound to another transaction');
    }
    const attempts = await prisma.broadcastAttempt.count({ where: { payoutId } });
    const attempt = await prisma.broadcastAttempt.create({
      data: {
        idempotencyKey: `payout-rebroadcast:${payoutId}:attempt-${attempts + 1}`,
        payoutId,
        signingRequestId: signing.id,
        provider: 'bitcoin-core-regtest-exact-replay',
        requestDigest: artifacts.rawTransactionDigest,
        status: 'PENDING',
      },
    });
    try {
      await this.options.adapter.assertMempoolAcceptance(artifacts.rawTransaction);
    } catch (error) {
      await prisma.broadcastAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          failureCode: 'EXACT_REBROADCAST_REJECTED',
          failureMessage: asErrorMessage(error),
          completedAt: new Date(),
        },
      });
      return;
    }
    try {
      const replayedTransactionId = await this.options.adapter.broadcastRawTransaction(
        artifacts.rawTransaction,
      );
      if (replayedTransactionId !== transactionId) {
        throw new Error('Exact rebroadcast returned an unexpected transaction id');
      }
      await prisma.broadcastAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCEEDED',
          transactionId,
          responseDigest: sha256Hex(transactionId),
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.broadcastAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'UNKNOWN',
          failureCode: 'EXACT_REBROADCAST_AMBIGUOUS',
          failureMessage: asErrorMessage(error),
          completedAt: new Date(),
        },
      });
    }
  }

  private async persistChainObservation(
    payoutId: string,
    transactionId: string,
    observation: BitcoinChainObservation,
  ): Promise<void> {
    await prisma.chainObservation.create({
      data: {
        idempotencyKey: `chain-observation:${payoutId}:${randomUUID()}`,
        payoutId,
        transactionId,
        status: observation.status,
        confirmations: observation.confirmations,
        blockHeight: observation.blockHeight,
        blockHash: observation.blockHash,
        rawDigest: observation.rawDigest,
      },
    });
  }

  private async completeReconciledPayout(
    payoutId: string,
    actualNetworkFeeAtomic: bigint,
    walletSnapshot: BitcoinWalletSnapshot,
    utxoSnapshot: BitcoinUtxoSnapshot,
    observation: BitcoinChainObservation,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payout-completion:${payoutId}`}, 0))::text AS "lock"`;
      const payout = await tx.payout.findFirst({
        where: { id: payoutId, status: 'CONFIRMING' },
      });
      if (!payout) return false;
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: payout.assetId } });
      const payoutRoute = await tx.payoutRoute.findUniqueOrThrow({
        where: { id: payout.payoutRouteId },
      });
      const reservation = await tx.balanceReservation.findUnique({
        where: { payoutId: payout.id },
      });
      const wallet = payoutRoute.payoutWalletId
        ? await tx.wallet.findUnique({ where: { id: payoutRoute.payoutWalletId } })
        : null;
      const amountAtomic = payout.amountAtomic;
      if (
        !amountAtomic ||
        !reservation ||
        !['ACTIVE', 'CONSUMED'].includes(reservation.status) ||
        !wallet
      ) {
        throw new Error('Confirmed payout reservation or wallet evidence is invalid');
      }
      const alreadySettled = reservation.status === 'CONSUMED';
      const expectedReservedAtomic = amountAtomic + payout.networkFeeAtomic;
      const walletAssetDecreaseAtomic = amountAtomic + actualNetworkFeeAtomic;
      const refundAtomic = expectedReservedAtomic - walletAssetDecreaseAtomic;
      if (refundAtomic < 0n) throw new Error('Actual payout fee exceeds the reserved fee');
      const hotWalletAccount = await tx.ledgerAccount.findUnique({
        where: { code: `${asset.symbol}-HOT-WALLET` },
      });
      if (!hotWalletAccount || hotWalletAccount.type !== 'ASSET') {
        throw new Error('Hot wallet ledger asset account is not configured');
      }
      const currentWalletLedgerAtomic = await ledgerBalanceAtomic(tx, hotWalletAccount.id, 'ASSET');
      const projectedWalletLedgerAtomic = alreadySettled
        ? currentWalletLedgerAtomic
        : currentWalletLedgerAtomic - walletAssetDecreaseAtomic;
      const evidence = {
        payoutId: payout.id,
        transactionId: payout.transactionId,
        expectedReservedAtomic: expectedReservedAtomic.toString(),
        destinationAmountAtomic: amountAtomic.toString(),
        actualNetworkFeeAtomic: actualNetworkFeeAtomic.toString(),
        refundAtomic: refundAtomic.toString(),
        walletBalanceAtomic: walletSnapshot.confirmedBalanceAtomic.toString(),
        projectedWalletLedgerAtomic: projectedWalletLedgerAtomic.toString(),
        utxoAtomic: utxoSnapshot.confirmedSolvableAtomic.toString(),
        utxoCount: utxoSnapshot.utxoCount,
        utxoSetDigest: utxoSnapshot.outpointSetDigest,
        chainHeight: walletSnapshot.chainHeight.toString(),
        chainTipHash: walletSnapshot.chainTipHash,
        transactionBlockHeight: observation.blockHeight?.toString() ?? null,
        transactionBlockHash: observation.blockHash,
        confirmations: observation.confirmations,
        reconfirmation: alreadySettled,
      };
      const physicalMatched =
        projectedWalletLedgerAtomic === walletSnapshot.confirmedBalanceAtomic &&
        walletSnapshot.confirmedBalanceAtomic === utxoSnapshot.confirmedSolvableAtomic;
      if (!physicalMatched) {
        const evidenceDigest = digest(evidence);
        await tx.payoutReconciliation.upsert({
          where: {
            idempotencyKey: `payout-reconciliation-exception:${payout.id}:${evidenceDigest}`,
          },
          update: {},
          create: {
            idempotencyKey: `payout-reconciliation-exception:${payout.id}:${evidenceDigest}`,
            payoutId: payout.id,
            status: 'EXCEPTION',
            expectedReservedAtomic,
            destinationAmountAtomic: amountAtomic,
            networkFeeAtomic: actualNetworkFeeAtomic,
            walletAssetDecreaseAtomic,
            varianceAtomic: walletSnapshot.confirmedBalanceAtomic - projectedWalletLedgerAtomic,
            evidenceDigest,
            exceptionCode: 'WALLET_UTXO_LEDGER_MISMATCH',
            exceptionMessage:
              'Wallet balance, solvable UTXO set, and projected ledger asset do not match.',
          },
        });
        return false;
      }
      const evidenceDigest = digest(evidence);
      if (alreadySettled) {
        const nextReconfirmationCount = payout.reconfirmationCount + 1;
        await tx.payoutReconciliation.create({
          data: {
            idempotencyKey: `payout-reconfirmation:${payout.id}:${nextReconfirmationCount}:${observation.blockHash}`,
            payoutId: payout.id,
            status: 'MATCHED',
            expectedReservedAtomic,
            destinationAmountAtomic: amountAtomic,
            networkFeeAtomic: actualNetworkFeeAtomic,
            walletAssetDecreaseAtomic,
            varianceAtomic: 0n,
            evidenceDigest,
          },
        });
        const activeReservation = await tx.balanceReservation.aggregate({
          where: {
            status: 'ACTIVE',
            payout: { payoutRoute: { payoutWalletId: wallet.id } },
          },
          _sum: { amountAtomic: true },
        });
        const pendingBroadcast = await tx.payout.aggregate({
          where: {
            id: { not: payout.id },
            status: { in: ['BROADCAST', 'CONFIRMING'] },
            payoutRoute: { payoutWalletId: wallet.id },
          },
          _sum: { amountAtomic: true, networkFeeAtomic: true },
        });
        await tx.walletReconciliation.create({
          data: {
            idempotencyKey: `wallet-reconfirmation:${wallet.id}:${payout.transactionId}:${nextReconfirmationCount}`,
            walletId: wallet.id,
            status: 'MATCHED',
            nodeBalanceAtomic: walletSnapshot.confirmedBalanceAtomic,
            ledgerAssetAtomic: projectedWalletLedgerAtomic,
            activeReservationAtomic: activeReservation._sum.amountAtomic ?? 0n,
            pendingBroadcastAtomic:
              (pendingBroadcast._sum.amountAtomic ?? 0n) +
              (pendingBroadcast._sum.networkFeeAtomic ?? 0n),
            varianceAtomic: 0n,
            chainHeight: walletSnapshot.chainHeight,
            chainTipHash: walletSnapshot.chainTipHash,
            evidenceDigest,
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { lastReconciledAt: new Date() },
        });
        await tx.walletTransaction.update({
          where: {
            assetId_transactionId_outputIndex: {
              assetId: payout.assetId,
              transactionId: payout.transactionId!,
              outputIndex: -1,
            },
          },
          data: {
            status: 'CONFIRMED',
            confirmations: observation.confirmations,
            blockHeight: observation.blockHeight,
            confirmedAt: new Date(),
            raw: evidence as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.payout.update({
          where: { id: payout.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            reconfirmationCount: { increment: 1 },
            rowVersion: { increment: 1 },
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventId: randomUUID(),
            eventName: 'payout.reconfirmed.v1',
            eventVersion: 1,
            producer: 'wallet-worker',
            aggregateType: 'Payout',
            aggregateId: payout.id,
            correlationId: payout.id,
            idempotencyKey: `payout-reconfirmed:${payout.id}:${nextReconfirmationCount}`,
            payload: {
              payoutId: payout.id,
              transactionId: payout.transactionId,
              reconfirmationCount: nextReconfirmationCount,
              blockHash: observation.blockHash,
              confirmations: observation.confirmations,
            },
            occurredAt: new Date(),
          },
        });
        return true;
      }
      const journal = await tx.journalEntry.create({
        data: {
          idempotencyKey: `payout-settlement:${payout.id}:v1`,
          referenceType: 'PayoutSettlement',
          referenceId: payout.id,
          description: `Settle confirmed ${asset.symbol} regtest payout`,
          correlationId: payout.id,
          causationId: reservation.journalEntryId,
          status: 'PENDING',
          effectiveAt: new Date(),
        },
      });
      for (const line of [
        {
          journalEntryId: journal.id,
          ledgerAccountId: reservation.reservedLedgerAccountId,
          assetId: payout.assetId,
          debit: atomicToDecimal(expectedReservedAtomic, asset.decimals),
          credit: '0',
          debitAtomic: expectedReservedAtomic,
          creditAtomic: 0n,
        },
        {
          journalEntryId: journal.id,
          ledgerAccountId: hotWalletAccount.id,
          assetId: payout.assetId,
          debit: '0',
          credit: atomicToDecimal(walletAssetDecreaseAtomic, asset.decimals),
          debitAtomic: 0n,
          creditAtomic: walletAssetDecreaseAtomic,
        },
        ...(refundAtomic > 0n
          ? [
              {
                journalEntryId: journal.id,
                ledgerAccountId: reservation.availableLedgerAccountId,
                assetId: payout.assetId,
                debit: '0',
                credit: atomicToDecimal(refundAtomic, asset.decimals),
                debitAtomic: 0n,
                creditAtomic: refundAtomic,
              },
            ]
          : []),
      ]) {
        await tx.journalLine.create({ data: line });
      }
      await tx.journalEntry.update({
        where: { id: journal.id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
      await tx.balanceReservation.update({
        where: { id: reservation.id },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });
      await tx.payoutReconciliation.create({
        data: {
          idempotencyKey: `payout-reconciliation:${payout.id}:v1`,
          payoutId: payout.id,
          status: 'MATCHED',
          expectedReservedAtomic,
          destinationAmountAtomic: amountAtomic,
          networkFeeAtomic: actualNetworkFeeAtomic,
          walletAssetDecreaseAtomic,
          varianceAtomic: 0n,
          evidenceDigest,
        },
      });
      const activeReservation = await tx.balanceReservation.aggregate({
        where: {
          status: 'ACTIVE',
          payout: { payoutRoute: { payoutWalletId: wallet.id } },
        },
        _sum: { amountAtomic: true },
      });
      const pendingBroadcast = await tx.payout.aggregate({
        where: {
          id: { not: payout.id },
          status: { in: ['BROADCAST', 'CONFIRMING'] },
          payoutRoute: { payoutWalletId: wallet.id },
        },
        _sum: { amountAtomic: true, networkFeeAtomic: true },
      });
      await tx.walletReconciliation.create({
        data: {
          idempotencyKey: `wallet-reconciliation:${wallet.id}:${payout.transactionId}`,
          walletId: wallet.id,
          status: 'MATCHED',
          nodeBalanceAtomic: walletSnapshot.confirmedBalanceAtomic,
          ledgerAssetAtomic: projectedWalletLedgerAtomic,
          activeReservationAtomic: activeReservation._sum.amountAtomic ?? 0n,
          pendingBroadcastAtomic:
            (pendingBroadcast._sum.amountAtomic ?? 0n) +
            (pendingBroadcast._sum.networkFeeAtomic ?? 0n),
          varianceAtomic: 0n,
          chainHeight: walletSnapshot.chainHeight,
          chainTipHash: walletSnapshot.chainTipHash,
          evidenceDigest,
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { lastReconciledAt: new Date() },
      });
      const existingWalletTransaction = await tx.walletTransaction.findUnique({
        where: {
          assetId_transactionId_outputIndex: {
            assetId: payout.assetId,
            transactionId: payout.transactionId!,
            outputIndex: -1,
          },
        },
        select: { id: true },
      });
      if (!existingWalletTransaction) {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            assetId: payout.assetId,
            transactionId: payout.transactionId!,
            outputIndex: -1,
            type: 'SEND',
            status: 'CONFIRMED',
            amount: atomicToDecimal(amountAtomic, asset.decimals),
            networkFee: atomicToDecimal(actualNetworkFeeAtomic, asset.decimals),
            confirmations: observation.confirmations,
            blockHeight: observation.blockHeight,
            confirmedAt: new Date(),
            raw: evidence as unknown as Prisma.InputJsonValue,
          },
        });
      }
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          journalEntryId: journal.id,
          completedAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventName: 'payout.completed.v1',
          eventVersion: 1,
          producer: 'wallet-worker',
          aggregateType: 'Payout',
          aggregateId: payout.id,
          correlationId: payout.id,
          idempotencyKey: `payout-completed:${payout.id}:v1`,
          payload: {
            payoutId: payout.id,
            transactionId: payout.transactionId,
            destinationAmountAtomic: amountAtomic.toString(),
            networkFeeAtomic: actualNetworkFeeAtomic.toString(),
            feeRefundAtomic: refundAtomic.toString(),
            network: 'regtest',
          },
          occurredAt: new Date(),
        },
      });
      return true;
    });
  }

  private async failBeforeBroadcast(
    payoutId: string,
    failureCode: string,
    failureMessage: string,
  ): Promise<void> {
    const signingEvidence = await prisma.signingRequest.findUnique({ where: { payoutId } });
    if (
      signingEvidence?.signedArtifactReference &&
      ['PENDING', 'SUBMITTED'].includes(signingEvidence.status)
    ) {
      const artifacts = parseArtifacts(
        signingEvidence.signedArtifactReference,
        this.options.artifactEncryptionKey,
        payoutId,
        signingEvidence.manifestDigest,
      );
      if (artifacts.unsignedPsbt) {
        await this.options.adapter.releasePsbtInputs(artifacts.unsignedPsbt);
      }
    }
    await prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: payoutId },
        include: {
          reservation: { include: { journalEntry: { include: { lines: true } } } },
          signingRequest: true,
        },
      });
      if (!payout || !['APPROVED', 'SIGNING'].includes(payout.status)) return;
      const reservation = payout.reservation;
      if (reservation?.status === 'ACTIVE') {
        const reversal = await tx.journalEntry.create({
          data: {
            idempotencyKey: `payout-reservation-release:${payout.id}:${failureCode}`,
            referenceType: 'PayoutReservationReversal',
            referenceId: payout.id,
            description: `Release payout reservation after ${failureCode}`,
            correlationId: payout.id,
            causationId: reservation.journalEntryId,
            status: 'PENDING',
            effectiveAt: new Date(),
          },
        });
        for (const line of reservation.journalEntry.lines) {
          await tx.journalLine.create({
            data: {
              journalEntryId: reversal.id,
              ledgerAccountId: line.ledgerAccountId,
              assetId: line.assetId,
              debit: line.credit,
              credit: line.debit,
              debitAtomic: line.creditAtomic,
              creditAtomic: line.debitAtomic,
            },
          });
        }
        await tx.journalEntry.update({
          where: { id: reversal.id },
          data: { status: 'POSTED', postedAt: new Date() },
        });
        await tx.balanceReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'RELEASED',
            reversalJournalEntryId: reversal.id,
            releasedAt: new Date(),
          },
        });
      }
      if (
        payout.signingRequest &&
        ['PENDING', 'SUBMITTED'].includes(payout.signingRequest.status)
      ) {
        await tx.signingRequest.update({
          where: { id: payout.signingRequest.id },
          data: { status: 'FAILED', failedAt: new Date(), failureCode, failureMessage },
        });
      }
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failureCode,
          failureMessage,
          failedAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
    });
  }

  private async assertDatabaseActionAllowed(
    payoutId: string,
    action: 'sign' | 'broadcast',
  ): Promise<void> {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      select: {
        asset: { select: { symbol: true, enabled: true, payoutControls: true } },
        payoutAddress: { select: { assetNetwork: true } },
      },
    });
    if (
      !payout ||
      payout.asset.symbol !== 'BTC' ||
      !payout.asset.enabled ||
      !payout.payoutAddress.assetNetwork.enabled ||
      !isRegtestNetwork(payout.payoutAddress.assetNetwork)
    ) {
      throw new Error('Wallet executor rejected an action outside the regtest boundary');
    }
    assertPayoutActionControl(payout.asset.payoutControls[0], action);
  }
}
