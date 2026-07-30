/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { DuplicateShareStore } from './types.js';

export class InMemoryDuplicateShareStore implements DuplicateShareStore {
  private readonly fingerprints = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async reserve(fingerprint: string, expiresAt: Date): Promise<boolean> {
    this.removeExpired(this.now());
    if (this.fingerprints.has(fingerprint)) return false;
    this.fingerprints.set(fingerprint, expiresAt.getTime());
    return true;
  }

  async release(fingerprint: string): Promise<void> {
    this.fingerprints.delete(fingerprint);
  }

  private removeExpired(now: number): void {
    for (const [fingerprint, expiresAt] of this.fingerprints.entries()) {
      if (expiresAt <= now) this.fingerprints.delete(fingerprint);
    }
  }
}
