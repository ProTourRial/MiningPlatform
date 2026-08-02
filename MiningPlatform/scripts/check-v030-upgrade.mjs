/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.3.0';
const migrationName = '20260731190000_identity_access';
const requiredFiles = [
  'pnpm-lock.yaml',
  'release-manifest.json',
  'docs/adr/0009-identity-access-session-rbac.md',
  'docs/architecture/identity-access-v030.md',
  'docs/api/identity-access.md',
  'docs/releases/v0.3.0.md',
  'docs/releases/v0.3.0-upgrade.md',
  'docs/events/catalog.md',
  'apps/api/src/modules/auth/auth.service.ts',
  'apps/api/src/modules/auth/auth-rate-limit.service.ts',
  'apps/api/src/modules/workers/workers.service.ts',
  'apps/api/src/modules/credentials/credentials.service.ts',
  'apps/api/src/modules/api-keys/api-keys.service.ts',
  'apps/web/src/components/dashboard/control-plane/security-panel.tsx',
  'apps/web/src/components/dashboard/control-plane/audit-log-panel.tsx',
  `packages/database/prisma/migrations/${migrationName}/migration.sql`,
];

async function exists(relativePath) {
  try { await stat(join(root, relativePath)); return true; } catch { return false; }
}

function duplicateSchemaFields(schema) {
  const failures = [];
  for (const kind of ['model', 'enum']) {
    const expression = new RegExp(`${kind}\\s+(\\w+)\\s*\\{([\\s\\S]*?)\\n\\}`, 'g');
    for (const match of schema.matchAll(expression)) {
      const seen = new Set();
      for (const raw of match[2].split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
        const name = line.split(/\s+/)[0];
        if (seen.has(name)) failures.push(`Duplicate ${kind} member ${match[1]}.${name}`);
        seen.add(name);
      }
    }
  }
  return failures;
}

const failures = [];
for (const relativePath of requiredFiles) if (!(await exists(relativePath))) failures.push(`Required file is missing: ${relativePath}`);
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion) failures.push(`Root package version must be ${expectedVersion}`);
const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (manifest.version !== expectedVersion) failures.push('release-manifest version mismatch');
if (manifest.releaseName !== 'Identity & Access') failures.push('release-manifest releaseName mismatch');
if (manifest.schemaVersion !== 7) failures.push('release-manifest schemaVersion must be 7');
if (manifest.migration !== migrationName) failures.push('release-manifest migration mismatch');
if (!manifest.compatibleFrom?.includes('0.2.0-alpha.6')) failures.push('compatibleFrom must include 0.2.0-alpha.6');

const schema = await readFile(join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
for (const fragment of ['model UserSession', 'model AccountToken', 'model TotpEnrollment', 'model Role', 'model Permission', 'model ApiKey', 'createdByUserId']) {
  if (!schema.includes(fragment)) failures.push(`Prisma schema is missing: ${fragment}`);
}
failures.push(...duplicateSchemaFields(schema));
const migration = await readFile(join(root, `packages/database/prisma/migrations/${migrationName}/migration.sql`), 'utf8');
for (const fragment of ['CREATE TABLE "UserSession"', 'CREATE TABLE "Role"', 'CREATE TABLE "ApiKey"', 'UserSession_expiresAt_check', 'role_owner']) {
  if (!migration.includes(fragment)) failures.push(`v0.3.0 migration is missing: ${fragment}`);
}
const events = await readFile(join(root, 'packages/shared/src/events.ts'), 'utf8');
for (const fragment of ['accountRegistered', 'loginSucceeded', 'sessionRevoked', 'twoFactorEnabled', 'apiKeyCreated', 'workerCreated']) {
  if (!events.includes(fragment)) failures.push(`Identity event contract is missing: ${fragment}`);
}
const authModule = await readFile(join(root, 'apps/api/src/modules/auth/auth.module.ts'), 'utf8');
if (!authModule.includes('AuthRateLimitService')) failures.push('Auth rate limiter is not registered');

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write('v0.3.0 static upgrade checks passed.\n');
