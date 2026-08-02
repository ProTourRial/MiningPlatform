/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';

const ROLES = ['USER', 'ADMIN', 'OWNER'] as const;
type Role = (typeof ROLES)[number];

function usage(): never {
  throw new Error([
    'Usage:',
    '  pnpm user:role set <email> <USER|ADMIN|OWNER> --confirm=<email>:<role>',
    '',
    'Promote only a verified ACTIVE account. Admin endpoints additionally require TOTP.',
  ].join('\n'));
}

async function main(): Promise<void> {
  const [command, rawEmail, rawRole, confirmation] = process.argv.slice(2);
  if (command !== 'set' || !rawEmail || !rawRole || !confirmation) usage();
  const email = rawEmail.trim().toLowerCase();
  const role = rawRole.toUpperCase() as Role;
  if (!ROLES.includes(role)) usage();
  if (confirmation !== `--confirm=${email}:${role}`) {
    throw new Error(`Confirmation mismatch. Expected --confirm=${email}:${role}`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true },
  });
  if (!user) throw new Error(`User not found: ${email}`);
  if (role !== 'USER' && (user.status !== 'ACTIVE' || !user.emailVerifiedAt)) {
    throw new Error('ADMIN/OWNER role requires an ACTIVE, verified account');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role } });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: 'USER_ROLE_CHANGED_BY_OPERATOR_CLI',
        resourceType: 'User',
        resourceId: user.id,
        metadata: { previousRole: user.role, nextRole: role, operatorBoundary: 'database-cli' },
      },
    });
  });

  process.stdout.write(`${JSON.stringify({ id: user.id, email: user.email, previousRole: user.role, role }, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
