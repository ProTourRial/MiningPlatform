-- MiningPlatform v0.3.0 identity and access control plane foundation.
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

CREATE TYPE "UserSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "AccountTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "AuditCategory" AS ENUM ('AUTH', 'SECURITY', 'ACCOUNT', 'WORKER', 'CREDENTIAL', 'SYSTEM');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

ALTER TABLE "User"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'id-ID',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';

ALTER TABLE "WorkerCredential"
  ADD COLUMN "createdByUserId" TEXT;

ALTER TABLE "AuditLog"
  ADD COLUMN "category" "AuditCategory" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "requestId" TEXT;

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenFamilyId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "status" "UserSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "deviceName" TEXT,
  "deviceType" TEXT,
  "browser" TEXT,
  "operatingSystem" TEXT,
  "ipHash" TEXT,
  "countryCode" TEXT,
  "city" TEXT,
  "userAgentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AccountTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TotpEnrollment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encryptedSecret" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TotpEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "system" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "UserRoleAssignment" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "assignedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "permissions" TEXT[],
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSession_tokenFamilyId_refreshTokenHash_key" ON "UserSession"("tokenFamilyId", "refreshTokenHash");
CREATE INDEX "UserSession_userId_status_lastActiveAt_idx" ON "UserSession"("userId", "status", "lastActiveAt");
CREATE INDEX "UserSession_status_expiresAt_idx" ON "UserSession"("status", "expiresAt");
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX "AccountToken_userId_type_expiresAt_idx" ON "AccountToken"("userId", "type", "expiresAt");
CREATE INDEX "TotpEnrollment_userId_expiresAt_idx" ON "TotpEnrollment"("userId", "expiresAt");
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE INDEX "ApiKey_userId_status_idx" ON "ApiKey"("userId", "status");
CREATE INDEX "ApiKey_status_expiresAt_idx" ON "ApiKey"("status", "expiresAt");
CREATE INDEX "WorkerCredential_createdByUserId_createdAt_idx" ON "WorkerCredential"("createdByUserId", "createdAt");
CREATE INDEX "AuditLog_category_outcome_occurredAt_idx" ON "AuditLog"("category", "outcome", "occurredAt");
CREATE INDEX "AuditLog_sessionId_occurredAt_idx" ON "AuditLog"("sessionId", "occurredAt");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TotpEnrollment" ADD CONSTRAINT "TotpEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerCredential" ADD CONSTRAINT "WorkerCredential_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_expiresAt_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_expiresAt_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "TotpEnrollment" ADD CONSTRAINT "TotpEnrollment_expiresAt_check" CHECK ("expiresAt" > "createdAt");

INSERT INTO "Role" ("id", "key", "name", "description", "system", "updatedAt") VALUES
  ('role_user', 'USER', 'User', 'Standard mining platform user.', true, CURRENT_TIMESTAMP),
  ('role_owner', 'OWNER', 'Owner', 'Privileged platform owner role.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission" ("id", "key", "resource", "action", "description") VALUES
  ('perm_profile_read', 'profile.read', 'profile', 'read', 'Read own profile.'),
  ('perm_profile_write', 'profile.write', 'profile', 'write', 'Update own profile.'),
  ('perm_sessions_read', 'sessions.read', 'sessions', 'read', 'Read own sessions.'),
  ('perm_sessions_revoke', 'sessions.revoke', 'sessions', 'revoke', 'Revoke own sessions.'),
  ('perm_workers_read', 'workers.read', 'workers', 'read', 'Read owned workers.'),
  ('perm_workers_write', 'workers.write', 'workers', 'write', 'Create and update owned workers.'),
  ('perm_workers_delete', 'workers.delete', 'workers', 'delete', 'Soft-delete owned workers.'),
  ('perm_credentials_read', 'credentials.read', 'credentials', 'read', 'Read owned credentials.'),
  ('perm_credentials_write', 'credentials.write', 'credentials', 'write', 'Create and rotate credentials.'),
  ('perm_credentials_revoke', 'credentials.revoke', 'credentials', 'revoke', 'Revoke owned credentials.'),
  ('perm_audit_read', 'audit.read', 'audit', 'read', 'Read own audit trail.'),
  ('perm_system_read', 'system.read', 'system', 'read', 'Read user dashboard health summary.'),
  ('perm_api_keys_read', 'api-keys.read', 'api-keys', 'read', 'Read own API keys.'),
  ('perm_api_keys_write', 'api-keys.write', 'api-keys', 'write', 'Create own API keys.'),
  ('perm_api_keys_revoke', 'api-keys.revoke', 'api-keys', 'revoke', 'Revoke own API keys.'),
  ('perm_owner_all', '*', '*', '*', 'All owner permissions.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_user', "id" FROM "Permission" WHERE "key" IN (
  'profile.read','profile.write','sessions.read','sessions.revoke','workers.read','workers.write','workers.delete',
  'credentials.read','credentials.write','credentials.revoke','audit.read','system.read',
  'api-keys.read','api-keys.write','api-keys.revoke'
) ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_owner', "id" FROM "Permission" WHERE "key" = '*'
ON CONFLICT DO NOTHING;

INSERT INTO "UserRoleAssignment" ("userId", "roleId")
SELECT "id", CASE WHEN "role" = 'OWNER' THEN 'role_owner' ELSE 'role_user' END
FROM "User"
ON CONFLICT DO NOTHING;

COMMENT ON TABLE "UserSession" IS 'Refresh-token-backed web sessions with device metadata and revocation lifecycle.';
COMMENT ON TABLE "AccountToken" IS 'Single-use hashed email verification and password reset tokens.';
COMMENT ON TABLE "RolePermission" IS 'Permission-based RBAC mapping; ownership remains enforced by domain services.';
COMMENT ON COLUMN "WorkerCredential"."createdByUserId" IS 'User or operator that created the credential; secret remains one-time display only.';
