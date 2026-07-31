/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { RELEASE_DEFAULTS } from './generated.js';

export interface BuildInfo {
  component: string;
  version: string;
  commit: string;
  buildDate: string;
  schemaVersion: number;
  migration: string;
}

function parseSchemaVersion(value: string | undefined): number {
  if (!value) return RELEASE_DEFAULTS.schemaVersion;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`SCHEMA_VERSION must be a positive integer, received ${value}`);
  }
  return parsed;
}

export function getBuildInfo(component: string): BuildInfo {
  const normalizedComponent = component.trim();
  if (!normalizedComponent) throw new Error('Build-info component is required');
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
export function printVersionAndExitIfRequested(component: string): boolean {
  if (!process.argv.slice(2).includes('--version')) return false;
  process.stdout.write(`${JSON.stringify(getBuildInfo(component), null, 2)}\n`);
  return true;
}
