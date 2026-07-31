/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import type { StratumServerConfig } from './config.js';
import type { WorkerAuthenticator } from './worker-authenticator.js';

export class DevelopmentWorkerAuthenticator implements WorkerAuthenticator {
  constructor(private readonly config: StratumServerConfig) {}

  async authenticate(workerName: string, password: string) {
    if (!this.config.developmentMode) return { authenticated: false as const, code: 'ACCOUNT_DISABLED' as const };
    if (workerName !== this.config.developmentWorker || password !== this.config.developmentPassword) {
      return { authenticated: false as const, code: 'INVALID_CREDENTIALS' as const };
    }
    return {
      authenticated: true as const,
      worker: {
        workerId: `dev-${createHash('sha256').update(workerName).digest('hex').slice(0, 24)}`,
        workerName,
      },
    };
  }

  async close(): Promise<void> {}
}
