-- MiningPlatform upstream resilience foundation.
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

ALTER TYPE "UpstreamSessionStatus" ADD VALUE IF NOT EXISTS 'RECOVERING';
ALTER TYPE "UpstreamSessionStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "UpstreamStatus" ADD VALUE IF NOT EXISTS 'CIRCUIT_OPEN';

ALTER TABLE "MinerSession"
  ADD COLUMN "activeUpstreamPoolKey" TEXT,
  ADD COLUMN "upstreamRecoveryStartedAt" TIMESTAMP(3),
  ADD COLUMN "upstreamRecoveredAt" TIMESTAMP(3),
  ADD COLUMN "upstreamFailoverCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UpstreamSession"
  ADD COLUMN "selectedAt" TIMESTAMP(3),
  ADD COLUMN "recoveryStartedAt" TIMESTAMP(3),
  ADD COLUMN "recoveredAt" TIMESTAMP(3),
  ADD COLUMN "reconnectCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failoverFromPoolId" TEXT,
  ADD COLUMN "lastError" TEXT;

ALTER TABLE "UpstreamPool"
  ADD COLUMN "poolKey" TEXT,
  ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "failureThreshold" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "recoveryTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "successfulConnections" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastConnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureAt" TIMESTAMP(3),
  ADD COLUMN "circuitOpenedUntil" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "capabilities" JSONB;

UPDATE "UpstreamPool"
SET "poolKey" = concat(
  trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))),
  '-',
  substr("id", 1, 8)
)
WHERE "poolKey" IS NULL;
ALTER TABLE "UpstreamPool" ALTER COLUMN "poolKey" SET NOT NULL;

CREATE UNIQUE INDEX "UpstreamPool_assetId_poolKey_key" ON "UpstreamPool"("assetId", "poolKey");
DROP INDEX IF EXISTS "UpstreamPool_assetId_status_priority_idx";
CREATE INDEX "UpstreamPool_assetId_status_priority_weight_idx" ON "UpstreamPool"("assetId", "status", "priority", "weight");
CREATE INDEX "UpstreamPool_status_circuitOpenedUntil_idx" ON "UpstreamPool"("status", "circuitOpenedUntil");

ALTER TABLE "UpstreamPool"
  ADD CONSTRAINT "UpstreamPool_priority_check" CHECK ("priority" >= 0),
  ADD CONSTRAINT "UpstreamPool_weight_check" CHECK ("weight" > 0),
  ADD CONSTRAINT "UpstreamPool_failureThreshold_check" CHECK ("failureThreshold" > 0),
  ADD CONSTRAINT "UpstreamPool_recoveryTimeoutMs_check" CHECK ("recoveryTimeoutMs" > 0),
  ADD CONSTRAINT "UpstreamPool_consecutiveFailures_check" CHECK ("consecutiveFailures" >= 0),
  ADD CONSTRAINT "UpstreamPool_successfulConnections_check" CHECK ("successfulConnections" >= 0);

ALTER TABLE "MinerSession"
  ADD CONSTRAINT "MinerSession_upstreamFailoverCount_check" CHECK ("upstreamFailoverCount" >= 0);

ALTER TABLE "UpstreamSession"
  ADD CONSTRAINT "UpstreamSession_reconnectCount_check" CHECK ("reconnectCount" >= 0);

COMMENT ON COLUMN "UpstreamPool"."poolKey" IS 'Stable configuration key used by Stratum failover and release-independent event payloads.';
COMMENT ON COLUMN "MinerSession"."activeUpstreamPoolKey" IS 'Current provider key selected by the multi-upstream manager.';
