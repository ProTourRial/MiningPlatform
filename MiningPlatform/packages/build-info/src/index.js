/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import { RELEASE_DEFAULTS } from './generated.js';
function parseSchemaVersion(value) {
    if (!value)
        return RELEASE_DEFAULTS.schemaVersion;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`SCHEMA_VERSION must be a positive integer, received ${value}`);
    }
    return parsed;
}
export function getBuildInfo(component) {
    const normalizedComponent = component.trim();
    if (!normalizedComponent)
        throw new Error('Build-info component is required');
    return {
        component: normalizedComponent,
        version: process.env.MINING_BUILD_VERSION ?? RELEASE_DEFAULTS.version,
        commit: process.env.GIT_COMMIT ?? RELEASE_DEFAULTS.gitCommit,
        buildDate: process.env.BUILD_DATE ?? RELEASE_DEFAULTS.buildDate,
        schemaVersion: parseSchemaVersion(process.env.SCHEMA_VERSION),
        migration: process.env.SCHEMA_MIGRATION ?? RELEASE_DEFAULTS.migration,
    };
}
/** Prints machine-readable JSON for any Node binary invoked with --version. */
export function printVersionAndExitIfRequested(component) {
    if (!process.argv.slice(2).includes('--version'))
        return false;
    process.stdout.write(`${JSON.stringify(getBuildInfo(component), null, 2)}\n`);
    return true;
}
//# sourceMappingURL=index.js.map