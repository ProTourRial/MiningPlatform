#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const profilePath = process.argv[2] ?? 'scripts/load/p2-load-profile.json';
const profileId = process.argv[3] ?? 'smoke';
const baseUrl = process.env.LOAD_BASE_URL;
const environment = process.env.LOAD_ENV;
const mode = process.env.LOAD_MODE ?? 'synthetic-read-only';
const timeoutMs = Number(process.env.LOAD_TIMEOUT_MS ?? 5_000);
const reportPath = process.env.LOAD_REPORT_PATH ?? `.artifacts/p2-load-${profileId}.json`;

function fail(message) {
  console.error(`Load safety gate: ${message}`);
  process.exitCode = 2;
}

function validateTarget() {
  if (!baseUrl) fail('LOAD_BASE_URL is required.');
  if (!environment || !['disposable', 'staging'].includes(environment)) {
    fail('LOAD_ENV must be disposable or staging.');
  }
  if (mode !== 'synthetic-read-only') fail('LOAD_MODE must remain synthetic-read-only.');
  if (process.exitCode) return false;

  const parsed = new URL(baseUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const explicitlySyntheticRemote =
    process.env.LOAD_ALLOW_REMOTE_SYNTHETIC === '1' &&
    process.env.LOAD_SYNTHETIC_CONFIRM === 'YES';
  if (!loopback && !explicitlySyntheticRemote) {
    fail('Remote targets require LOAD_ALLOW_REMOTE_SYNTHETIC=1 and LOAD_SYNTHETIC_CONFIRM=YES.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail('LOAD_BASE_URL must use http or https.');
  return !process.exitCode;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function requestOnce(profile) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(profile.path, baseUrl), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, elapsedMs: performance.now() - started };
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: performance.now() - started,
      error: error instanceof Error ? error.name : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function worker(profile, state) {
  while (true) {
    const requestNumber = state.next;
    state.next += 1;
    if (requestNumber >= profile.maxRequests || performance.now() >= state.deadline) return;
    const result = await requestOnce(profile);
    state.results.push(result);
  }
}

if (validateTarget()) {
  const manifest = JSON.parse(await readFile(profilePath, 'utf8'));
  const profile = manifest.profiles?.find((candidate) => candidate.id === profileId);
  if (!profile) {
    fail(`profile ${profileId} was not found.`);
  } else if (
    !Number.isInteger(profile.concurrency) || profile.concurrency < 1 || profile.concurrency > 50 ||
    !Number.isInteger(profile.maxRequests) || profile.maxRequests < 1 || profile.maxRequests > 100_000
  ) {
    fail('profile concurrency/maxRequests is outside safe bounds.');
  } else {
    const startedAt = new Date().toISOString();
    const state = { next: 0, results: [], deadline: performance.now() + profile.durationSeconds * 1_000 };
    await Promise.all(Array.from({ length: profile.concurrency }, () => worker(profile, state)));
    const elapsedSeconds = Math.max(0.001, (performance.now() + 0 - (state.deadline - profile.durationSeconds * 1_000)) / 1_000);
    const latency = state.results.map((result) => result.elapsedMs);
    const passed = state.results.filter((result) => result.ok).length;
    const report = {
      schemaVersion: 'p2-load-report.v1',
      profileId,
      environment,
      mode,
      baseOrigin: new URL(baseUrl).origin,
      path: profile.path,
      concurrency: profile.concurrency,
      maxRequests: profile.maxRequests,
      durationSeconds: profile.durationSeconds,
      startedAt,
      finishedAt: new Date().toISOString(),
      requestCount: state.results.length,
      passed,
      failed: state.results.length - passed,
      throughputPerSecond: state.results.length / elapsedSeconds,
      errorRate: state.results.length === 0 ? 1 : (state.results.length - passed) / state.results.length,
      latencyMs: {
        p50: percentile(latency, 0.5),
        p95: percentile(latency, 0.95),
        p99: percentile(latency, 0.99),
      },
      statusCounts: Object.fromEntries(
        Object.entries(state.results.reduce((counts, result) => {
          const key = String(result.status ?? result.error ?? 'network_error');
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {})),
      ),
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ reportPath, requestCount: report.requestCount, errorRate: report.errorRate }));
    if (report.failed > 0) process.exitCode = 1;
  }
}
