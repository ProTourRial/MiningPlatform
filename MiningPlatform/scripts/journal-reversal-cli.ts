/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import { AccountingService } from '../apps/accounting-worker/src/accounting-service.js';
import { authenticateOwnerOperator } from './lib/owner-operator.js';

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  SETTLEMENT_OPERATOR_TOTP=<6 digits> pnpm journal:reverse --journal-entry-id=<id> --operator-email=<owner> --reason=<reason> --confirm=reverse:<id>',
      '',
      'Reversal creates an equal-and-opposite posted journal. It never edits or deletes journal lines.',
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
  const journalEntryId = argument('journal-entry-id');
  const operatorEmail = argument('operator-email').trim().toLowerCase();
  const reason = argument('reason').trim();
  const confirmation = argument('confirm');
  if (confirmation !== `reverse:${journalEntryId}`) {
    throw new Error(`Confirmation mismatch. Expected --confirm=reverse:${journalEntryId}`);
  }
  const operator = await authenticateOwnerOperator({
    email: operatorEmail,
    totpEnvironmentVariable: 'SETTLEMENT_OPERATOR_TOTP',
    purpose: 'Journal reversal',
  });

  const result = await new AccountingService().reverseJournal({
    journalEntryId,
    actorUserId: operator.id,
    reason,
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
