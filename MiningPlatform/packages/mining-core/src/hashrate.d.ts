/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import type { HashrateShare, HashrateWindowResult } from './types.js';
export declare function calculateHashrateFromAccumulatedDifficulty(accumulatedDifficulty: string, shareCount: number, windowSeconds: number): HashrateWindowResult;
export declare function calculateHashrateWindow(shares: readonly HashrateShare[], windowSeconds: number, at?: Date): HashrateWindowResult;
