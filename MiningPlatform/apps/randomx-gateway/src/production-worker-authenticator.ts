/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { hmacSensitiveValue } from '@mining/security';
import {
  ProductionWorkerAuthenticator,
  type ProductionWorkerAuthenticationConfig,
  type WorkerAuthenticator,
} from '@mining/stratum-server/worker-authentication';
import type {
  RandomXMinerAuthenticationContext,
  RandomXMinerAuthenticationResult,
  RandomXMinerAuthenticator,
} from './miner-server.js';

function validateHashKey(value: string): string {
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('RandomX worker agent hash key must contain at least 32 bytes');
  }
  return value;
}

/**
 * Reuses the exact PostgreSQL credential, referral, audit, and Redis limiter
 * policy already enforced by the SHA-256 listener while projecting only the
 * identity fields required by the RandomX gateway.
 */
export class RandomXProductionWorkerAuthenticator implements RandomXMinerAuthenticator {
  private readonly agentHashKey: string;

  constructor(
    private readonly authenticator: WorkerAuthenticator,
    agentHashKey: string,
  ) {
    this.agentHashKey = validateHashKey(agentHashKey);
  }

  static async create(
    config: ProductionWorkerAuthenticationConfig,
  ): Promise<RandomXProductionWorkerAuthenticator> {
    validateHashKey(config.ipHashKey);
    const authenticator = await ProductionWorkerAuthenticator.create(config);
    return new RandomXProductionWorkerAuthenticator(authenticator, config.ipHashKey);
  }

  async authenticate(
    login: string,
    password: string,
    context: RandomXMinerAuthenticationContext,
  ): Promise<RandomXMinerAuthenticationResult> {
    const result = await this.authenticator.authenticate(login, password, {
      sessionId: context.connectionId,
      remoteIpHash: context.remoteIpHash,
      ...(context.agent
        ? { userAgentHash: hmacSensitiveValue(context.agent, this.agentHashKey) }
        : {}),
    });
    if (!result.authenticated) return result;
    const { worker } = result;
    if (!worker.workerId || !worker.workerName || !worker.miningAccountId) {
      return { authenticated: false, code: 'AUTHENTICATION_CONTEXT_INVALID' };
    }
    return {
      authenticated: true,
      worker: {
        workerId: worker.workerId,
        workerName: worker.workerName,
        miningAccountId: worker.miningAccountId,
      },
    };
  }

  async close(): Promise<void> {
    await this.authenticator.close?.();
  }
}
