/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import { decryptSecret, verifyTotpCode } from '@mining/security';

export async function authenticateOwnerOperator(input: {
  email: string;
  totpEnvironmentVariable: string;
  purpose: string;
}): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const totp = process.env[input.totpEnvironmentVariable] ?? '';
  const encryptionKey = process.env.AUTH_ENCRYPTION_KEY ?? '';
  if (!/^\d{6}$/.test(totp)) {
    throw new Error(`${input.totpEnvironmentVariable} must contain exactly 6 digits`);
  }
  if (!encryptionKey) throw new Error('AUTH_ENCRYPTION_KEY is required');

  const operator = await prisma.user.findUnique({
    where: { email },
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
      `${input.purpose} operator must be an ACTIVE, verified OWNER with TOTP enabled`,
    );
  }
  const secret = decryptSecret(operator.security.totpSecretEncrypted, encryptionKey);
  if (!verifyTotpCode(secret, totp)) throw new Error('Invalid operator TOTP code');
  return { id: operator.id, email: operator.email };
}
