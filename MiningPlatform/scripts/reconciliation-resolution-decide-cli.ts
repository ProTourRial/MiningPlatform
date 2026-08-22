/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import { ReconciliationResolutionService } from '../apps/accounting-worker/src/reconciliation-resolution-service.js';
import { authenticateOwnerOperator } from './lib/owner-operator.js';

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  RECONCILIATION_OPERATOR_TOTP=<6 digits> pnpm reconciliation:resolution:decide --resolution-id=<id> --decision=<approve|reject> --operator-email=<different-owner> --reason=<reason> --confirm=<approve-resolution|reject-resolution>:<id>',
      '',
      'The decision operator must be a different ACTIVE, verified OWNER with TOTP enabled.',
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

async function main(): Promise<void> {
  const resolutionId = argument('resolution-id');
  const rawDecision = argument('decision').trim().toLowerCase();
  if (rawDecision !== 'approve' && rawDecision !== 'reject') usage();
  const decision = rawDecision === 'approve' ? 'APPROVE' : 'REJECT';
  const operatorEmail = argument('operator-email');
  const decisionReason = argument('reason');
  const confirmation = argument('confirm');
  const expectedConfirmation = `${rawDecision}-resolution:${resolutionId}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(`Confirmation mismatch. Expected --confirm=${expectedConfirmation}`);
  }
  const operator = await authenticateOwnerOperator({
    email: operatorEmail,
    totpEnvironmentVariable: 'RECONCILIATION_OPERATOR_TOTP',
    purpose: 'Reconciliation resolution decision',
  });
  const result = await new ReconciliationResolutionService().decide({
    resolutionId,
    decidedByUserId: operator.id,
    decision,
    decisionReason,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
