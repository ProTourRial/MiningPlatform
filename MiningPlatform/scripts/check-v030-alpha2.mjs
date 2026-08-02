/** MiningPlatform — Author: Abia Nugrahanto */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.3.0-alpha.2';
const migrationName = '20260803040000_auth_session_rotation_hardening';
const requiredFiles = [
  'pnpm-lock.yaml',
  'release-manifest.json',
  `packages/database/prisma/migrations/${migrationName}/migration.sql`,
  'apps/api/src/auth.integration.test.ts',
  'apps/api/src/auth-config.test.ts',
  'apps/api/src/modules/auth/auth.service.ts',
  'apps/api/src/modules/auth/auth.guard.ts',
  'apps/api/src/modules/workers/workers.service.ts',
  'apps/outbox-worker/src/email-delivery.ts',
  'packages/shared/src/payment-addresses.ts',
  'scripts/verify-v030-alpha2-migration.mjs',
  'docs/releases/v0.3.0-alpha.2.md',
  'docs/releases/v0.3.0-alpha.2-upgrade.md',
  'docs/releases/v0.3.0-alpha.2-comparison.md',
  'docs/operations/database-backup-and-rollback.md',
];

async function exists(relativePath) {
  try { await stat(join(root, relativePath)); return true; } catch { return false; }
}

const failures = [];
for (const relativePath of requiredFiles) {
  if (!(await exists(relativePath))) failures.push(`Required file is missing: ${relativePath}`);
}
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion) failures.push(`Root package version must be ${expectedVersion}`);

const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (manifest.version !== expectedVersion) failures.push('release-manifest version mismatch');
if (manifest.schemaVersion !== 8) failures.push('release-manifest schemaVersion must be 8');
if (manifest.migration !== migrationName) failures.push('release-manifest migration mismatch');

const schema = await readFile(join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
for (const fragment of ['enum AuthRefreshTokenStatus', 'model AuthRefreshToken', 'tokenFamilyId']) {
  if (!schema.includes(fragment)) failures.push(`Prisma schema is missing: ${fragment}`);
}

const authService = await readFile(join(root, 'apps/api/src/modules/auth/auth.service.ts'), 'utf8');
for (const fragment of ['authRefreshToken.updateMany', 'RefreshTokenReuseError', 'revokeTokenFamily']) {
  if (!authService.includes(fragment)) failures.push(`Auth rotation hardening is missing: ${fragment}`);
}

const workerService = await readFile(join(root, 'apps/api/src/modules/workers/workers.service.ts'), 'utf8');
for (const fragment of ['Worker name already exists in this mining account', "error.code === 'P2002'", 'prisma.$transaction']) {
  if (!workerService.includes(fragment)) failures.push(`Worker hardening is missing: ${fragment}`);
}

const guard = await readFile(join(root, 'apps/api/src/modules/auth/auth.guard.ts'), 'utf8');
for (const fragment of ['authenticateApiKey', "request.headers['x-api-key']", 'apiKey.scopes']) {
  if (!guard.includes(fragment)) failures.push(`API-key request authentication is missing: ${fragment}`);
}

const emailDelivery = await readFile(join(root, 'apps/outbox-worker/src/email-delivery.ts'), 'utf8');
for (const fragment of ['https://api.resend.com/emails', 'idempotency-key', 'EMAIL_PROVIDER']) {
  if (!emailDelivery.includes(fragment)) failures.push(`Production email adapter is missing: ${fragment}`);
}

const payments = await readFile(join(root, 'packages/shared/src/payment-addresses.ts'), 'utf8');
for (const fragment of [
  '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc',
  '7vjhb5NYBBXzd8eocm5Jg3KoqwTXrPs34ipFsyA8urX2',
  'THSeYj8TMxF14aQm5JFrvF3eP4q6f98rZg',
  '1P6FZk2jiRuFkP8m4RuAVi9QVYWvhDCtrA',
  'enabledByDefault: false',
]) {
  if (!payments.includes(fragment)) failures.push(`Payment receiver configuration is missing: ${fragment}`);
}

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('v0.3.0-alpha.2 static release checks passed.\n');
}
