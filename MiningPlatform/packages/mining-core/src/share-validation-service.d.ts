/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import type { DuplicateShareStore, ShareValidationContext, ShareValidationResult } from './types.js';
export declare class BitcoinShareValidationService {
    private readonly duplicates;
    private readonly now;
    private readonly maximumFutureTimeSeconds;
    constructor(duplicates: DuplicateShareStore, now?: () => Date, maximumFutureTimeSeconds?: number);
    validate(context: ShareValidationContext): Promise<ShareValidationResult>;
    releaseReservation(fingerprint: string): Promise<void>;
}
