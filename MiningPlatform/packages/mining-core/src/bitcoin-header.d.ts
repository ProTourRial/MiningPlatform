/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import type { BitcoinMiningJob, BitcoinShareSubmission } from './types.js';
export declare function sha256(value: Uint8Array): Uint8Array;
export declare function sha256d(value: Uint8Array): Uint8Array;
export declare function buildCoinbase(job: BitcoinMiningJob, submission: BitcoinShareSubmission): Uint8Array;
export declare function buildMerkleRoot(job: BitcoinMiningJob, submission: BitcoinShareSubmission): Uint8Array;
export declare function resolveVersion(job: BitcoinMiningJob, submittedVersionBits?: string): string;
export declare function buildBlockHeader(job: BitcoinMiningJob, submission: BitcoinShareSubmission): Uint8Array;
export declare function calculateHeaderHash(job: BitcoinMiningJob, submission: BitcoinShareSubmission): {
    digest: Uint8Array;
    displayHash: string;
    numericValue: bigint;
};
