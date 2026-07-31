/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
export interface BuildInfo {
    component: string;
    version: string;
    commit: string;
    buildDate: string;
    schemaVersion: number;
    migration: string;
}
export declare function getBuildInfo(component: string): BuildInfo;
/** Prints machine-readable JSON for any Node binary invoked with --version. */
export declare function printVersionAndExitIfRequested(component: string): boolean;
