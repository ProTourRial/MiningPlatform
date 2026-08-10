-- MiningPlatform control-plane foundation.
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
--
-- Alpha.3 recovery note:
-- 20260731190000_identity_access already introduced ApiKeyStatus and a legacy
-- ApiKey table. This migration evolves that legacy table into the canonical
-- Control Plane shape instead of creating the same enum/table a second time.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';

DO $$
BEGIN
  CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "NotificationChannelType" AS ENUM ('EMAIL', 'TELEGRAM', 'DISCORD', 'WEBHOOK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "NotificationChannelStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "UserSecurity"
  ADD COLUMN IF NOT EXISTS "totpPendingSecretEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'id-ID',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  "avatarUrl" TEXT,
  "preferences" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "userAgentHash" TEXT,
  "ipHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenEncrypted" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenEncrypted" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Evolve the legacy ApiKey table created by 20260731190000_identity_access.
ALTER TABLE "ApiKey"
  ADD COLUMN "keyId" TEXT,
  ADD COLUMN "scopes" TEXT[],
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "ApiKey"
SET
  "keyId" = "prefix",
  "scopes" = COALESCE("permissions", ARRAY[]::TEXT[]),
  "updatedAt" = "createdAt";

ALTER TABLE "ApiKey"
  ALTER COLUMN "keyId" SET NOT NULL,
  ALTER COLUMN "scopes" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "ApiKey"
  DROP CONSTRAINT IF EXISTS "ApiKey_userId_fkey";

DROP INDEX IF EXISTS "ApiKey_prefix_key";

ALTER TABLE "ApiKey"
  DROP COLUMN "prefix",
  DROP COLUMN "permissions",
  DROP COLUMN "createdBy";

CREATE TABLE "NotificationChannel" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationChannelType" NOT NULL,
  "status" "NotificationChannelStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "destinationEncrypted" TEXT NOT NULL,
  "events" TEXT[],
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- Backfill identity support records for users created before the Control Plane release.
INSERT INTO "UserSecurity" (
  "id", "userId", "totpEnabled", "recoveryCodesHash", "failedLoginCount", "passwordChangedAt", "createdAt", "updatedAt"
)
SELECT
  'security_' || md5(u."id"), u."id", false, ARRAY[]::TEXT[], 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "UserSecurity" s ON s."userId" = u."id"
WHERE s."userId" IS NULL;

INSERT INTO "UserProfile" ("id", "userId", "locale", "timezone", "createdAt", "updatedAt")
SELECT 'profile_' || md5(u."id"), u."id", 'id-ID', 'Asia/Jakarta', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "UserProfile" p ON p."userId" = u."id"
WHERE p."userId" IS NULL;

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_consumedAt_expiresAt_idx" ON "EmailVerificationToken"("userId", "consumedAt", "expiresAt");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_consumedAt_expiresAt_idx" ON "PasswordResetToken"("userId", "consumedAt", "expiresAt");
CREATE UNIQUE INDEX "ApiKey_keyId_key" ON "ApiKey"("keyId");
-- ApiKey_userId_status_idx and ApiKey_status_expiresAt_idx already exist
-- from 20260731190000_identity_access with the same canonical definitions.
CREATE INDEX "NotificationChannel_userId_status_type_idx" ON "NotificationChannel"("userId", "status", "type");

ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
