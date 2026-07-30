-- MiningPlatform
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

-- Core hardening for v0.2.0-alpha.2.
ALTER TYPE "StratumJobStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';
ALTER TYPE "StratumJobStatus" ADD VALUE IF NOT EXISTS 'INVALIDATED';
ALTER TYPE "OutboxEventStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "OutboxEventStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';
ALTER TYPE "IdempotencyRecordStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MiningAccount" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Worker" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "producer" TEXT;
UPDATE "OutboxEvent" SET "producer" = 'unknown' WHERE "producer" IS NULL;
ALTER TABLE "OutboxEvent" ALTER COLUMN "producer" SET NOT NULL;
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3);
UPDATE "OutboxEvent" SET "occurredAt" = "createdAt" WHERE "occurredAt" IS NULL;
ALTER TABLE "OutboxEvent" ALTER COLUMN "occurredAt" SET NOT NULL;

ALTER TABLE "MiningAccount" DROP CONSTRAINT IF EXISTS "MiningAccount_userId_fkey";
ALTER TABLE "MiningAccount" ADD CONSTRAINT "MiningAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Worker" DROP CONSTRAINT IF EXISTS "Worker_userId_fkey";
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Worker" DROP CONSTRAINT IF EXISTS "Worker_miningAccountId_fkey";
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_miningAccountId_fkey"
  FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerTelemetry" DROP CONSTRAINT IF EXISTS "WorkerTelemetry_workerId_fkey";
ALTER TABLE "WorkerTelemetry" ADD CONSTRAINT "WorkerTelemetry_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DifficultyAssignment" DROP CONSTRAINT IF EXISTS "DifficultyAssignment_sessionId_fkey";
ALTER TABLE "DifficultyAssignment" ADD CONSTRAINT "DifficultyAssignment_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "MinerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DifficultyAssignment" DROP CONSTRAINT IF EXISTS "DifficultyAssignment_workerId_fkey";
ALTER TABLE "DifficultyAssignment" ADD CONSTRAINT "DifficultyAssignment_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpstreamSession" DROP CONSTRAINT IF EXISTS "UpstreamSession_upstreamPoolId_fkey";
ALTER TABLE "UpstreamSession" ADD CONSTRAINT "UpstreamSession_upstreamPoolId_fkey"
  FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShareFingerprint" DROP CONSTRAINT IF EXISTS "ShareFingerprint_workerId_fkey";
ALTER TABLE "ShareFingerprint" ADD CONSTRAINT "ShareFingerprint_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShareFingerprint" DROP CONSTRAINT IF EXISTS "ShareFingerprint_stratumJobId_fkey";
ALTER TABLE "ShareFingerprint" ADD CONSTRAINT "ShareFingerprint_stratumJobId_fkey"
  FOREIGN KEY ("stratumJobId") REFERENCES "StratumJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Share" DROP CONSTRAINT IF EXISTS "Share_workerId_fkey";
ALTER TABLE "Share" ADD CONSTRAINT "Share_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Share" DROP CONSTRAINT IF EXISTS "Share_sessionId_fkey";
ALTER TABLE "Share" ADD CONSTRAINT "Share_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "MinerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HashrateSnapshot" DROP CONSTRAINT IF EXISTS "HashrateSnapshot_workerId_fkey";
ALTER TABLE "HashrateSnapshot" ADD CONSTRAINT "HashrateSnapshot_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutAddress" DROP CONSTRAINT IF EXISTS "PayoutAddress_userId_fkey";
ALTER TABLE "PayoutAddress" ADD CONSTRAINT "PayoutAddress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "HashrateBucket" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "bucketSeconds" INTEGER NOT NULL DEFAULT 60,
  "acceptedDifficultySum" DECIMAL(38,12) NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "invalidCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HashrateBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HashrateBucket_workerId_bucketStart_bucketSeconds_key"
  ON "HashrateBucket"("workerId", "bucketStart", "bucketSeconds");
CREATE INDEX IF NOT EXISTS "HashrateBucket_workerId_bucketStart_idx"
  ON "HashrateBucket"("workerId", "bucketStart");
ALTER TABLE "HashrateBucket" ADD CONSTRAINT "HashrateBucket_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HashrateSnapshot" ADD COLUMN IF NOT EXISTS "bucketStart" TIMESTAMP(3);
UPDATE "HashrateSnapshot"
SET "bucketStart" = date_trunc('minute', "recordedAt")
WHERE "bucketStart" IS NULL;
ALTER TABLE "HashrateSnapshot" ALTER COLUMN "bucketStart" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "HashrateSnapshot_workerId_windowSeconds_bucketStart_key"
  ON "HashrateSnapshot"("workerId", "windowSeconds", "bucketStart");
CREATE INDEX IF NOT EXISTS "HashrateSnapshot_workerId_windowSeconds_recordedAt_idx"
  ON "HashrateSnapshot"("workerId", "windowSeconds", "recordedAt");

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_non_negative_check" CHECK ("debit" >= 0 AND "credit" >= 0),
  ADD CONSTRAINT "JournalLine_one_sided_check" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  );

CREATE OR REPLACE FUNCTION mining_assert_journal_line_asset()
RETURNS TRIGGER AS $$
DECLARE account_asset TEXT;
BEGIN
  SELECT "assetId" INTO account_asset FROM "LedgerAccount" WHERE "id" = NEW."ledgerAccountId";
  IF account_asset IS NULL OR account_asset <> NEW."assetId" THEN
    RAISE EXCEPTION 'Journal line asset must match ledger account asset';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "JournalLine_asset_match_trigger" ON "JournalLine";
CREATE TRIGGER "JournalLine_asset_match_trigger"
BEFORE INSERT OR UPDATE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION mining_assert_journal_line_asset();

CREATE OR REPLACE FUNCTION mining_assert_posted_journal_balanced(entry_id TEXT)
RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "JournalEntry" entry
    WHERE entry."id" = entry_id
      AND entry."status" = 'POSTED'
      AND (
        NOT EXISTS (SELECT 1 FROM "JournalLine" line WHERE line."journalEntryId" = entry."id")
        OR EXISTS (
          SELECT 1
          FROM "JournalLine" line
          WHERE line."journalEntryId" = entry."id"
          GROUP BY line."assetId"
          HAVING SUM(line."debit") <> SUM(line."credit")
        )
      )
  ) THEN
    RAISE EXCEPTION 'Posted journal entry % is not balanced', entry_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mining_check_journal_line_balance()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM mining_assert_posted_journal_balanced(COALESCE(NEW."journalEntryId", OLD."journalEntryId"));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "JournalLine_balance_constraint" ON "JournalLine";
CREATE CONSTRAINT TRIGGER "JournalLine_balance_constraint"
AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mining_check_journal_line_balance();

CREATE OR REPLACE FUNCTION mining_check_journal_entry_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'POSTED' THEN
    PERFORM mining_assert_posted_journal_balanced(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "JournalEntry_balance_constraint" ON "JournalEntry";
CREATE CONSTRAINT TRIGGER "JournalEntry_balance_constraint"
AFTER INSERT OR UPDATE OF "status" ON "JournalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mining_check_journal_entry_balance();
