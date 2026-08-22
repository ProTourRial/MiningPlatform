/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@mining/database';
import { ReconciliationResolutionService } from '../apps/accounting-worker/src/reconciliation-resolution-service.js';
import { authenticateOwnerOperator } from './lib/owner-operator.js';

interface CorrectedSettlementDocument {
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
      '  RECONCILIATION_OPERATOR_TOTP=<6 digits> pnpm reconciliation:resolution:request --reconciliation-id=<exception-id> --file=<corrected-json> --request-idempotency-key=<key> --operator-email=<owner> --reason=<reason> --confirm=request-resolution:<exception-id>:<sourceReference>',
      '',
      'Corrected evidence must exactly match, use new source identity, and remain non-posting until a different OWNER approves it.',
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
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${field} must be a non-negative integer string`);
  }
  return BigInt(text);
}

async function main(): Promise<void> {
  const reconciliationId = argument('reconciliation-id');
  const filePath = resolve(argument('file'));
  const requestIdempotencyKey = argument('request-idempotency-key');
  const operatorEmail = argument('operator-email');
  const requestReason = argument('reason');
  const confirmation = argument('confirm');
  const raw = await readFile(filePath);
  const sourceChecksum = createHash('sha256').update(raw).digest('hex');
  const document = JSON.parse(raw.toString('utf8')) as Partial<CorrectedSettlementDocument>;
  const sourceReference = requiredString(document.sourceReference, 'sourceReference');
  if (confirmation !== `request-resolution:${reconciliationId}:${sourceReference}`) {
    throw new Error(
      `Confirmation mismatch. Expected --confirm=request-resolution:${reconciliationId}:${sourceReference}`,
    );
  }
  const operator = await authenticateOwnerOperator({
    email: operatorEmail,
    totpEnvironmentVariable: 'RECONCILIATION_OPERATOR_TOTP',
    purpose: 'Reconciliation resolution request',
  });
  const result = await new ReconciliationResolutionService().request({
    reconciliationId,
    requestIdempotencyKey,
    requestedByUserId: operator.id,
    requestReason,
    evidence: {
      assetSymbol: requiredString(document.asset, 'asset'),
      upstreamPoolKey: requiredString(document.upstreamPoolKey, 'upstreamPoolKey'),
      periodStart: requiredString(document.periodStart, 'periodStart'),
      periodEnd: requiredString(document.periodEnd, 'periodEnd'),
      sourceReference,
      sourceChecksum,
      importIdempotencyKey: requiredString(document.importIdempotencyKey, 'importIdempotencyKey'),
      grossAtomic: atomic(document.grossAtomic, 'grossAtomic'),
      upstreamFeeAtomic: atomic(document.upstreamFeeAtomic, 'upstreamFeeAtomic'),
      networkFeeAtomic: atomic(document.networkFeeAtomic, 'networkFeeAtomic'),
      receivedAtomic: atomic(document.receivedAtomic, 'receivedAtomic'),
      toleranceAtomic: atomic(document.toleranceAtomic ?? '0', 'toleranceAtomic'),
    },
  });
  process.stdout.write(`${JSON.stringify({ ...result, sourceChecksum }, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
