/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class MonitoringRuntimeState {
  private connected = false;
  private lastError?: string;
  private lastEventAt?: string;

  markConnected(): void {
    this.connected = true;
    this.lastError = undefined;
  }

  markDisconnected(error?: unknown): void {
    this.connected = false;
    this.lastError = error instanceof Error ? error.message : error ? String(error) : undefined;
  }

  markEvent(): void {
    this.lastEventAt = new Date().toISOString();
  }

  snapshot() {
    return {
      consumerConnected: this.connected,
      lastEventAt: this.lastEventAt ?? null,
      lastError: this.lastError ?? null,
    };
  }
}
