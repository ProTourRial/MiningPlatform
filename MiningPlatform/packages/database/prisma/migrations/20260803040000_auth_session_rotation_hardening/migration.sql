-- MiningPlatform refresh-token family and replay hardening.
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

CREATE TYPE "AuthRefreshTokenStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REUSED', 'REVOKED');

ALTER TABLE "AuthSession" ADD COLUMN "tokenFamilyId" TEXT;

UPDATE "AuthSession"
SET "tokenFamilyId" = "id"
WHERE "tokenFamilyId" IS NULL;

ALTER TABLE "AuthSession" ALTER COLUMN "tokenFamilyId" SET NOT NULL;

CREATE TABLE "AuthRefreshToken" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "AuthRefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRefreshToken_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AuthRefreshToken" (
  "id", "sessionId", "familyId", "tokenHash", "status", "expiresAt", "revokedAt", "createdAt"
)
SELECT
  'refresh_' || md5("id"),
  "id",
  "tokenFamilyId",
  "refreshTokenHash",
  CASE
    WHEN "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP THEN 'ACTIVE'::"AuthRefreshTokenStatus"
    ELSE 'REVOKED'::"AuthRefreshTokenStatus"
  END,
  "expiresAt",
  "revokedAt",
  "createdAt"
FROM "AuthSession";

CREATE UNIQUE INDEX "AuthRefreshToken_tokenHash_key" ON "AuthRefreshToken"("tokenHash");
CREATE INDEX "AuthSession_tokenFamilyId_revokedAt_idx" ON "AuthSession"("tokenFamilyId", "revokedAt");
CREATE INDEX "AuthRefreshToken_familyId_status_idx" ON "AuthRefreshToken"("familyId", "status");
CREATE INDEX "AuthRefreshToken_sessionId_status_idx" ON "AuthRefreshToken"("sessionId", "status");
CREATE INDEX "AuthRefreshToken_expiresAt_status_idx" ON "AuthRefreshToken"("expiresAt", "status");

ALTER TABLE "AuthRefreshToken"
ADD CONSTRAINT "AuthRefreshToken_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
