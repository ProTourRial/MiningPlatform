/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import { decryptSecret, verifyTotpCode } from '@mining/security';
import { AccountingService } from '../apps/accounting-worker/src/accounting-service.js';

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
  const totp = process.env.SETTLEMENT_OPERATOR_TOTP ?? '';
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY ?? '';
  if (!/^\d{6}$/.test(totp))
    throw new Error('SETTLEMENT_OPERATOR_TOTP must contain exactly 6 digits');
  if (!encryptionKey) throw new Error('AUTH_ENCRYPTION_KEY is required');

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
    throw new Error(
      'Journal reversal operator must be an ACTIVE, verified OWNER with TOTP enabled',
    );
  }
  const secret = decryptSecret(operator.security.totpSecretEncrypted, encryptionKey);
  if (!verifyTotpCode(secret, totp)) throw new Error('Invalid operator TOTP code');

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
