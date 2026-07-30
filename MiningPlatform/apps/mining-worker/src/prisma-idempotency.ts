/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { AcquireInput, AcquireResult, TransactionalIdempotencyService } from '@mining/idempotency';
import type { Prisma } from '@mining/database';

function toRecord(record: {
  key: string;
  owner: string;
  requestHash: string;
  status: 'ACQUIRED' | 'COMPLETED' | 'FAILED' | 'RELEASED' | 'EXPIRED';
  expiresAt: Date;
  resultReference: string | null;
}) {
  return {
    key: record.key,
    owner: record.owner,
    requestHash: record.requestHash,
    status: record.status,
    expiresAt: record.expiresAt.getTime(),
    ...(record.resultReference ? { resultReference: record.resultReference } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class PrismaTransactionalIdempotencyService
  implements TransactionalIdempotencyService<Prisma.TransactionClient>
{
  async acquire(tx: Prisma.TransactionClient, input: AcquireInput): Promise<AcquireResult> {
    const existing = await tx.idempotencyRecord.findUnique({ where: { key: input.key } });
    const now = new Date();
    if (!existing) {
      try {
        const created = await tx.idempotencyRecord.create({
          data: {
            key: input.key,
            owner: input.owner,
            requestHash: input.requestHash,
            status: 'ACQUIRED',
            expiresAt: new Date(now.getTime() + input.ttlMs),
          },
        });
        return { acquired: true, record: toRecord(created) };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return this.acquire(tx, input);
      }
    }

    const record = toRecord(existing);
    if (existing.requestHash !== input.requestHash) return { acquired: false, reason: 'CONFLICT', record };
    if (existing.status === 'COMPLETED') return { acquired: false, reason: 'COMPLETED', record };
    if (existing.status === 'ACQUIRED' && existing.expiresAt > now) {
      return { acquired: false, reason: 'IN_PROGRESS', record };
    }

    const reclaimed = await tx.idempotencyRecord.update({
      where: { key: input.key },
      data: {
        owner: input.owner,
        requestHash: input.requestHash,
        status: 'ACQUIRED',
        resultReference: null,
        expiresAt: new Date(now.getTime() + input.ttlMs),
      },
    });
    return { acquired: true, record: toRecord(reclaimed) };
  }

  async complete(
    tx: Prisma.TransactionClient,
    input: { key: string; owner: string; resultReference?: string },
  ): Promise<void> {
    const result = await tx.idempotencyRecord.updateMany({
      where: { key: input.key, owner: input.owner, status: 'ACQUIRED' },
      data: { status: 'COMPLETED', resultReference: input.resultReference },
    });
    if (result.count !== 1) throw new Error(`Cannot complete idempotency record: ${input.key}`);
  }

  async fail(
    tx: Prisma.TransactionClient,
    input: { key: string; owner: string; resultReference?: string },
  ): Promise<void> {
    const result = await tx.idempotencyRecord.updateMany({
      where: { key: input.key, owner: input.owner, status: 'ACQUIRED' },
      data: { status: 'FAILED', resultReference: input.resultReference },
    });
    if (result.count !== 1) throw new Error(`Cannot fail idempotency record: ${input.key}`);
  }
}
