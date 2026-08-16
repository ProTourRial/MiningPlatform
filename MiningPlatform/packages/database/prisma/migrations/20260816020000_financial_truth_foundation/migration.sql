-- MiningPlatform
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
--
-- Financial-truth foundation: immutable contribution facts, exact atomic-unit
-- settlement accounting, reconciliation state, and posted-journal immutability.

CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'EXCEPTION', 'RESOLVED');

ALTER TABLE "RewardPeriod"
  DROP CONSTRAINT IF EXISTS "RewardPeriod_assetId_periodStart_periodEnd_key",
  ADD COLUMN "strategyVersion" TEXT NOT NULL DEFAULT 'follow-upstream-atomic-v1',
  ADD COLUMN "settlementVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "grossAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "upstreamFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "networkFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "platformFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "distributableAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "userNetAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "totalContribution" DECIMAL(38,12) NOT NULL DEFAULT 0,
  ADD COLUMN "shareCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allocatedAt" TIMESTAMP(3),
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT;

ALTER TABLE "RewardPeriod" ALTER COLUMN "reconciliationStatus" DROP DEFAULT;
ALTER TABLE "RewardPeriod"
  ALTER COLUMN "reconciliationStatus" TYPE "ReconciliationStatus"
  USING (
    CASE UPPER("reconciliationStatus")
      WHEN 'MATCHED' THEN 'MATCHED'
      WHEN 'RECONCILED' THEN 'MATCHED'
      WHEN 'EXCEPTION' THEN 'EXCEPTION'
      WHEN 'FAILED' THEN 'EXCEPTION'
      WHEN 'RESOLVED' THEN 'RESOLVED'
      ELSE 'PENDING'
    END
  )::"ReconciliationStatus";
ALTER TABLE "RewardPeriod" ALTER COLUMN "reconciliationStatus" SET DEFAULT 'PENDING';

WITH converted AS (
  SELECT
    period."id",
    GREATEST(ROUND(period."grossReward" * POWER(10::NUMERIC, asset."decimals"))::BIGINT, 0) AS gross,
    GREATEST(ROUND(period."upstreamFee" * POWER(10::NUMERIC, asset."decimals"))::BIGINT, 0) AS upstream_fee,
    GREATEST(ROUND(period."networkFee" * POWER(10::NUMERIC, asset."decimals"))::BIGINT, 0) AS network_fee,
    GREATEST(ROUND(period."platformFee" * POWER(10::NUMERIC, asset."decimals"))::BIGINT, 0) AS platform_fee
  FROM "RewardPeriod" period
  JOIN "Asset" asset ON asset."id" = period."assetId"
), normalized AS (
  SELECT
    "id",
    gross,
    LEAST(upstream_fee, gross) AS upstream_fee,
    LEAST(network_fee, GREATEST(gross - upstream_fee, 0)) AS network_fee,
    GREATEST(gross - upstream_fee - network_fee, 0) AS distributable,
    LEAST(platform_fee, GREATEST(gross - upstream_fee - network_fee, 0)) AS platform_fee
  FROM converted
)
UPDATE "RewardPeriod" period
SET
  "grossAtomic" = normalized.gross,
  "upstreamFeeAtomic" = normalized.upstream_fee,
  "networkFeeAtomic" = normalized.network_fee,
  "platformFeeAtomic" = normalized.platform_fee,
  "distributableAtomic" = normalized.distributable,
  "userNetAtomic" = normalized.distributable - normalized.platform_fee
FROM normalized
WHERE normalized."id" = period."id";

CREATE UNIQUE INDEX "RewardPeriod_assetId_upstreamPoolId_periodStart_periodEnd_key"
  ON "RewardPeriod"("assetId", "upstreamPoolId", "periodStart", "periodEnd");

ALTER TABLE "RewardPeriod"
  ADD CONSTRAINT "RewardPeriod_period_window_check" CHECK ("periodStart" < "periodEnd"),
  ADD CONSTRAINT "RewardPeriod_atomic_amounts_check" CHECK (
    "grossAtomic" >= 0
    AND "upstreamFeeAtomic" >= 0
    AND "networkFeeAtomic" >= 0
    AND "platformFeeAtomic" >= 0
    AND "distributableAtomic" >= 0
    AND "userNetAtomic" >= 0
    AND "grossAtomic" = "upstreamFeeAtomic" + "networkFeeAtomic" + "distributableAtomic"
    AND "distributableAtomic" = "platformFeeAtomic" + "userNetAtomic"
  ),
  ADD CONSTRAINT "RewardPeriod_contribution_check" CHECK (
    "totalContribution" >= 0 AND "shareCount" >= 0
  );

ALTER TABLE "RewardAllocation"
  ADD COLUMN "upstreamFeeAmount" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "networkFeeAmount" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "contributionUnits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "grossAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "upstreamFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "networkFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "platformFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "netAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "strategyVersion" TEXT NOT NULL DEFAULT 'follow-upstream-atomic-v1',
  ADD COLUMN "roundingPolicy" TEXT NOT NULL DEFAULT 'largest-remainder-user-favouring-v1';

UPDATE "RewardAllocation" allocation
SET
  "contributionUnits" = GREATEST(ROUND(allocation."contribution" * 1000000000000)::BIGINT, 0),
  "grossAtomic" = ROUND(allocation."grossAmount" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "platformFeeAtomic" = ROUND(allocation."platformFeeAmount" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "netAtomic" = ROUND(allocation."netAmount" * POWER(10::NUMERIC, asset."decimals"))::BIGINT
FROM "RewardPeriod" period, "Asset" asset
WHERE allocation."rewardPeriodId" = period."id"
  AND period."assetId" = asset."id";

ALTER TABLE "RewardAllocation" DROP CONSTRAINT IF EXISTS "RewardAllocation_amounts_check";
ALTER TABLE "RewardAllocation"
  ADD CONSTRAINT "RewardAllocation_amounts_check" CHECK (
    "contribution" >= 0
    AND "grossAmount" >= 0
    AND "upstreamFeeAmount" >= 0
    AND "networkFeeAmount" >= 0
    AND "platformFeeAmount" >= 0
    AND "netAmount" >= 0
    AND "grossAmount" = "upstreamFeeAmount" + "networkFeeAmount" + "platformFeeAmount" + "netAmount"
    AND "contributionUnits" >= 0
    AND "grossAtomic" >= 0
    AND "upstreamFeeAtomic" >= 0
    AND "networkFeeAtomic" >= 0
    AND "platformFeeAtomic" >= 0
    AND "netAtomic" >= 0
    AND "grossAtomic" = "upstreamFeeAtomic" + "networkFeeAtomic" + "platformFeeAtomic" + "netAtomic"
  );

ALTER TABLE "JournalEntry"
  ADD COLUMN "correlationId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "causationId" TEXT,
  ADD COLUMN "entryVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3);

UPDATE "JournalEntry"
SET "correlationId" = CONCAT('legacy:', "referenceType", ':', "referenceId")
WHERE "correlationId" = '';
ALTER TABLE "JournalEntry" ALTER COLUMN "correlationId" DROP DEFAULT;
CREATE INDEX "JournalEntry_correlationId_effectiveAt_idx"
  ON "JournalEntry"("correlationId", "effectiveAt");

ALTER TABLE "JournalLine"
  ADD COLUMN "debitAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "creditAtomic" BIGINT NOT NULL DEFAULT 0;

UPDATE "JournalLine" line
SET
  "debitAtomic" = ROUND(line."debit" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "creditAtomic" = ROUND(line."credit" * POWER(10::NUMERIC, asset."decimals"))::BIGINT
FROM "Asset" asset
WHERE asset."id" = line."assetId";

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_atomic_amounts_check" CHECK (
    "debitAtomic" >= 0
    AND "creditAtomic" >= 0
    AND NOT ("debitAtomic" > 0 AND "creditAtomic" > 0)
    AND ("debitAtomic" > 0 OR "creditAtomic" > 0)
  );

CREATE OR REPLACE FUNCTION mining_assert_journal_line_asset()
RETURNS TRIGGER AS $$
DECLARE
  account_asset TEXT;
  account_asset_decimals INTEGER;
  atomic_scale NUMERIC;
BEGIN
  SELECT account."assetId", asset."decimals"
  INTO account_asset, account_asset_decimals
  FROM "LedgerAccount" account
  JOIN "Asset" asset ON asset."id" = account."assetId"
  WHERE account."id" = NEW."ledgerAccountId";

  IF account_asset IS NULL OR account_asset <> NEW."assetId" THEN
    RAISE EXCEPTION 'Journal line asset must match ledger account asset';
  END IF;

  atomic_scale := POWER(10::NUMERIC, account_asset_decimals);
  IF NEW."debit" * atomic_scale <> NEW."debitAtomic"::NUMERIC
     OR NEW."credit" * atomic_scale <> NEW."creditAtomic"::NUMERIC THEN
    RAISE EXCEPTION 'Journal line decimal and atomic amounts must represent the same value';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "UpstreamReconciliation"
  ADD COLUMN "sourceChecksum" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "importIdempotencyKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "upstreamGrossAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "upstreamFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "networkFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "receivedAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "internalExpectedAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "varianceAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "toleranceAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "exceptionCode" TEXT,
  ADD COLUMN "exceptionMessage" TEXT,
  ADD COLUMN "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

UPDATE "UpstreamReconciliation" reconciliation
SET
  "sourceReference" = COALESCE(reconciliation."sourceReference", CONCAT('legacy:', reconciliation."id")),
  "sourceChecksum" = CONCAT('legacy-unverified:', reconciliation."id"),
  "importIdempotencyKey" = CONCAT('legacy:', reconciliation."id"),
  "upstreamGrossAtomic" = ROUND(reconciliation."upstreamGrossReward" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "upstreamFeeAtomic" = ROUND(reconciliation."upstreamFee" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "receivedAtomic" = ROUND(reconciliation."receivedAmount" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "internalExpectedAtomic" = ROUND(reconciliation."internalExpectedAmount" * POWER(10::NUMERIC, asset."decimals"))::BIGINT,
  "varianceAtomic" = ROUND(reconciliation."varianceAmount" * POWER(10::NUMERIC, asset."decimals"))::BIGINT
FROM "Asset" asset
WHERE reconciliation."assetId" = asset."id";

ALTER TABLE "UpstreamReconciliation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "UpstreamReconciliation"
  ALTER COLUMN "status" TYPE "ReconciliationStatus"
  USING (
    CASE UPPER("status")
      WHEN 'MATCHED' THEN 'MATCHED'
      WHEN 'RECONCILED' THEN 'MATCHED'
      WHEN 'RESOLVED' THEN 'RESOLVED'
      WHEN 'PENDING' THEN 'PENDING'
      ELSE 'EXCEPTION'
    END
  )::"ReconciliationStatus";
ALTER TABLE "UpstreamReconciliation" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "UpstreamReconciliation"
  ALTER COLUMN "sourceReference" SET NOT NULL,
  ALTER COLUMN "sourceChecksum" DROP DEFAULT,
  ALTER COLUMN "importIdempotencyKey" DROP DEFAULT,
  ADD CONSTRAINT "UpstreamReconciliation_atomic_amounts_check" CHECK (
    "upstreamGrossAtomic" >= 0
    AND "upstreamFeeAtomic" >= 0
    AND "networkFeeAtomic" >= 0
    AND "receivedAtomic" >= 0
    AND "internalExpectedAtomic" >= 0
    AND "toleranceAtomic" >= 0
  );

CREATE UNIQUE INDEX "UpstreamReconciliation_sourceReference_key"
  ON "UpstreamReconciliation"("sourceReference");
CREATE UNIQUE INDEX "UpstreamReconciliation_importIdempotencyKey_key"
  ON "UpstreamReconciliation"("importIdempotencyKey");

CREATE TABLE "ContributionFact" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "shareId" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT NOT NULL,
  "rewardPeriodId" TEXT,
  "acceptedDifficulty" DECIMAL(38,12) NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContributionFact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContributionFact_positive_difficulty_check" CHECK ("acceptedDifficulty" > 0)
);

CREATE UNIQUE INDEX "ContributionFact_sourceEventId_key" ON "ContributionFact"("sourceEventId");
CREATE UNIQUE INDEX "ContributionFact_shareId_key" ON "ContributionFact"("shareId");
CREATE INDEX "ContributionFact_assetId_upstreamPoolId_acceptedAt_idx"
  ON "ContributionFact"("assetId", "upstreamPoolId", "acceptedAt");
CREATE INDEX "ContributionFact_rewardPeriodId_miningAccountId_idx"
  ON "ContributionFact"("rewardPeriodId", "miningAccountId");

ALTER TABLE "ContributionFact"
  ADD CONSTRAINT "ContributionFact_shareId_fkey"
    FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContributionFact_miningAccountId_fkey"
    FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContributionFact_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContributionFact_upstreamPoolId_fkey"
    FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContributionFact_rewardPeriodId_fkey"
    FOREIGN KEY ("rewardPeriodId") REFERENCES "RewardPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RewardPeriodContribution" (
  "id" TEXT NOT NULL,
  "rewardPeriodId" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "acceptedDifficulty" DECIMAL(38,12) NOT NULL,
  "shareCount" INTEGER NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardPeriodContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardPeriodContribution_values_check" CHECK (
    "acceptedDifficulty" > 0 AND "shareCount" > 0
  )
);

CREATE UNIQUE INDEX "RewardPeriodContribution_rewardPeriodId_miningAccountId_key"
  ON "RewardPeriodContribution"("rewardPeriodId", "miningAccountId");
CREATE INDEX "RewardPeriodContribution_miningAccountId_createdAt_idx"
  ON "RewardPeriodContribution"("miningAccountId", "createdAt");

ALTER TABLE "RewardPeriodContribution"
  ADD CONSTRAINT "RewardPeriodContribution_rewardPeriodId_fkey"
    FOREIGN KEY ("rewardPeriodId") REFERENCES "RewardPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RewardPeriodContribution_miningAccountId_fkey"
    FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION mining_guard_contribution_fact()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Contribution facts are immutable';
  END IF;
  IF OLD."rewardPeriodId" IS NULL
     AND NEW."rewardPeriodId" IS NOT NULL
     AND ROW(
       NEW."id", NEW."sourceEventId", NEW."shareId", NEW."miningAccountId",
       NEW."assetId", NEW."upstreamPoolId", NEW."acceptedDifficulty",
       NEW."acceptedAt", NEW."correlationId", NEW."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       OLD."id", OLD."sourceEventId", OLD."shareId", OLD."miningAccountId",
       OLD."assetId", OLD."upstreamPoolId", OLD."acceptedDifficulty",
       OLD."acceptedAt", OLD."correlationId", OLD."createdAt"
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Contribution facts are immutable except for one-time reward-period assignment';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContributionFact_immutable_trigger"
BEFORE UPDATE OR DELETE ON "ContributionFact"
FOR EACH ROW EXECUTE FUNCTION mining_guard_contribution_fact();

CREATE OR REPLACE FUNCTION mining_reject_immutable_accounting_row()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RewardPeriodContribution_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RewardPeriodContribution"
FOR EACH ROW EXECUTE FUNCTION mining_reject_immutable_accounting_row();

CREATE TRIGGER "RewardAllocation_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RewardAllocation"
FOR EACH ROW EXECUTE FUNCTION mining_reject_immutable_accounting_row();

CREATE OR REPLACE FUNCTION mining_guard_reward_period_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Reward periods cannot be deleted';
  END IF;
  IF OLD."status" = NEW."status" THEN
    IF OLD."status" IN ('CLOSED', 'RECONCILED') THEN
      RAISE EXCEPTION 'Final reward periods are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD."status" = 'OPEN' AND NEW."status" IN ('CALCULATING', 'FAILED'))
     OR (OLD."status" = 'CALCULATING' AND NEW."status" IN ('ALLOCATED', 'FAILED'))
     OR (OLD."status" = 'ALLOCATED' AND NEW."status" IN ('RECONCILED', 'FAILED'))
     OR (OLD."status" = 'RECONCILED' AND NEW."status" = 'CLOSED')
     OR (OLD."status" = 'FAILED' AND NEW."status" = 'CALCULATING') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid reward period transition: % -> %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RewardPeriod_state_transition_trigger"
BEFORE UPDATE OR DELETE ON "RewardPeriod"
FOR EACH ROW EXECUTE FUNCTION mining_guard_reward_period_transition();

CREATE OR REPLACE FUNCTION mining_guard_journal_line_immutability()
RETURNS TRIGGER AS $$
DECLARE entry_status "JournalEntryStatus";
DECLARE target_entry_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_entry_id := OLD."journalEntryId";
  ELSE
    target_entry_id := NEW."journalEntryId";
  END IF;
  SELECT "status" INTO entry_status FROM "JournalEntry" WHERE "id" = target_entry_id;
  IF entry_status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Lines of posted or reversed journals are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalLine_immutable_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION mining_guard_journal_line_immutability();

CREATE OR REPLACE FUNCTION mining_guard_journal_entry_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted or reversed journal entries cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    IF OLD."status" = 'POSTED'
       AND NEW."status" = 'REVERSED'
       AND OLD."reversedEntryId" IS NULL
       AND NEW."reversedEntryId" IS NOT NULL
       AND NEW."reversalReason" IS NOT NULL
       AND NEW."reversedAt" IS NOT NULL
       AND ROW(
         NEW."id", NEW."idempotencyKey", NEW."referenceType", NEW."referenceId",
         NEW."description", NEW."correlationId", NEW."causationId", NEW."entryVersion",
         NEW."effectiveAt", NEW."postedAt", NEW."createdAt"
       ) IS NOT DISTINCT FROM ROW(
         OLD."id", OLD."idempotencyKey", OLD."referenceType", OLD."referenceId",
         OLD."description", OLD."correlationId", OLD."causationId", OLD."entryVersion",
         OLD."effectiveAt", OLD."postedAt", OLD."createdAt"
       ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted or reversed journal entries are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntry_immutable_trigger"
BEFORE UPDATE OR DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION mining_guard_journal_entry_immutability();

CREATE OR REPLACE FUNCTION mining_assert_posted_journal_balanced(entry_id TEXT)
RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "JournalEntry" entry
    WHERE entry."id" = entry_id
      AND entry."status" IN ('POSTED', 'REVERSED')
      AND (
        NOT EXISTS (SELECT 1 FROM "JournalLine" line WHERE line."journalEntryId" = entry."id")
        OR EXISTS (
          SELECT 1
          FROM "JournalLine" line
          WHERE line."journalEntryId" = entry."id"
          GROUP BY line."assetId"
          HAVING SUM(line."debit") <> SUM(line."credit")
            OR SUM(line."debitAtomic") <> SUM(line."creditAtomic")
        )
      )
  ) THEN
    RAISE EXCEPTION 'Posted or reversed journal entry % is not balanced', entry_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mining_check_journal_entry_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IN ('POSTED', 'REVERSED') THEN
    PERFORM mining_assert_posted_journal_balanced(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Reinstall both deferred constraints explicitly. Earlier schema versions already
-- create these triggers, but keeping the financial-truth migration self-contained
-- makes the atomic balance enforcement auditable on both fresh and upgrade paths.
DROP TRIGGER IF EXISTS "JournalLine_balance_constraint" ON "JournalLine";
CREATE CONSTRAINT TRIGGER "JournalLine_balance_constraint"
AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mining_check_journal_line_balance();

DROP TRIGGER IF EXISTS "JournalEntry_balance_constraint" ON "JournalEntry";
CREATE CONSTRAINT TRIGGER "JournalEntry_balance_constraint"
AFTER INSERT OR UPDATE OF "status" ON "JournalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mining_check_journal_entry_balance();
