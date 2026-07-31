-- MiningPlatform architecture and production miner identity foundation.
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

CREATE TYPE "WorkerCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "WorkerCredential" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "status" "WorkerCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastIpHash" TEXT,
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkerCredential_failedAttempts_check" CHECK ("failedAttempts" >= 0)
);

CREATE UNIQUE INDEX "WorkerCredential_credentialId_key" ON "WorkerCredential"("credentialId");
CREATE INDEX "WorkerCredential_workerId_status_idx" ON "WorkerCredential"("workerId", "status");
CREATE INDEX "WorkerCredential_status_expiresAt_idx" ON "WorkerCredential"("status", "expiresAt");
CREATE INDEX "WorkerCredential_lockedUntil_idx" ON "WorkerCredential"("lockedUntil");

ALTER TABLE "WorkerCredential"
  ADD CONSTRAINT "WorkerCredential_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "WorkerCredential" IS 'Hashed Stratum worker credentials. Plaintext secrets must never be persisted.';
COMMENT ON COLUMN "WorkerCredential"."secretHash" IS 'Versioned scrypt hash produced by @mining/security.';
