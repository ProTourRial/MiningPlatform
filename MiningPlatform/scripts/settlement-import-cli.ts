/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@mining/database';
import { decryptSecret, verifyTotpCode } from '@mining/security';
import { MiningEvents, type SettlementImportedPayload } from '@mining/shared';

interface SettlementImportDocument {
  importIdempotencyKey: string;
  sourceReference: string;
  asset: string;
  upstreamPoolKey: string;
  periodStart: string;
  periodEnd: string;
  grossAtomic: string;
  upstreamFeeAtomic: string;
  networkFeeAtomic: string;
  receivedAtomic: string;
  toleranceAtomic?: string;
}

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  SETTLEMENT_OPERATOR_TOTP=<6 digits> pnpm settlement:import --file=<json> --operator-email=<owner> --confirm=import:<sourceReference>',
      '',
      'The operator must be an ACTIVE, verified OWNER with TOTP enabled.',
      'Alpha safety policy requires toleranceAtomic=0; any variance becomes an exception and is not posted.',
    ].join('\n'),
  );
}

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) usage();
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function atomic(value: unknown, field: string): bigint {
  const text = requiredString(value, field);
  if (!/^(0|[1-9][0-9]*)$/.test(text))
    throw new Error(`${field} must be a non-negative integer string`);
  return BigInt(text);
}

function date(value: unknown, field: string): Date {
  const parsed = new Date(requiredString(value, field));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid ISO date`);
  return parsed;
}

function atomicToDecimal(value: bigint, decimals: number): string {
  const digits = value.toString().padStart(decimals + 1, '0');
  return decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

async function main(): Promise<void> {
  const filePath = resolve(argument('file'));
  const operatorEmail = argument('operator-email').trim().toLowerCase();
  const confirmation = argument('confirm');
  const totp = process.env.SETTLEMENT_OPERATOR_TOTP ?? '';
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY ?? '';
  if (!/^\d{6}$/.test(totp))
    throw new Error('SETTLEMENT_OPERATOR_TOTP must contain exactly 6 digits');
  if (!encryptionKey) throw new Error('AUTH_ENCRYPTION_KEY is required');

  const raw = await readFile(filePath);
  const sourceChecksum = createHash('sha256').update(raw).digest('hex');
  const document = JSON.parse(raw.toString('utf8')) as Partial<SettlementImportDocument>;
  const importIdempotencyKey = requiredString(
    document.importIdempotencyKey,
    'importIdempotencyKey',
  );
  const sourceReference = requiredString(document.sourceReference, 'sourceReference');
  const assetSymbol = requiredString(document.asset, 'asset').toUpperCase();
  const upstreamPoolKey = requiredString(document.upstreamPoolKey, 'upstreamPoolKey');
  const periodStart = date(document.periodStart, 'periodStart');
  const periodEnd = date(document.periodEnd, 'periodEnd');
  if (periodStart >= periodEnd) throw new Error('periodStart must be before periodEnd');
  if (confirmation !== `import:${sourceReference}`) {
    throw new Error(`Confirmation mismatch. Expected --confirm=import:${sourceReference}`);
  }

  const grossAtomic = atomic(document.grossAtomic, 'grossAtomic');
  const upstreamFeeAtomic = atomic(document.upstreamFeeAtomic, 'upstreamFeeAtomic');
  const networkFeeAtomic = atomic(document.networkFeeAtomic, 'networkFeeAtomic');
  const receivedAtomic = atomic(document.receivedAtomic, 'receivedAtomic');
  const toleranceAtomic = atomic(document.toleranceAtomic ?? '0', 'toleranceAtomic');
  if (toleranceAtomic !== 0n) throw new Error('Alpha safety policy requires toleranceAtomic=0');
  if (upstreamFeeAtomic + networkFeeAtomic > grossAtomic) {
    throw new Error('Provider costs cannot exceed grossAtomic');
  }
  const internalExpectedAtomic = grossAtomic - upstreamFeeAtomic - networkFeeAtomic;
  const varianceAtomic = receivedAtomic - internalExpectedAtomic;
  const matched = varianceAtomic === 0n;

  const operator = await prisma.user.findUnique({
    where: { email: operatorEmail },
    include: { security: true },
  });
  if (
    !operator ||
    operator.role !== 'OWNER' ||
    operator.status !== 'ACTIVE' ||
    !operator.emailVerifiedAt ||
    !operator.security?.totpEnabled ||
    !operator.security.totpSecretEncrypted
  ) {
    throw new Error('Settlement operator must be an ACTIVE, verified OWNER with TOTP enabled');
  }
  const secret = decryptSecret(operator.security.totpSecretEncrypted, encryptionKey);
  if (!verifyTotpCode(secret, totp)) throw new Error('Invalid operator TOTP code');

  const asset = await prisma.asset.findUnique({ where: { symbol: assetSymbol } });
  if (!asset?.enabled) throw new Error(`Enabled asset not found: ${assetSymbol}`);
  const upstreamPool = await prisma.upstreamPool.findUnique({
    where: { assetId_poolKey: { assetId: asset.id, poolKey: upstreamPoolKey } },
  });
  if (!upstreamPool) throw new Error(`Upstream pool not found: ${assetSymbol}/${upstreamPoolKey}`);

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.upstreamReconciliation.findUnique({
        where: { importIdempotencyKey },
        include: { rewardPeriod: true },
      });
      if (existing) {
        if (
          existing.sourceReference !== sourceReference ||
          existing.sourceChecksum !== sourceChecksum
        ) {
          throw new Error(`Settlement idempotency conflict: ${importIdempotencyKey}`);
        }
        return {
          duplicate: true,
          rewardPeriodId: existing.rewardPeriodId,
          reconciliationId: existing.id,
          status: existing.status,
        };
      }

      const rewardPeriod = await tx.rewardPeriod.create({
        data: {
          assetId: asset.id,
          upstreamPoolId: upstreamPool.id,
          method: 'FOLLOW_UPSTREAM',
          status: 'OPEN',
          reconciliationStatus: matched ? 'MATCHED' : 'EXCEPTION',
          periodStart,
          periodEnd,
          grossReward: atomicToDecimal(grossAtomic, asset.decimals),
          upstreamFee: atomicToDecimal(upstreamFeeAtomic, asset.decimals),
          networkFee: atomicToDecimal(networkFeeAtomic, asset.decimals),
          distributableReward: atomicToDecimal(internalExpectedAtomic, asset.decimals),
        grossAtomic,
        upstreamFeeAtomic,
        networkFeeAtomic,
        distributableAtomic: internalExpectedAtomic,
        userNetAtomic: internalExpectedAtomic,
        failureCode: matched ? null : 'UPSTREAM_SETTLEMENT_VARIANCE',
        },
      });
      const reconciliation = await tx.upstreamReconciliation.create({
        data: {
          assetId: asset.id,
          upstreamPoolId: upstreamPool.id,
          rewardPeriodId: rewardPeriod.id,
          upstreamGrossReward: atomicToDecimal(grossAtomic, asset.decimals),
          upstreamFee: atomicToDecimal(upstreamFeeAtomic, asset.decimals),
          receivedAmount: atomicToDecimal(receivedAtomic, asset.decimals),
          internalExpectedAmount: atomicToDecimal(internalExpectedAtomic, asset.decimals),
          varianceAmount:
            varianceAtomic < 0n
              ? `-${atomicToDecimal(-varianceAtomic, asset.decimals)}`
              : atomicToDecimal(varianceAtomic, asset.decimals),
          status: matched ? 'MATCHED' : 'EXCEPTION',
          sourceReference,
          sourceChecksum,
          importIdempotencyKey,
          upstreamGrossAtomic: grossAtomic,
          upstreamFeeAtomic,
          networkFeeAtomic,
          receivedAtomic,
          internalExpectedAtomic,
          varianceAtomic,
          toleranceAtomic,
          exceptionCode: matched ? null : 'RECEIVED_AMOUNT_MISMATCH',
          exceptionMessage: matched
            ? null
            : `Received atomic amount differs from expected by ${varianceAtomic.toString()}`,
        },
      });
      const eventId = randomUUID();
      const importedAt = new Date();
      const payload: SettlementImportedPayload = {
        rewardPeriodId: rewardPeriod.id,
        reconciliationId: reconciliation.id,
        importIdempotencyKey,
        importedAt: importedAt.toISOString(),
      };
      await tx.outboxEvent.create({
        data: {
          eventId,
          eventName: MiningEvents.settlementImported,
          eventVersion: 1,
          producer: 'settlement-import-cli',
          aggregateType: 'UpstreamReconciliation',
          aggregateId: reconciliation.id,
          correlationId: randomUUID(),
          idempotencyKey: `settlement-imported:${importIdempotencyKey}:v1`,
          payload: { ...payload },
          occurredAt: importedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: operator.id,
          action: 'UPSTREAM_SETTLEMENT_IMPORTED',
          resourceType: 'UpstreamReconciliation',
          resourceId: reconciliation.id,
          metadata: {
            sourceReference,
            sourceChecksum,
            importIdempotencyKey,
            filePath,
            status: reconciliation.status,
            grossAtomic: grossAtomic.toString(),
            receivedAtomic: receivedAtomic.toString(),
            varianceAtomic: varianceAtomic.toString(),
          },
        },
      });
      return {
        duplicate: false,
        rewardPeriodId: rewardPeriod.id,
        reconciliationId: reconciliation.id,
        status: reconciliation.status,
      };
    },
    { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 30_000 },
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        sourceReference,
        sourceChecksum,
        importIdempotencyKey,
        postingEligible: result.status === 'MATCHED',
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
