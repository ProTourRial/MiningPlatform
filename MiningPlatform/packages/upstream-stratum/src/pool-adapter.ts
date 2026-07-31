/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob } from '@mining/mining-core';
import { UpstreamStratumClient } from './client.js';
import type {
  PoolAdapter,
  PoolAdapterCallbacks,
  PoolAdapterCapabilities,
  UpstreamEndpoint,
  UpstreamSessionState,
  UpstreamShareResult,
  UpstreamSubscription,
  UpstreamSubmitInput,
} from './types.js';

const STRATUM_V1_CAPABILITIES: PoolAdapterCapabilities = Object.freeze({
  protocol: 'STRATUM_V1',
  supportsTls: true,
  supportsVersionRolling: true,
  supportsSetExtranonce: true,
  supportsClientReconnect: true,
});

/** Generic adapter that isolates provider selection from Stratum V1 transport details. */
export class StratumV1PoolAdapter implements PoolAdapter {
  readonly capabilities = STRATUM_V1_CAPABILITIES;
  private client?: UpstreamStratumClient;
  private subscription?: UpstreamSubscription;
  private difficulty = '1';

  constructor(
    readonly id: string,
    readonly endpoint: UpstreamEndpoint,
    private readonly callbacks: PoolAdapterCallbacks = {},
  ) {
    if (!id.trim()) throw new Error('Pool adapter id is required');
  }

  get state(): UpstreamSessionState {
    return this.client?.currentState ?? 'DISCONNECTED';
  }

  get currentSubscription(): UpstreamSubscription | undefined {
    return this.subscription;
  }

  get currentDifficulty(): string {
    return this.difficulty;
  }

  async start(maximumAttempts = 1, signal?: AbortSignal): Promise<UpstreamSubscription> {
    this.close();
    const client = new UpstreamStratumClient(this.endpoint, {
      onState: (state) => this.callbacks.onState?.(state),
      onDifficulty: (difficulty) => {
        this.difficulty = difficulty;
        this.callbacks.onDifficulty?.(difficulty);
      },
      onExtranonce: (subscription) => {
        this.subscription = subscription;
        this.callbacks.onExtranonce?.(subscription);
      },
      onJob: (job) => this.callbacks.onJob?.(job),
      onError: (error) => this.callbacks.onError?.(error),
      onDisconnect: (reason) => this.callbacks.onDisconnect?.(reason),
    });
    this.client = client;
    const subscription = await client.connectAuthorizeWithRetry(maximumAttempts, signal);
    this.subscription = subscription;
    this.difficulty = client.currentDifficulty;
    return subscription;
  }

  getJob(jobId: string): BitcoinMiningJob | undefined {
    return this.client?.jobs.getActive(jobId);
  }

  async submit(input: UpstreamSubmitInput): Promise<UpstreamShareResult> {
    if (!this.client) throw new Error(`Pool adapter ${this.id} is not started`);
    return this.client.submit(input);
  }

  close(): void {
    this.client?.close();
    this.client = undefined;
    this.subscription = undefined;
  }
}
