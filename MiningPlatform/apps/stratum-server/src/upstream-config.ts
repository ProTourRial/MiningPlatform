/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { UpstreamPoolDefinition } from '@mining/upstream-stratum';

interface RawPoolDefinition {
  id?: unknown;
  name?: unknown;
  host?: unknown;
  port?: unknown;
  tls?: unknown;
  serverName?: unknown;
  username?: unknown;
  password?: unknown;
  userAgent?: unknown;
  priority?: unknown;
  weight?: unknown;
  enabled?: unknown;
  failureThreshold?: unknown;
  recoveryTimeoutMs?: unknown;
  connectTimeoutMs?: unknown;
  responseTimeoutMs?: unknown;
  maximumLineBytes?: unknown;
}

export interface LegacyUpstreamConfig {
  host: string;
  port: number;
  tls: boolean;
  serverName?: string;
  username: string;
  password: string;
  userAgent: string;
  connectTimeoutMs: number;
  responseTimeoutMs: number;
  maximumLineBytes: number;
}

export function parseUpstreamPoolsJson(
  value: string | undefined,
  legacy: LegacyUpstreamConfig,
): UpstreamPoolDefinition[] {
  if (!value?.trim()) return [legacyPool(legacy)];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`UPSTREAM_POOLS_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('UPSTREAM_POOLS_JSON must be a non-empty array');
  }
  return parsed.map((entry, index) => parsePool(entry as RawPoolDefinition, index, legacy));
}

function parsePool(raw: RawPoolDefinition, index: number, legacy: LegacyUpstreamConfig): UpstreamPoolDefinition {
  const path = `UPSTREAM_POOLS_JSON[${index}]`;
  const id = requiredString(raw.id, `${path}.id`);
  return {
    id,
    name: optionalString(raw.name) ?? id,
    priority: nonNegativeInteger(raw.priority, 100, `${path}.priority`),
    weight: positiveInteger(raw.weight, 100, `${path}.weight`),
    enabled: raw.enabled === undefined ? true : booleanValue(raw.enabled, `${path}.enabled`),
    failureThreshold: positiveInteger(raw.failureThreshold, 3, `${path}.failureThreshold`),
    recoveryTimeoutMs: positiveInteger(raw.recoveryTimeoutMs, 30_000, `${path}.recoveryTimeoutMs`),
    endpoint: {
      host: requiredString(raw.host, `${path}.host`),
      port: positiveInteger(raw.port, 0, `${path}.port`),
      tls: raw.tls === undefined ? false : booleanValue(raw.tls, `${path}.tls`),
      serverName: optionalString(raw.serverName),
      username: requiredString(raw.username, `${path}.username`),
      password: requiredString(raw.password, `${path}.password`),
      userAgent: optionalString(raw.userAgent) ?? legacy.userAgent,
      connectTimeoutMs: positiveInteger(raw.connectTimeoutMs, legacy.connectTimeoutMs, `${path}.connectTimeoutMs`),
      responseTimeoutMs: positiveInteger(raw.responseTimeoutMs, legacy.responseTimeoutMs, `${path}.responseTimeoutMs`),
      maximumLineBytes: positiveInteger(raw.maximumLineBytes, legacy.maximumLineBytes, `${path}.maximumLineBytes`),
    },
  };
}

function legacyPool(config: LegacyUpstreamConfig): UpstreamPoolDefinition {
  return {
    id: 'primary',
    name: 'Primary upstream',
    priority: 100,
    weight: 100,
    enabled: true,
    failureThreshold: 3,
    recoveryTimeoutMs: 30_000,
    endpoint: {
      host: config.host,
      port: config.port,
      tls: config.tls,
      serverName: config.serverName,
      username: config.username,
      password: config.password,
      userAgent: config.userAgent,
      connectTimeoutMs: config.connectTimeoutMs,
      responseTimeoutMs: config.responseTimeoutMs,
      maximumLineBytes: config.maximumLineBytes,
    },
  };
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('Expected a string value');
  return value.trim() || undefined;
}

function positiveInteger(value: unknown, fallback: number, path: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${path} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value: unknown, fallback: number, path: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${path} must be a non-negative integer`);
  return parsed;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}
