-- MiningPlatform alpha.6 referral fee foundation.
-- Monetary rates are authoritative in parts-per-million (PPM):
-- 5,000 PPM = 0.50%, 3,750 PPM = 0.375%, 1,250 PPM = 0.125%.

CREATE TYPE "ReferralBeneficiaryType" AS ENUM ('USER', 'SITE_DONATION');

-- User preference only. Payout execution remains gated by the global kill switch,
-- verified destination, balance threshold, wallet health, and operational controls.
ALTER TABLE "MiningAccount"
  ADD COLUMN "autoWithdrawalEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MiningFeePolicy"
  ALTER COLUMN "feeBasisPoints" TYPE DECIMAL(9,4) USING "feeBasisPoints"::DECIMAL(9,4),
  ADD COLUMN "feePartsPerMillion" INTEGER;

UPDATE "MiningFeePolicy"
SET "feePartsPerMillion" = ROUND("feeBasisPoints" * 100)::INTEGER;

ALTER TABLE "MiningFeePolicy"
  ALTER COLUMN "feePartsPerMillion" SET NOT NULL,
  ADD CONSTRAINT "MiningFeePolicy_fee_ppm_check"
    CHECK (
      "feePartsPerMillion" >= 0
      AND "feePartsPerMillion" <= 1000000
      AND "feeBasisPoints" = "feePartsPerMillion"::DECIMAL / 100
    );

CREATE TABLE "ReferralProgram" (
  "id" TEXT NOT NULL,
  "programKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "FeePolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "minerFeePartsPerMillion" INTEGER NOT NULL,
  "commissionPartsPerMillion" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "changeReason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralProgram_rate_check" CHECK (
    "minerFeePartsPerMillion" >= 0
    AND "minerFeePartsPerMillion" <= 1000000
    AND "commissionPartsPerMillion" >= 0
    AND "commissionPartsPerMillion" <= "minerFeePartsPerMillion"
    AND ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom")
    AND CHAR_LENGTH(BTRIM("changeReason")) >= 10
  )
);

CREATE UNIQUE INDEX "ReferralProgram_programKey_version_key"
  ON "ReferralProgram"("programKey", "version");
CREATE INDEX "ReferralProgram_status_effectiveFrom_effectiveUntil_idx"
  ON "ReferralProgram"("status", "effectiveFrom", "effectiveUntil");

CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "beneficiaryType" "ReferralBeneficiaryType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralCode_identity_check" CHECK (
    "code" = UPPER("code")
    AND "code" ~ '^[A-Z0-9]{3,24}$'
    AND (
      ("beneficiaryType" = 'USER' AND "ownerUserId" IS NOT NULL)
      OR ("beneficiaryType" = 'SITE_DONATION' AND "ownerUserId" IS NULL)
    )
  )
);

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE INDEX "ReferralCode_ownerUserId_active_idx" ON "ReferralCode"("ownerUserId", "active");
CREATE INDEX "ReferralCode_programId_active_idx" ON "ReferralCode"("programId", "active");

CREATE TABLE "ReferralAttribution" (
  "id" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "referralCodeId" TEXT NOT NULL,
  "sourceWorkerId" TEXT,
  "sourceWorkerNameHash" TEXT NOT NULL,
  "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralAttribution_source_hash_check"
    CHECK ("sourceWorkerNameHash" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "ReferralAttribution_miningAccountId_key"
  ON "ReferralAttribution"("miningAccountId");
CREATE INDEX "ReferralAttribution_referralCodeId_attributedAt_idx"
  ON "ReferralAttribution"("referralCodeId", "attributedAt");
CREATE INDEX "ReferralAttribution_sourceWorkerId_idx"
  ON "ReferralAttribution"("sourceWorkerId");

ALTER TABLE "ReferralCode"
  ADD CONSTRAINT "ReferralCode_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralCode_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_miningAccountId_fkey"
    FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey"
    FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralAttribution_sourceWorkerId_fkey"
    FOREIGN KEY ("sourceWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ReferralProgram" (
  "id", "programKey", "version", "status", "minerFeePartsPerMillion",
  "commissionPartsPerMillion", "effectiveFrom", "changeReason"
) VALUES (
  'referral-program-standard-v1', 'standard-referral', 1, 'ACTIVE', 3750,
  1250, TIMESTAMP '2026-08-21 00:00:00',
  'Owner-approved referral economics: miner fee 0.375% and referral commission 0.125%.'
);

INSERT INTO "ReferralCode" (
  "id", "code", "programId", "ownerUserId", "beneficiaryType", "active", "updatedAt"
) VALUES (
  'referral-code-default-mp05', 'MP05', 'referral-program-standard-v1', NULL,
  'SITE_DONATION', true, CURRENT_TIMESTAMP
);

-- Every existing user receives a stable personal referral code. The digest prevents
-- exposing the user identifier and keeps collisions vanishingly unlikely.
INSERT INTO "ReferralCode" (
  "id", "code", "programId", "ownerUserId", "beneficiaryType", "active", "updatedAt"
)
SELECT
  'referral-code-user-' || MD5("id"),
  'MP' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 16)),
  'referral-program-standard-v1',
  "id",
  'USER',
  true,
  CURRENT_TIMESTAMP
FROM "User";

ALTER TABLE "RewardPeriod"
  ADD COLUMN "referralCommissionAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "platformRetainedAtomic" BIGINT NOT NULL DEFAULT 0;

UPDATE "RewardPeriod"
SET "platformRetainedAtomic" = "platformFeeAtomic";

ALTER TABLE "RewardPeriod"
  ADD CONSTRAINT "RewardPeriod_referral_fee_split_check" CHECK (
    "referralCommissionAtomic" >= 0
    AND "platformRetainedAtomic" >= 0
    AND "platformFeeAtomic" = "referralCommissionAtomic" + "platformRetainedAtomic"
  );

ALTER TABLE "RewardAllocation"
  ALTER COLUMN "feeBasisPoints" TYPE DECIMAL(9,4) USING "feeBasisPoints"::DECIMAL(9,4),
  ADD COLUMN "feePartsPerMillion" INTEGER,
  ADD COLUMN "referralAttributionId" TEXT,
  ADD COLUMN "referralProgramId" TEXT,
  ADD COLUMN "referralProgramVersion" INTEGER,
  ADD COLUMN "referralCommissionPartsPerMillion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "referralCodeSnapshot" JSONB,
  ADD COLUMN "referralProgramSnapshot" JSONB,
  ADD COLUMN "referralCommissionAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "platformRetainedAtomic" BIGINT NOT NULL DEFAULT 0;

UPDATE "RewardAllocation"
SET
  "feePartsPerMillion" = ROUND("feeBasisPoints" * 100)::INTEGER,
  "platformRetainedAtomic" = "platformFeeAtomic";

ALTER TABLE "RewardAllocation"
  ALTER COLUMN "feePartsPerMillion" SET NOT NULL,
  ADD CONSTRAINT "RewardAllocation_fee_ppm_check" CHECK (
    "feePartsPerMillion" >= 0
    AND "feePartsPerMillion" <= 1000000
    AND "feeBasisPoints" = "feePartsPerMillion"::DECIMAL / 100
  ),
  ADD CONSTRAINT "RewardAllocation_referral_fee_split_check" CHECK (
    "referralCommissionPartsPerMillion" >= 0
    AND "referralCommissionPartsPerMillion" <= "feePartsPerMillion"
    AND "referralCommissionAtomic" >= 0
    AND "platformRetainedAtomic" >= 0
    AND "platformFeeAtomic" = "referralCommissionAtomic" + "platformRetainedAtomic"
  ),
  ADD CONSTRAINT "RewardAllocation_referral_snapshot_check" CHECK (
    ("referralAttributionId" IS NULL
      AND "referralProgramId" IS NULL
      AND "referralProgramVersion" IS NULL
      AND "referralCommissionPartsPerMillion" = 0
      AND "referralCodeSnapshot" IS NULL
      AND "referralProgramSnapshot" IS NULL)
    OR
    ("referralAttributionId" IS NOT NULL
      AND "referralProgramId" IS NOT NULL
      AND "referralProgramVersion" IS NOT NULL
      AND "referralCommissionPartsPerMillion" > 0
      AND "referralCodeSnapshot" IS NOT NULL
      AND "referralProgramSnapshot" IS NOT NULL)
  ),
  ADD CONSTRAINT "RewardAllocation_referralAttributionId_fkey"
    FOREIGN KEY ("referralAttributionId") REFERENCES "ReferralAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RewardAllocation_referralProgramId_fkey"
    FOREIGN KEY ("referralProgramId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RewardAllocation_referralAttributionId_idx"
  ON "RewardAllocation"("referralAttributionId");
CREATE INDEX "RewardAllocation_referralProgramId_referralProgramVersion_idx"
  ON "RewardAllocation"("referralProgramId", "referralProgramVersion");

-- Attribution is a financial fact. Corrections must be represented by a future,
-- separately approved workflow rather than mutating historical ownership.
CREATE OR REPLACE FUNCTION miningplatform_reject_referral_attribution_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'referral attribution is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReferralAttribution_immutable_update"
BEFORE UPDATE ON "ReferralAttribution"
FOR EACH ROW EXECUTE FUNCTION miningplatform_reject_referral_attribution_mutation();

CREATE TRIGGER "ReferralAttribution_immutable_delete"
BEFORE DELETE ON "ReferralAttribution"
FOR EACH ROW EXECUTE FUNCTION miningplatform_reject_referral_attribution_mutation();

CREATE OR REPLACE FUNCTION miningplatform_guard_referral_program_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."programKey" IS DISTINCT FROM NEW."programKey"
    OR OLD."version" IS DISTINCT FROM NEW."version"
    OR OLD."minerFeePartsPerMillion" IS DISTINCT FROM NEW."minerFeePartsPerMillion"
    OR OLD."commissionPartsPerMillion" IS DISTINCT FROM NEW."commissionPartsPerMillion"
    OR OLD."effectiveFrom" IS DISTINCT FROM NEW."effectiveFrom"
    OR OLD."effectiveUntil" IS DISTINCT FROM NEW."effectiveUntil"
    OR OLD."changeReason" IS DISTINCT FROM NEW."changeReason"
    OR NOT (OLD."status" = NEW."status" OR (OLD."status" = 'ACTIVE' AND NEW."status" = 'RETIRED'))
  THEN
    RAISE EXCEPTION 'referral program economics are immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReferralProgram_version_immutable"
BEFORE UPDATE ON "ReferralProgram"
FOR EACH ROW EXECUTE FUNCTION miningplatform_guard_referral_program_update();

CREATE OR REPLACE FUNCTION miningplatform_guard_referral_code_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."code" IS DISTINCT FROM NEW."code"
    OR OLD."programId" IS DISTINCT FROM NEW."programId"
    OR OLD."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR OLD."beneficiaryType" IS DISTINCT FROM NEW."beneficiaryType"
    OR NOT (OLD."active" = NEW."active" OR (OLD."active" AND NOT NEW."active"))
  THEN
    RAISE EXCEPTION 'referral code ownership and economics are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReferralCode_identity_immutable"
BEFORE UPDATE ON "ReferralCode"
FOR EACH ROW EXECUTE FUNCTION miningplatform_guard_referral_code_update();
