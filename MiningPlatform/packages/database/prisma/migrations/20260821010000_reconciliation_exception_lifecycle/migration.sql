-- MiningPlatform
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
--
-- Reconciliation exception lifecycle: immutable corrected evidence, two-owner
-- approval, versioned replacement reconciliations, and fail-closed transitions.

CREATE TYPE "ReconciliationResolutionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "UpstreamReconciliation"
  DROP CONSTRAINT "UpstreamReconciliation_rewardPeriodId_key",
  ADD COLUMN "importedByUserId" TEXT;

-- v10 could preserve a legacy RESOLVED label without lifecycle metadata. Exact
-- rows become MATCHED; non-zero legacy resolutions retain their history with an
-- explicit marker so the new state invariant can be applied without data loss.
UPDATE "UpstreamReconciliation"
SET
  "status" = 'MATCHED',
  "resolvedAt" = NULL,
  "exceptionCode" = NULL,
  "exceptionMessage" = NULL
WHERE "status" = 'RESOLVED' AND "varianceAtomic" = 0;

UPDATE "UpstreamReconciliation"
SET
  "resolvedAt" = COALESCE("resolvedAt", "updatedAt"),
  "exceptionCode" = COALESCE("exceptionCode", 'LEGACY_RESOLVED_VARIANCE'),
  "exceptionMessage" = COALESCE("exceptionMessage", 'Legacy resolved reconciliation retained during schema v11 upgrade')
WHERE "status" = 'RESOLVED' AND "varianceAtomic" <> 0;

CREATE INDEX "UpstreamReconciliation_rewardPeriodId_status_importedAt_idx"
  ON "UpstreamReconciliation"("rewardPeriodId", "status", "importedAt");

CREATE UNIQUE INDEX "UpstreamReconciliation_rewardPeriodId_active_key"
  ON "UpstreamReconciliation"("rewardPeriodId")
  WHERE "status" IN ('PENDING', 'MATCHED', 'EXCEPTION');

ALTER TABLE "UpstreamReconciliation"
  ADD CONSTRAINT "UpstreamReconciliation_importedByUserId_fkey"
    FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "UpstreamReconciliation_resolution_state_check" CHECK (
    ("status" = 'PENDING')
    OR (
      "status" = 'MATCHED'
      AND "varianceAtomic" = 0
      AND "toleranceAtomic" = 0
      AND "exceptionCode" IS NULL
      AND "exceptionMessage" IS NULL
      AND "resolvedAt" IS NULL
    )
    OR (
      "status" = 'EXCEPTION'
      AND ABS("varianceAtomic") > "toleranceAtomic"
      AND "exceptionCode" IS NOT NULL
      AND "exceptionMessage" IS NOT NULL
      AND "resolvedAt" IS NULL
    )
    OR (
      "status" = 'RESOLVED'
      AND ABS("varianceAtomic") > "toleranceAtomic"
      AND "exceptionCode" IS NOT NULL
      AND "exceptionMessage" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
    )
  );

CREATE TABLE "ReconciliationResolution" (
  "id" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "requestIdempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "correctedSourceReference" TEXT NOT NULL,
  "correctedSourceChecksum" TEXT NOT NULL,
  "correctedImportIdempotencyKey" TEXT NOT NULL,
  "correctedGrossAtomic" BIGINT NOT NULL,
  "correctedUpstreamFeeAtomic" BIGINT NOT NULL,
  "correctedNetworkFeeAtomic" BIGINT NOT NULL,
  "correctedReceivedAtomic" BIGINT NOT NULL,
  "correctedInternalExpectedAtomic" BIGINT NOT NULL,
  "correctedVarianceAtomic" BIGINT NOT NULL,
  "correctedToleranceAtomic" BIGINT NOT NULL DEFAULT 0,
  "requestReason" TEXT NOT NULL,
  "status" "ReconciliationResolutionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "decidedByUserId" TEXT,
  "decisionReason" TEXT,
  "replacementReconciliationId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationResolution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReconciliationResolution_corrected_evidence_check" CHECK (
    "correctedGrossAtomic" >= 0
    AND "correctedUpstreamFeeAtomic" >= 0
    AND "correctedNetworkFeeAtomic" >= 0
    AND "correctedReceivedAtomic" >= 0
    AND "correctedInternalExpectedAtomic" >= 0
    AND "correctedToleranceAtomic" = 0
    AND "correctedVarianceAtomic" = 0
    AND "correctedGrossAtomic" = "correctedUpstreamFeeAtomic" + "correctedNetworkFeeAtomic" + "correctedInternalExpectedAtomic"
    AND "correctedReceivedAtomic" = "correctedInternalExpectedAtomic"
    AND "correctedSourceChecksum" ~ '^[0-9a-f]{64}$'
    AND LENGTH(BTRIM("requestReason")) >= 20
  ),
  CONSTRAINT "ReconciliationResolution_decision_check" CHECK (
    ("status" = 'PENDING' AND "decidedByUserId" IS NULL AND "decisionReason" IS NULL AND "decidedAt" IS NULL AND "replacementReconciliationId" IS NULL)
    OR (
      "status" = 'APPROVED'
      AND "decidedByUserId" IS NOT NULL
      AND "decidedByUserId" <> "requestedByUserId"
      AND LENGTH(BTRIM("decisionReason")) >= 20
      AND "decidedAt" IS NOT NULL
      AND "replacementReconciliationId" IS NOT NULL
    )
    OR (
      "status" = 'REJECTED'
      AND "decidedByUserId" IS NOT NULL
      AND "decidedByUserId" <> "requestedByUserId"
      AND LENGTH(BTRIM("decisionReason")) >= 20
      AND "decidedAt" IS NOT NULL
      AND "replacementReconciliationId" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "ReconciliationResolution_reconciliationId_key"
  ON "ReconciliationResolution"("reconciliationId");
CREATE UNIQUE INDEX "ReconciliationResolution_requestIdempotencyKey_key"
  ON "ReconciliationResolution"("requestIdempotencyKey");
CREATE UNIQUE INDEX "ReconciliationResolution_correctedSourceReference_key"
  ON "ReconciliationResolution"("correctedSourceReference");
CREATE UNIQUE INDEX "ReconciliationResolution_correctedImportIdempotencyKey_key"
  ON "ReconciliationResolution"("correctedImportIdempotencyKey");
CREATE UNIQUE INDEX "ReconciliationResolution_replacementReconciliationId_key"
  ON "ReconciliationResolution"("replacementReconciliationId");
CREATE INDEX "ReconciliationResolution_status_requestedAt_idx"
  ON "ReconciliationResolution"("status", "requestedAt");
CREATE INDEX "ReconciliationResolution_correlationId_requestedAt_idx"
  ON "ReconciliationResolution"("correlationId", "requestedAt");
CREATE INDEX "ReconciliationResolution_requestedByUserId_requestedAt_idx"
  ON "ReconciliationResolution"("requestedByUserId", "requestedAt");
CREATE INDEX "ReconciliationResolution_decidedByUserId_decidedAt_idx"
  ON "ReconciliationResolution"("decidedByUserId", "decidedAt");

ALTER TABLE "ReconciliationResolution"
  ADD CONSTRAINT "ReconciliationResolution_reconciliationId_fkey"
    FOREIGN KEY ("reconciliationId") REFERENCES "UpstreamReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReconciliationResolution_replacementReconciliationId_fkey"
    FOREIGN KEY ("replacementReconciliationId") REFERENCES "UpstreamReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReconciliationResolution_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReconciliationResolution_decidedByUserId_fkey"
    FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION mining_guard_upstream_reconciliation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Upstream reconciliation evidence cannot be deleted';
  END IF;

  IF OLD."status" = 'MATCHED'
     AND NEW."status" = 'MATCHED'
     AND OLD."reconciledAt" IS NULL
     AND NEW."reconciledAt" IS NOT NULL
     AND ROW(
       NEW."id", NEW."assetId", NEW."upstreamPoolId", NEW."rewardPeriodId", NEW."importedByUserId",
       NEW."upstreamGrossReward", NEW."upstreamFee", NEW."receivedAmount", NEW."internalExpectedAmount",
       NEW."varianceAmount", NEW."sourceReference", NEW."sourceChecksum", NEW."importIdempotencyKey",
       NEW."upstreamGrossAtomic", NEW."upstreamFeeAtomic", NEW."networkFeeAtomic", NEW."receivedAtomic",
       NEW."internalExpectedAtomic", NEW."varianceAtomic", NEW."toleranceAtomic", NEW."exceptionCode",
       NEW."exceptionMessage", NEW."importedAt", NEW."resolvedAt", NEW."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       OLD."id", OLD."assetId", OLD."upstreamPoolId", OLD."rewardPeriodId", OLD."importedByUserId",
       OLD."upstreamGrossReward", OLD."upstreamFee", OLD."receivedAmount", OLD."internalExpectedAmount",
       OLD."varianceAmount", OLD."sourceReference", OLD."sourceChecksum", OLD."importIdempotencyKey",
       OLD."upstreamGrossAtomic", OLD."upstreamFeeAtomic", OLD."networkFeeAtomic", OLD."receivedAtomic",
       OLD."internalExpectedAtomic", OLD."varianceAtomic", OLD."toleranceAtomic", OLD."exceptionCode",
       OLD."exceptionMessage", OLD."importedAt", OLD."resolvedAt", OLD."createdAt"
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'EXCEPTION'
     AND NEW."status" = 'RESOLVED'
     AND OLD."resolvedAt" IS NULL
     AND NEW."resolvedAt" IS NOT NULL
     AND ROW(
       NEW."id", NEW."assetId", NEW."upstreamPoolId", NEW."rewardPeriodId", NEW."importedByUserId",
       NEW."upstreamGrossReward", NEW."upstreamFee", NEW."receivedAmount", NEW."internalExpectedAmount",
       NEW."varianceAmount", NEW."sourceReference", NEW."sourceChecksum", NEW."importIdempotencyKey",
       NEW."upstreamGrossAtomic", NEW."upstreamFeeAtomic", NEW."networkFeeAtomic", NEW."receivedAtomic",
       NEW."internalExpectedAtomic", NEW."varianceAtomic", NEW."toleranceAtomic", NEW."exceptionCode",
       NEW."exceptionMessage", NEW."importedAt", NEW."reconciledAt", NEW."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       OLD."id", OLD."assetId", OLD."upstreamPoolId", OLD."rewardPeriodId", OLD."importedByUserId",
       OLD."upstreamGrossReward", OLD."upstreamFee", OLD."receivedAmount", OLD."internalExpectedAmount",
       OLD."varianceAmount", OLD."sourceReference", OLD."sourceChecksum", OLD."importIdempotencyKey",
       OLD."upstreamGrossAtomic", OLD."upstreamFeeAtomic", OLD."networkFeeAtomic", OLD."receivedAtomic",
       OLD."internalExpectedAtomic", OLD."varianceAtomic", OLD."toleranceAtomic", OLD."exceptionCode",
       OLD."exceptionMessage", OLD."importedAt", OLD."reconciledAt", OLD."createdAt"
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Upstream reconciliation evidence is immutable outside approved lifecycle transitions';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UpstreamReconciliation_immutable_trigger"
BEFORE UPDATE OR DELETE ON "UpstreamReconciliation"
FOR EACH ROW EXECUTE FUNCTION mining_guard_upstream_reconciliation();

CREATE OR REPLACE FUNCTION mining_guard_reconciliation_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Reconciliation resolution records cannot be deleted';
  END IF;
  IF OLD."status" = 'PENDING'
     AND NEW."status" IN ('APPROVED', 'REJECTED')
     AND ROW(
       NEW."id", NEW."reconciliationId", NEW."requestIdempotencyKey", NEW."correlationId", NEW."correctedSourceReference",
       NEW."correctedSourceChecksum", NEW."correctedImportIdempotencyKey", NEW."correctedGrossAtomic",
       NEW."correctedUpstreamFeeAtomic", NEW."correctedNetworkFeeAtomic", NEW."correctedReceivedAtomic",
       NEW."correctedInternalExpectedAtomic", NEW."correctedVarianceAtomic", NEW."correctedToleranceAtomic",
       NEW."requestReason", NEW."requestedByUserId", NEW."requestedAt", NEW."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       OLD."id", OLD."reconciliationId", OLD."requestIdempotencyKey", OLD."correlationId", OLD."correctedSourceReference",
       OLD."correctedSourceChecksum", OLD."correctedImportIdempotencyKey", OLD."correctedGrossAtomic",
       OLD."correctedUpstreamFeeAtomic", OLD."correctedNetworkFeeAtomic", OLD."correctedReceivedAtomic",
       OLD."correctedInternalExpectedAtomic", OLD."correctedVarianceAtomic", OLD."correctedToleranceAtomic",
       OLD."requestReason", OLD."requestedByUserId", OLD."requestedAt", OLD."createdAt"
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Reconciliation resolution records are immutable after creation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReconciliationResolution_immutable_trigger"
BEFORE UPDATE OR DELETE ON "ReconciliationResolution"
FOR EACH ROW EXECUTE FUNCTION mining_guard_reconciliation_resolution();

CREATE OR REPLACE FUNCTION mining_validate_approved_reconciliation_resolution()
RETURNS TRIGGER AS $$
DECLARE original_row "UpstreamReconciliation"%ROWTYPE;
DECLARE replacement_row "UpstreamReconciliation"%ROWTYPE;
BEGIN
  IF NEW."status" <> 'APPROVED' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO original_row FROM "UpstreamReconciliation" WHERE "id" = NEW."reconciliationId";
  SELECT * INTO replacement_row FROM "UpstreamReconciliation" WHERE "id" = NEW."replacementReconciliationId";
  IF original_row."status" <> 'RESOLVED'
     OR replacement_row."status" <> 'MATCHED'
     OR replacement_row."rewardPeriodId" <> original_row."rewardPeriodId"
     OR replacement_row."assetId" <> original_row."assetId"
     OR replacement_row."upstreamPoolId" <> original_row."upstreamPoolId"
     OR replacement_row."sourceReference" <> NEW."correctedSourceReference"
     OR replacement_row."sourceChecksum" <> NEW."correctedSourceChecksum"
     OR replacement_row."importIdempotencyKey" <> NEW."correctedImportIdempotencyKey"
     OR replacement_row."upstreamGrossAtomic" <> NEW."correctedGrossAtomic"
     OR replacement_row."upstreamFeeAtomic" <> NEW."correctedUpstreamFeeAtomic"
     OR replacement_row."networkFeeAtomic" <> NEW."correctedNetworkFeeAtomic"
     OR replacement_row."receivedAtomic" <> NEW."correctedReceivedAtomic"
     OR replacement_row."internalExpectedAtomic" <> NEW."correctedInternalExpectedAtomic"
     OR replacement_row."varianceAtomic" <> 0
     OR replacement_row."toleranceAtomic" <> 0 THEN
    RAISE EXCEPTION 'Approved reconciliation resolution is not linked to matching immutable replacement evidence';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ReconciliationResolution_approved_evidence_constraint"
AFTER INSERT OR UPDATE OF "status" ON "ReconciliationResolution"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mining_validate_approved_reconciliation_resolution();
