import { createHash } from 'node:crypto';
import type { StratumServerConfig } from './config.js';

export interface AuthenticatedWorker {
  workerId: string;
  workerName: string;
}

export interface WorkerAuthenticator {
  authenticate(workerName: string, password: string): Promise<AuthenticatedWorker | null>;
}

export class DevelopmentWorkerAuthenticator implements WorkerAuthenticator {
  constructor(private readonly config: StratumServerConfig) {}

  async authenticate(workerName: string, password: string): Promise<AuthenticatedWorker | null> {
    if (!this.config.developmentMode) return null;
    if (workerName !== this.config.developmentWorker || password !== this.config.developmentPassword) return null;
    return {
      workerId: `dev-${createHash('sha256').update(workerName).digest('hex').slice(0, 24)}`,
      workerName,
    };
  }
}
