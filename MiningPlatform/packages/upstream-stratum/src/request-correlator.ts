/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { StratumRequestId, StratumResponse } from '@mining/stratum-protocol';

interface PendingRequest {
  resolve: (response: StratumResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class RequestCorrelator {
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();

  create(timeoutMs: number): { id: number; response: Promise<StratumResponse> } {
    const id = this.nextId++;
    const response = new Promise<StratumResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Upstream request ${id} timed out`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(String(id), { resolve, reject, timer });
    });
    return { id, response };
  }

  resolve(response: StratumResponse): boolean {
    if (response.id === null) return false;
    const key = String(response.id);
    const pending = this.pending.get(key);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    pending.resolve(response);
    return true;
  }

  rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  has(id: StratumRequestId): boolean {
    return id !== null && this.pending.has(String(id));
  }
}
