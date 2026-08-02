/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import { generateWorkerCredential } from '@mining/security';

interface CredentialListRow {
  credentialId: string;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lockedUntil: Date | null;
  failedAttempts: number;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

interface WorkerCredentialDelegate {
  findMany(input: unknown): Promise<CredentialListRow[]>;
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<{ workerId: string; credentialId: string }>;
  updateMany(input: unknown): Promise<unknown>;
}

interface WorkerCredentialDatabase {
  workerCredential: WorkerCredentialDelegate;
}

const credentialDatabase = prisma as unknown as WorkerCredentialDatabase;

function usage(): never {
  throw new Error([
    'Usage:',
    '  pnpm worker:credential create <account.worker> [--expires-at=<ISO_DATE>]',
    '  pnpm worker:credential rotate <account.worker> [--expires-at=<ISO_DATE>]',
    '  pnpm worker:credential revoke <credentialId>',
    '  pnpm worker:credential list <account.worker>',
  ].join('\n'));
}

function parseWorkerIdentity(value: string): { accountUsername: string; workerName: string } {
  const separator = value.indexOf('.');
  if (separator <= 0 || separator === value.length - 1) usage();
  return {
    accountUsername: value.slice(0, separator),
    workerName: value.slice(separator + 1),
  };
}

function optionalExpiry(args: readonly string[]): Date | undefined {
  const argument = args.find((value) => value.startsWith('--expires-at='));
  if (!argument) return undefined;
  const date = new Date(argument.slice('--expires-at='.length));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid --expires-at ISO date');
  return date;
}

async function findWorker(identity: string) {
  const parsed = parseWorkerIdentity(identity);
  const worker = await prisma.worker.findFirst({
    where: {
      name: parsed.workerName,
      deletedAt: null,
      miningAccount: {
        username: parsed.accountUsername,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      name: true,
      miningAccount: { select: { username: true } },
    },
  });
  if (!worker) throw new Error(`Worker not found: ${identity}`);
  return worker;
}

async function createOrRotate(mode: 'create' | 'rotate', identity: string, args: readonly string[]): Promise<void> {
  const worker = await findWorker(identity);
  const generated = await generateWorkerCredential();
  const expiresAt = optionalExpiry(args);

  await prisma.$transaction(async (tx) => {
    if (mode === 'rotate') {
      const credentialTx = tx as unknown as WorkerCredentialDatabase;
      await credentialTx.workerCredential.updateMany({
        where: { workerId: worker.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), rotatedAt: new Date() },
      });
    }
    const credentialTx = tx as unknown as WorkerCredentialDatabase;
    await credentialTx.workerCredential.create({
      data: {
        workerId: worker.id,
        credentialId: generated.credentialId,
        secretHash: generated.secretHash,
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        action: mode === 'rotate' ? 'WORKER_CREDENTIAL_ROTATED' : 'WORKER_CREDENTIAL_CREATED',
        resourceType: 'Worker',
        resourceId: worker.id,
        metadata: {
          credentialId: generated.credentialId,
          workerName: `${worker.miningAccount.username}.${worker.name}`,
          expiresAt: expiresAt?.toISOString(),
        },
      },
    });
  });

  process.stdout.write(`${JSON.stringify({
    credentialId: generated.credentialId,
    secret: generated.secret,
    workerName: `${worker.miningAccount.username}.${worker.name}`,
    expiresAt: expiresAt?.toISOString() ?? null,
    warning: 'Store this secret now. MiningPlatform will not display it again.',
  }, null, 2)}\n`);
}


async function listCredentials(identity: string): Promise<void> {
  const worker = await findWorker(identity);
  const now = new Date();
  const credentials = await credentialDatabase.workerCredential.findMany({
    where: { workerId: worker.id },
    orderBy: { createdAt: 'desc' },
    select: {
      credentialId: true,
      status: true,
      expiresAt: true,
      lastUsedAt: true,
      lockedUntil: true,
      failedAttempts: true,
      createdAt: true,
      rotatedAt: true,
      revokedAt: true,
    },
  });

  process.stdout.write(`${JSON.stringify({
    workerName: `${worker.miningAccount.username}.${worker.name}`,
    credentials: credentials.map((credential) => ({
      credential: credential.credentialId,
      status: credential.status,
      expires: credential.expiresAt?.toISOString() ?? null,
      lastUsed: credential.lastUsedAt?.toISOString() ?? null,
      locked: Boolean(credential.lockedUntil && credential.lockedUntil > now),
      lockedUntil: credential.lockedUntil?.toISOString() ?? null,
      failedAttempts: credential.failedAttempts,
      created: credential.createdAt.toISOString(),
      rotated: credential.rotatedAt?.toISOString() ?? null,
      revoked: credential.revokedAt?.toISOString() ?? null,
    })),
  }, null, 2)}\n`);
}

async function revoke(credentialId: string): Promise<void> {
  const credential = await credentialDatabase.workerCredential.update({
    where: { credentialId },
    data: { status: 'REVOKED', revokedAt: new Date() },
    select: { workerId: true, credentialId: true },
  });
  await prisma.auditLog.create({
    data: {
      action: 'WORKER_CREDENTIAL_REVOKED',
      resourceType: 'Worker',
      resourceId: credential.workerId,
      metadata: { credentialId: credential.credentialId },
    },
  });
  process.stdout.write(`${JSON.stringify({ credentialId, status: 'REVOKED' }, null, 2)}\n`);
}

async function main(): Promise<void> {
  const [command, target, ...args] = process.argv.slice(2);
  if (!command || !target) usage();
  if (command === 'create' || command === 'rotate') {
    await createOrRotate(command, target, args);
    return;
  }
  if (command === 'revoke') {
    await revoke(target);
    return;
  }
  if (command === 'list') {
    await listCredentials(target);
    return;
  }
  usage();
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
