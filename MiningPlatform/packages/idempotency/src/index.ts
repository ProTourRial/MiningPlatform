/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type IdempotencyStatus = 'ACQUIRED' | 'COMPLETED' | 'FAILED' | 'RELEASED' | 'EXPIRED';

export interface IdempotencyRecord {
  key: string;
  owner: string;
  requestHash: string;
  status: IdempotencyStatus;
  expiresAt: number;
  resultReference?: string;
}

export type AcquireResult =
  | { acquired: true; record: IdempotencyRecord }
  | { acquired: false; reason: 'IN_PROGRESS' | 'COMPLETED' | 'CONFLICT'; record: IdempotencyRecord };

export interface AcquireInput {
  key: string;
  owner: string;
  requestHash: string;
  ttlMs: number;
}

export interface IdempotencyService {
  acquire(input: AcquireInput): Promise<AcquireResult>;
  complete(input: { key: string; owner: string; resultReference?: string }): Promise<void>;
  release(input: { key: string; owner: string }): Promise<void>;
  expire(input: { key: string }): Promise<void>;
}

export interface TransactionalIdempotencyService<TContext> {
  acquire(context: TContext, input: AcquireInput): Promise<AcquireResult>;
  complete(
    context: TContext,
    input: { key: string; owner: string; resultReference?: string },
  ): Promise<void>;
  fail(context: TContext, input: { key: string; owner: string; resultReference?: string }): Promise<void>;
}

export class InMemoryIdempotencyService implements IdempotencyService {
  private readonly records = new Map<string, IdempotencyRecord>();

  async acquire(input: AcquireInput): Promise<AcquireResult> {
    const now = Date.now();
    const existing = this.records.get(input.key);

    if (existing && existing.status === 'ACQUIRED' && existing.expiresAt <= now) {
      existing.status = 'EXPIRED';
    }

    if (existing?.requestHash && existing.requestHash !== input.requestHash) {
      return { acquired: false, reason: 'CONFLICT', record: existing };
    }

    if (existing?.status === 'COMPLETED') {
      return { acquired: false, reason: 'COMPLETED', record: existing };
    }

    if (existing?.status === 'ACQUIRED') {
      return { acquired: false, reason: 'IN_PROGRESS', record: existing };
    }

    const record: IdempotencyRecord = {
      key: input.key,
      owner: input.owner,
      requestHash: input.requestHash,
      status: 'ACQUIRED',
      expiresAt: now + input.ttlMs,
    };
    this.records.set(input.key, record);
    return { acquired: true, record };
  }

  async complete(input: { key: string; owner: string; resultReference?: string }): Promise<void> {
    const record = this.requireOwned(input.key, input.owner);
    record.status = 'COMPLETED';
    record.resultReference = input.resultReference;
  }

  async release(input: { key: string; owner: string }): Promise<void> {
    const record = this.requireOwned(input.key, input.owner);
    if (record.status === 'COMPLETED') throw new Error('Completed idempotency records are immutable');
    record.status = 'RELEASED';
  }

  async expire(input: { key: string }): Promise<void> {
    const record = this.records.get(input.key);
    if (!record) return;
    if (record.status === 'COMPLETED') throw new Error('Completed idempotency records are immutable');
    record.status = 'EXPIRED';
  }

  private requireOwned(key: string, owner: string): IdempotencyRecord {
    const record = this.records.get(key);
    if (!record) throw new Error(`Idempotency record not found: ${key}`);
    if (record.owner !== owner) throw new Error(`Idempotency record owner mismatch: ${key}`);
    return record;
  }
}
