/** MiningPlatform — Author: Abia Nugrahanto */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const expectedVersion = '0.3.0-alpha.1';
const migrationName = '20260803010000_control_plane_foundation';
const requiredFiles = [
  'pnpm-lock.yaml',
  'release-manifest.json',
  'docs/adr/0009-control-plane-identity-and-session.md',
  'docs/architecture/control-plane-foundation.md',
  'docs/releases/v0.3.0-alpha.1.md',
  'docs/releases/v0.3.0-alpha.1-upgrade.md',
  'docs/releases/v0.3.0-alpha.1-implementation-report.md',
  'apps/web/src/app/verify-email/page.tsx',
  'apps/web/src/app/forgot-password/page.tsx',
  'apps/web/src/app/reset-password/page.tsx',
  'apps/web/src/components/dashboard/admin-management-panel.tsx',
  'scripts/user-role-cli.ts',
  'apps/api/src/modules/auth/auth.service.ts',
  'apps/api/src/modules/auth/auth.guard.ts',
  'apps/api/src/modules/api-keys/api-keys.service.ts',
  'apps/api/src/modules/workers/workers.service.ts',
  'packages/security/src/auth-token.ts',
  'packages/security/src/password.ts',
  'packages/security/src/totp.ts',
  `packages/database/prisma/migrations/${migrationName}/migration.sql`,
];

async function exists(relativePath) {
  try { await stat(join(root, relativePath)); return true; } catch { return false; }
}

const failures = [];
for (const relativePath of requiredFiles) if (!(await exists(relativePath))) failures.push(`Required file is missing: ${relativePath}`);
if (await exists('.git')) failures.push('Full release must not contain .git metadata');

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== expectedVersion) failures.push(`Root package version must be ${expectedVersion}`);

const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (manifest.version !== expectedVersion) failures.push('release-manifest version mismatch');
if (manifest.schemaVersion !== 7) failures.push('release-manifest schemaVersion must be 7');
if (manifest.migration !== migrationName) failures.push('release-manifest migration mismatch');
if (!manifest.compatibleFrom?.includes('0.2.0-alpha.6')) failures.push('compatibleFrom must include 0.2.0-alpha.6');

const schema = await readFile(join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
for (const fragment of ['model AuthSession', 'model ApiKey', 'model EmailVerificationToken', 'model PasswordResetToken', 'model NotificationChannel', 'ADMIN']) {
  if (!schema.includes(fragment)) failures.push(`Prisma schema is missing: ${fragment}`);
}


const migration = await readFile(join(root, `packages/database/prisma/migrations/${migrationName}/migration.sql`), 'utf8');
for (const fragment of ['INSERT INTO "UserSecurity"', 'INSERT INTO "UserProfile"']) {
  if (!migration.includes(fragment)) failures.push(`Control Plane migration is missing backfill: ${fragment}`);
}

const authService = await readFile(join(root, 'apps/api/src/modules/auth/auth.service.ts'), 'utf8');
for (const fragment of ['register(', 'verifyEmail(', 'login(', 'refresh(', 'forgotPassword(', 'resetPassword(', 'beginTotpSetup(']) {
  if (!authService.includes(fragment)) failures.push(`Auth service is missing: ${fragment}`);
}

const workerService = await readFile(join(root, 'apps/api/src/modules/workers/workers.service.ts'), 'utf8');
for (const fragment of ['generateWorkerCredential', 'rotateCredential', 'WORKER_CREDENTIAL_V1']) {
  if (!workerService.includes(fragment)) failures.push(`Worker control plane is missing: ${fragment}`);
}

const supportedEvents = await readFile(join(root, 'apps/mining-worker/src/supported-events.ts'), 'utf8');
if (!supportedEvents.includes('MiningEvents.workerDeviceDetected')) failures.push('workerDeviceDetected must be registered in supportedEvents');

const compose = await readFile(join(root, 'docker-compose.yml'), 'utf8');
for (const fragment of ['AUTH_JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'UPSTREAM_DRIVER: ${UPSTREAM_DRIVER:-multi}', 'UPSTREAM_POOLS_JSON', 'VARDIFF_ENABLED']) {
  if (!compose.includes(fragment)) failures.push(`docker-compose.yml is missing: ${fragment}`);
}

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('v0.3.0-alpha.1 static release checks passed.\n');
}
