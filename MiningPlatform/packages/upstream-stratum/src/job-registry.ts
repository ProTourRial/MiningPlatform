/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob } from '@mining/mining-core';
import type { UpstreamJobRecord } from './types.js';

export class UpstreamJobRegistry {
  private readonly jobs = new Map<string, UpstreamJobRecord>();
  private generation = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  add(job: BitcoinMiningJob): UpstreamJobRecord {
    const at = this.now();
    this.expire(at);
    if (job.cleanJobs) {
      this.generation += 1;
      for (const record of this.jobs.values()) {
        if (record.status === 'ACTIVE') {
          record.status = 'SUPERSEDED';
          record.invalidatedAt = at;
        }
      }
    }
    const record: UpstreamJobRecord = { job, status: 'ACTIVE', generation: this.generation };
    this.jobs.set(job.id, record);
    return record;
  }

  getActive(jobId: string, at = this.now()): BitcoinMiningJob | undefined {
    this.expire(at);
    const record = this.jobs.get(jobId);
    return record?.status === 'ACTIVE' ? record.job : undefined;
  }

  get(jobId: string): UpstreamJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  invalidateAll(at = this.now()): void {
    for (const record of this.jobs.values()) {
      if (record.status === 'ACTIVE') {
        record.status = 'INVALIDATED';
        record.invalidatedAt = at;
      }
    }
  }

  expire(at = this.now()): void {
    for (const record of this.jobs.values()) {
      if (record.status === 'ACTIVE' && record.job.expiresAt.getTime() <= at.getTime()) {
        record.status = 'EXPIRED';
        record.invalidatedAt = at;
      }
    }
  }

  activeJobs(at = this.now()): BitcoinMiningJob[] {
    this.expire(at);
    return [...this.jobs.values()].filter((record) => record.status === 'ACTIVE').map((record) => record.job);
  }
}
