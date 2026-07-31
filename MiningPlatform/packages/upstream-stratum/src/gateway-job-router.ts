/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob } from '@mining/mining-core';

export type GatewayJobStatus = 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | 'INVALIDATED';

export interface GatewayJobRoute {
  downstreamJob: BitcoinMiningJob;
  upstreamJobId: string;
  poolId: string;
  generation: number;
  status: GatewayJobStatus;
  createdAt: Date;
  invalidatedAt?: Date;
}

export interface GatewayJobRouterOptions {
  maximumEntries?: number;
  downstreamIdPrefixLength?: number;
  now?: () => Date;
}

/** Maps provider-local job ids to globally unique ids exposed to downstream miners. */
export class GatewayJobRouter {
  private readonly routes = new Map<string, GatewayJobRoute>();
  private readonly generations = new Map<string, number>();
  private readonly maximumEntries: number;
  private sequence = 0;
  private readonly prefixLength: number;
  private readonly now: () => Date;

  constructor(options: GatewayJobRouterOptions = {}) {
    this.maximumEntries = options.maximumEntries ?? 512;
    this.prefixLength = options.downstreamIdPrefixLength ?? 10;
    this.now = options.now ?? (() => new Date());
    if (!Number.isInteger(this.maximumEntries) || this.maximumEntries < 16) {
      throw new Error('Gateway job router maximumEntries must be at least 16');
    }
  }

  route(poolId: string, job: BitcoinMiningJob, assignedDifficulty = job.assignedDifficulty): GatewayJobRoute {
    const at = this.now();
    this.expire(at);
    if (job.cleanJobs) this.invalidateAll('SUPERSEDED', at);
    const generation = (this.generations.get(poolId) ?? 0) + (job.cleanJobs ? 1 : 0);
    this.generations.set(poolId, generation);
    const poolPrefix = sanitizePoolId(poolId).slice(0, this.prefixLength);
    this.sequence += 1;
    const downstreamId = `${poolPrefix}.${generation.toString(36)}.${this.sequence.toString(36)}.${job.id}`;
    const route: GatewayJobRoute = {
      downstreamJob: { ...job, id: downstreamId, assignedDifficulty },
      upstreamJobId: job.id,
      poolId,
      generation,
      status: 'ACTIVE',
      createdAt: at,
    };
    this.routes.set(downstreamId, route);
    this.prune();
    return route;
  }


  retarget(downstreamJobId: string, assignedDifficulty: string, at = this.now()): GatewayJobRoute {
    const current = this.resolve(downstreamJobId, at);
    if (!current) throw new Error(`Cannot retarget inactive gateway job ${downstreamJobId}`);
    current.status = 'SUPERSEDED';
    current.invalidatedAt = at;
    const rerouted = this.route(current.poolId, {
      ...current.downstreamJob,
      id: current.upstreamJobId,
      assignedDifficulty,
      cleanJobs: false,
      receivedAt: at,
    }, assignedDifficulty);
    return rerouted;
  }

  resolve(downstreamJobId: string, at = this.now()): GatewayJobRoute | undefined {
    this.expire(at);
    const route = this.routes.get(downstreamJobId);
    return route?.status === 'ACTIVE' ? route : undefined;
  }

  get(downstreamJobId: string): GatewayJobRoute | undefined {
    return this.routes.get(downstreamJobId);
  }

  invalidatePool(poolId: string, status: Exclude<GatewayJobStatus, 'ACTIVE'> = 'INVALIDATED', at = this.now()): void {
    for (const route of this.routes.values()) {
      if (route.poolId === poolId && route.status === 'ACTIVE') {
        route.status = status;
        route.invalidatedAt = at;
      }
    }
  }

  invalidateAll(status: Exclude<GatewayJobStatus, 'ACTIVE'> = 'INVALIDATED', at = this.now()): void {
    for (const route of this.routes.values()) {
      if (route.status === 'ACTIVE') {
        route.status = status;
        route.invalidatedAt = at;
      }
    }
  }

  activeRoutes(at = this.now()): GatewayJobRoute[] {
    this.expire(at);
    return [...this.routes.values()].filter((route) => route.status === 'ACTIVE');
  }

  private expire(at: Date): void {
    for (const route of this.routes.values()) {
      if (route.status === 'ACTIVE' && route.downstreamJob.expiresAt.getTime() <= at.getTime()) {
        route.status = 'EXPIRED';
        route.invalidatedAt = at;
      }
    }
  }

  private prune(): void {
    if (this.routes.size <= this.maximumEntries) return;
    const removable = [...this.routes.entries()]
      .filter(([, route]) => route.status !== 'ACTIVE')
      .sort((left, right) => left[1].createdAt.getTime() - right[1].createdAt.getTime());
    for (const [jobId] of removable) {
      if (this.routes.size <= this.maximumEntries) return;
      this.routes.delete(jobId);
    }
    if (this.routes.size > this.maximumEntries) {
      const oldest = [...this.routes.entries()].sort(
        (left, right) => left[1].createdAt.getTime() - right[1].createdAt.getTime(),
      );
      for (const [jobId, route] of oldest) {
        if (this.routes.size <= this.maximumEntries) return;
        route.status = 'INVALIDATED';
        route.invalidatedAt = this.now();
        this.routes.delete(jobId);
      }
    }
  }
}

function sanitizePoolId(poolId: string): string {
  const normalized = poolId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!normalized) throw new Error('Pool id is required for gateway job routing');
  return normalized;
}
