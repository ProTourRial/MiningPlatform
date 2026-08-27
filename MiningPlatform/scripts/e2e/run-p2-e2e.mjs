#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const manifestPath = process.argv[2] ?? 'scripts/e2e/p2-e2e-cases.json';
const baseUrl = process.env.E2E_BASE_URL;
const environment = process.env.E2E_ENV;
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 5_000);
const reportPath = process.env.E2E_REPORT_PATH ?? '.artifacts/p2-e2e-report.json';

function fail(message) {
  console.error(`E2E safety gate: ${message}`);
  process.exitCode = 2;
}

function assertSafeTarget() {
  if (!baseUrl) fail('E2E_BASE_URL is required.');
  if (!environment || !['disposable', 'staging'].includes(environment)) {
    fail('E2E_ENV must be disposable or staging.');
  }
  if (process.exitCode) return false;

  const parsed = new URL(baseUrl);
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const explicitlySyntheticRemote =
    process.env.E2E_ALLOW_REMOTE_SYNTHETIC === '1' && process.env.E2E_SYNTHETIC_CONFIRM === 'YES';
  if (!isLoopback && !explicitlySyntheticRemote) {
    fail('Remote targets require E2E_ALLOW_REMOTE_SYNTHETIC=1 and E2E_SYNTHETIC_CONFIRM=YES.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail('E2E_BASE_URL must use http or https.');
  }
  return !process.exitCode;
}

function redactedBody(text) {
  return text
    .replace(
      /(authorization|cookie|set-cookie|token|secret|password)\s*[:=]\s*[^,;\s}]+/gi,
      '$1:[REDACTED]',
    )
    .slice(0, 500);
}

async function requestCase(testCase) {
  const url = new URL(testCase.path, baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: testCase.method ?? 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const body = redactedBody(await response.text());
    const elapsedMs = Math.round(performance.now() - started);
    const expectedStatuses = testCase.expectedStatuses ?? [200];
    return {
      id: testCase.id,
      method: testCase.method ?? 'GET',
      path: testCase.path,
      status: response.status,
      expectedStatuses,
      elapsedMs,
      pass: expectedStatuses.includes(response.status),
      body,
    };
  } catch (error) {
    return {
      id: testCase.id,
      method: testCase.method ?? 'GET',
      path: testCase.path,
      expectedStatuses: testCase.expectedStatuses ?? [200],
      elapsedMs: Math.round(performance.now() - started),
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

if (assertSafeTarget()) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    fail('manifest must contain at least one case.');
  } else {
    const results = [];
    for (const testCase of manifest.cases) results.push(await requestCase(testCase));
    const report = {
      schemaVersion: 'p2-e2e-report.v1',
      environment,
      baseOrigin: new URL(baseUrl).origin,
      manifestPath,
      startedAt: new Date().toISOString(),
      results,
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length,
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ reportPath, passed: report.passed, failed: report.failed }));
    if (report.failed > 0) process.exitCode = 1;
  }
}
