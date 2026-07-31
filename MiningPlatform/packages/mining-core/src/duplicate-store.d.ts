/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import type { DuplicateShareStore } from './types.js';
export declare class InMemoryDuplicateShareStore implements DuplicateShareStore {
    private readonly now;
    private readonly fingerprints;
    constructor(now?: () => number);
    reserve(fingerprint: string, expiresAt: Date): Promise<boolean>;
    release(fingerprint: string): Promise<void>;
    private removeExpired;
}
