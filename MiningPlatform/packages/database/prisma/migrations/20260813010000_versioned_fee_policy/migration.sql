-- MiningPlatform versioned mining-fee policy and 0.5% default baseline.
-- Existing reward allocations keep their monetary amounts and receive an
-- immutable legacy snapshot; they are never recalculated by this migration.

CREATE TYPE "FeePolicyScope" AS ENUM (
  'PLATFORM_DEFAULT',
  'ASSET',
  'ALGORITHM',
  'NETWORK',
  'CAMPAIGN',
  'REFERRAL',
  'ACCOUNT_TIER',
  'MINING_ACCOUNT'
);

CREATE TYPE "FeePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

CREATE TABLE "MiningFeePolicy" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "FeePolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "scope" "FeePolicyScope" NOT NULL,
  "assetId" TEXT,
  "algorithm" TEXT,
  "network" TEXT,
  "campaignCode" TEXT,
  "referralCode" TEXT,
  "accountTier" TEXT,
  "miningAccountId" TEXT,
  "feeBasisPoints" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMPTZ NOT NULL,
  "effectiveUntil" TIMESTAMPTZ,
  "changeReason" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MiningFeePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MiningFeePolicy_policyKey_version_key" UNIQUE ("policyKey", "version"),
  CONSTRAINT "MiningFeePolicy_version_check" CHECK ("version" >= 0),
  CONSTRAINT "MiningFeePolicy_fee_basis_points_check" CHECK ("feeBasisPoints" >= 0 AND "feeBasisPoints" <= 10000),
  CONSTRAINT "MiningFeePolicy_effective_window_check" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom"),
  CONSTRAINT "MiningFeePolicy_scope_fields_check" CHECK (
    ("scope" = 'PLATFORM_DEFAULT' AND "assetId" IS NULL AND "algorithm" IS NULL AND "network" IS NULL AND "campaignCode" IS NULL AND "referralCode" IS NULL AND "accountTier" IS NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'ASSET' AND "assetId" IS NOT NULL AND "algorithm" IS NULL AND "network" IS NULL AND "campaignCode" IS NULL AND "referralCode" IS NULL AND "accountTier" IS NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'ALGORITHM' AND "assetId" IS NULL AND "algorithm" IS NOT NULL AND "network" IS NULL AND "campaignCode" IS NULL AND "referralCode" IS NULL AND "accountTier" IS NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'NETWORK' AND "assetId" IS NULL AND "algorithm" IS NULL AND "network" IS NOT NULL AND "campaignCode" IS NULL AND "referralCode" IS NULL AND "accountTier" IS NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'CAMPAIGN' AND "assetId" IS NULL AND "algorithm" IS NULL AND "network" IS NULL AND "campaignCode" IS NOT NULL AND "referralCode" IS NULL AND "accountTier" IS NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'REFERRAL' AND "assetId" IS NULL AND "algorithm" IS NULL AND "network" IS NULL AND "campaignCode" IS NULL AND "referralCode" IS NOT NULL AND "accountTier" IS NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'ACCOUNT_TIER' AND "assetId" IS NULL AND "algorithm" IS NULL AND "network" IS NULL AND "campaignCode" IS NULL AND "referralCode" IS NULL AND "accountTier" IS NOT NULL AND "miningAccountId" IS NULL)
    OR ("scope" = 'MINING_ACCOUNT' AND "assetId" IS NULL AND "algorithm" IS NULL AND "network" IS NULL AND "campaignCode" IS NULL AND "referralCode" IS NULL AND "accountTier" IS NULL AND "miningAccountId" IS NOT NULL)
  )
);

CREATE INDEX "MiningFeePolicy_status_scope_effectiveFrom_effectiveUntil_idx"
  ON "MiningFeePolicy" ("status", "scope", "effectiveFrom", "effectiveUntil");
CREATE INDEX "MiningFeePolicy_assetId_status_effectiveFrom_idx"
  ON "MiningFeePolicy" ("assetId", "status", "effectiveFrom");
CREATE INDEX "MiningFeePolicy_miningAccountId_status_effectiveFrom_idx"
  ON "MiningFeePolicy" ("miningAccountId", "status", "effectiveFrom");

INSERT INTO "MiningFeePolicy" (
  "id", "policyKey", "version", "status", "scope", "feeBasisPoints",
  "effectiveFrom", "effectiveUntil", "changeReason"
) VALUES
  (
    'fee-policy-platform-default-v0', 'platform-default', 0, 'RETIRED',
    'PLATFORM_DEFAULT', 200, '1970-01-01T00:00:00Z', '2026-08-12T17:00:00Z',
    'Legacy 2% alpha baseline retained only for historical traceability.'
  ),
  (
    'fee-policy-platform-default-v1', 'platform-default', 1, 'ACTIVE',
    'PLATFORM_DEFAULT', 50, '2026-08-12T17:00:00Z', NULL,
    'Owner-approved initial platform fee baseline: 0.5%.'
  );

-- Preserve any explicitly customized account fee instead of overwriting it.
INSERT INTO "MiningFeePolicy" (
  "id", "policyKey", "version", "status", "scope", "miningAccountId",
  "feeBasisPoints", "effectiveFrom", "changeReason"
)
SELECT
  'fee-policy-legacy-account-' || account."id",
  'legacy-account:' || account."id",
  1,
  'ACTIVE',
  'MINING_ACCOUNT',
  account."id",
  LEAST(10000, GREATEST(0, ROUND(account."platformFeePercent" * 100)::INTEGER)),
  '1970-01-01T00:00:00Z',
  'Imported customized account fee from the pre-policy alpha schema.'
FROM "MiningAccount" account
WHERE account."platformFeePercent" <> 2.0000;

ALTER TABLE "MiningAccount" ADD COLUMN "feePolicyId" TEXT;

UPDATE "MiningAccount"
SET
  "platformFeePercent" = 0.5000,
  "feePolicyId" = 'fee-policy-platform-default-v1'
WHERE "platformFeePercent" = 2.0000;

UPDATE "MiningAccount"
SET "feePolicyId" = 'fee-policy-legacy-account-' || "id"
WHERE "feePolicyId" IS NULL;

ALTER TABLE "MiningAccount" ALTER COLUMN "feePolicyId" SET NOT NULL;
ALTER TABLE "MiningAccount"
  ADD CONSTRAINT "MiningAccount_platform_fee_percent_check"
  CHECK ("platformFeePercent" >= 0 AND "platformFeePercent" <= 100);
ALTER TABLE "MiningAccount"
  ADD CONSTRAINT "MiningAccount_feePolicyId_fkey"
  FOREIGN KEY ("feePolicyId") REFERENCES "MiningFeePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MiningAccount_feePolicyId_idx" ON "MiningAccount" ("feePolicyId");

ALTER TABLE "RewardAllocation"
  ADD COLUMN "feePolicyId" TEXT,
  ADD COLUMN "feePolicyVersion" INTEGER,
  ADD COLUMN "feeBasisPoints" INTEGER,
  ADD COLUMN "feePolicySnapshot" JSONB;

-- Create one legacy policy per observed historical rate. Existing monetary
-- values remain untouched, and the imported snapshot records their rate.
WITH legacy_rates AS (
  SELECT DISTINCT
    CASE
      WHEN "grossAmount" > 0 THEN LEAST(10000, GREATEST(0, ROUND(("platformFeeAmount" / "grossAmount") * 10000)::INTEGER))
      ELSE 0
    END AS bps
  FROM "RewardAllocation"
)
INSERT INTO "MiningFeePolicy" (
  "id", "policyKey", "version", "status", "scope", "feeBasisPoints",
  "effectiveFrom", "effectiveUntil", "changeReason"
)
SELECT
  'fee-policy-legacy-allocation-bps-' || bps,
  'legacy-allocation-bps:' || bps,
  0,
  'RETIRED',
  'PLATFORM_DEFAULT',
  bps,
  '1970-01-01T00:00:00Z',
  '2026-08-12T17:00:00Z',
  'Imported historical allocation rate; monetary amounts were not recalculated.'
FROM legacy_rates
ON CONFLICT ("policyKey", "version") DO NOTHING;

UPDATE "RewardAllocation"
SET
  "feeBasisPoints" = CASE
    WHEN "grossAmount" > 0 THEN LEAST(10000, GREATEST(0, ROUND(("platformFeeAmount" / "grossAmount") * 10000)::INTEGER))
    ELSE 0
  END;

UPDATE "RewardAllocation"
SET
  "feePolicyId" = 'fee-policy-legacy-allocation-bps-' || "feeBasisPoints",
  "feePolicyVersion" = 0,
  "feePolicySnapshot" = jsonb_build_object(
    'policyKey', 'legacy-allocation-bps:' || "feeBasisPoints",
    'version', 0,
    'feeBasisPoints', "feeBasisPoints",
    'legacyImported', true,
    'grossAmount', "grossAmount"::TEXT,
    'platformFeeAmount', "platformFeeAmount"::TEXT,
    'netAmount', "netAmount"::TEXT
  );

ALTER TABLE "RewardAllocation"
  ALTER COLUMN "feePolicyId" SET NOT NULL,
  ALTER COLUMN "feePolicyVersion" SET NOT NULL,
  ALTER COLUMN "feeBasisPoints" SET NOT NULL,
  ALTER COLUMN "feePolicySnapshot" SET NOT NULL;

ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_fee_basis_points_check"
  CHECK ("feeBasisPoints" >= 0 AND "feeBasisPoints" <= 10000),
  ADD CONSTRAINT "RewardAllocation_amounts_check"
  CHECK (
    "grossAmount" >= 0
    AND "platformFeeAmount" >= 0
    AND "netAmount" >= 0
    AND "grossAmount" = "platformFeeAmount" + "netAmount"
  ),
  ADD CONSTRAINT "RewardAllocation_feePolicyId_fkey"
  FOREIGN KEY ("feePolicyId") REFERENCES "MiningFeePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RewardAllocation_feePolicyId_feePolicyVersion_idx"
  ON "RewardAllocation" ("feePolicyId", "feePolicyVersion");

ALTER TABLE "MiningFeePolicy"
  ADD CONSTRAINT "MiningFeePolicy_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MiningFeePolicy_miningAccountId_fkey"
  FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MiningFeePolicy_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
