/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import type { ShareState } from './types.js';
export declare function transitionShareState(from: ShareState, to: ShareState): ShareState;
export declare function canTransitionShareState(from: ShareState, to: ShareState): boolean;
