-- MiningPlatform
-- Author: Abia Nugrahanto
-- Controlled payout execution: eligibility, journal-backed reservation,
-- separation-of-duties approval, isolated signing evidence, broadcast,
-- confirmation, and reconciliation.

CREATE TYPE "PayoutTrigger" AS ENUM ('MANUAL', 'AUTO_WITHDRAWAL');
CREATE TYPE "BalanceReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');
CREATE TYPE "PayoutApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "SigningRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'SIGNED', 'REJECTED', 'FAILED');
CREATE TYPE "BroadcastAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "ChainObservationStatus" AS ENUM ('MEMPOOL', 'CONFIRMED', 'REORGED', 'DROPPED');
CREATE TYPE "PayoutReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'EXCEPTION');

ALTER TABLE "MiningAccount" ADD COLUMN "selectedPayoutAddressId" TEXT;
ALTER TABLE "PayoutRoute" ADD COLUMN "payoutWalletId" TEXT;

-- Existing rows remain execution v1 history. Only new v2 rows can enter the
-- controlled executor, so no historical payout is rewritten or cancelled.
ALTER TABLE "Payout"
  ADD COLUMN "miningAccountId" TEXT,
  ADD COLUMN "amountAtomic" BIGINT,
  ADD COLUMN "networkFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "requestSource" "PayoutTrigger" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "executionVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "signingAt" TIMESTAMP(3),
  ADD COLUMN "confirmingAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "rowVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Payout" ALTER COLUMN "executionVersion" SET DEFAULT 2;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_execution_values_check" CHECK (
  "executionVersion" IN (1, 2) AND "rowVersion" > 0
  AND ("executionVersion" = 1 OR ("miningAccountId" IS NOT NULL AND "amountAtomic" > 0 AND "networkFeeAtomic" >= 0))
);

ALTER TABLE "Wallet"
  ADD COLUMN "signerKeyReference" TEXT,
  ADD COLUMN "maximumSinglePayoutAtomic" BIGINT,
  ADD COLUMN "dailyPayoutLimitAtomic" BIGINT,
  ADD COLUMN "minimumReserveAtomic" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "lastReconciledAt" TIMESTAMP(3),
  ADD CONSTRAINT "Wallet_payout_limits_check" CHECK (
    ("maximumSinglePayoutAtomic" IS NULL OR "maximumSinglePayoutAtomic" > 0)
    AND ("dailyPayoutLimitAtomic" IS NULL OR "dailyPayoutLimitAtomic" > 0)
    AND "minimumReserveAtomic" >= 0
  );

CREATE TABLE "PayoutEligibility" (
  "id" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "availableBalanceAtomic" BIGINT NOT NULL, "reservationAmountAtomic" BIGINT NOT NULL,
  "minimumPayoutAtomic" BIGINT NOT NULL, "maximumPayoutAtomic" BIGINT,
  "routeVersion" INTEGER NOT NULL, "addressFingerprint" TEXT NOT NULL,
  "walletHealthRequired" BOOLEAN NOT NULL DEFAULT true,
  "manualApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "blockers" TEXT[] NOT NULL, "eligible" BOOLEAN NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutEligibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutEligibility_values_check" CHECK (
    "availableBalanceAtomic" >= 0 AND "reservationAmountAtomic" > 0 AND "minimumPayoutAtomic" > 0
    AND ("maximumPayoutAtomic" IS NULL OR "maximumPayoutAtomic" >= "minimumPayoutAtomic")
    AND "routeVersion" > 0 AND length("addressFingerprint") >= 16
    AND (("eligible" AND cardinality("blockers") = 0) OR (NOT "eligible" AND cardinality("blockers") > 0))
  )
);

CREATE TABLE "BalanceReservation" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
  "availableLedgerAccountId" TEXT NOT NULL, "reservedLedgerAccountId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL, "reversalJournalEntryId" TEXT,
  "amountAtomic" BIGINT NOT NULL,
  "status" "BalanceReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  CONSTRAINT "BalanceReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BalanceReservation_amount_check" CHECK ("amountAtomic" > 0),
  CONSTRAINT "BalanceReservation_status_check" CHECK (
    ("status" = 'ACTIVE' AND "consumedAt" IS NULL AND "releasedAt" IS NULL AND "reversalJournalEntryId" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL AND "reversalJournalEntryId" IS NULL)
    OR ("status" = 'RELEASED' AND "consumedAt" IS NULL AND "releasedAt" IS NOT NULL AND "reversalJournalEntryId" IS NOT NULL)
  )
);

CREATE TABLE "PayoutApproval" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL, "decision" "PayoutApprovalDecision" NOT NULL,
  "reason" TEXT NOT NULL, "evidenceDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutApproval_evidence_check" CHECK (length("reason") >= 10 AND "evidenceDigest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "SigningRequest" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "signerKeyReference" TEXT NOT NULL, "manifest" JSONB NOT NULL, "manifestDigest" TEXT NOT NULL,
  "status" "SigningRequestStatus" NOT NULL DEFAULT 'PENDING',
  "unsignedTransactionDigest" TEXT, "signedTransactionDigest" TEXT, "signedArtifactReference" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0, "submittedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "failureCode" TEXT, "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SigningRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SigningRequest_values_check" CHECK (
    length("signerKeyReference") > 0 AND "manifestDigest" ~ '^[0-9a-f]{64}$' AND "attemptCount" >= 0)
);

CREATE TABLE "BroadcastAttempt" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "signingRequestId" TEXT NOT NULL, "provider" TEXT NOT NULL, "requestDigest" TEXT NOT NULL,
  "responseDigest" TEXT, "transactionId" TEXT,
  "status" "BroadcastAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "failureCode" TEXT, "failureMessage" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "BroadcastAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BroadcastAttempt_values_check" CHECK (
    length("provider") > 0 AND "requestDigest" ~ '^[0-9a-f]{64}$'
    AND ("responseDigest" IS NULL OR "responseDigest" ~ '^[0-9a-f]{64}$')
    AND (("status" = 'PENDING' AND "completedAt" IS NULL) OR ("status" <> 'PENDING' AND "completedAt" IS NOT NULL))
    AND ("status" <> 'SUCCEEDED' OR "transactionId" IS NOT NULL)
  )
);

CREATE TABLE "ChainObservation" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL, "status" "ChainObservationStatus" NOT NULL,
  "confirmations" INTEGER NOT NULL DEFAULT 0, "blockHeight" BIGINT, "blockHash" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "rawDigest" TEXT NOT NULL,
  CONSTRAINT "ChainObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChainObservation_values_check" CHECK (
    "confirmations" >= 0 AND "rawDigest" ~ '^[0-9a-f]{64}$'
    AND ("status" <> 'CONFIRMED' OR ("confirmations" > 0 AND "blockHeight" IS NOT NULL AND "blockHash" IS NOT NULL))
  )
);

CREATE TABLE "PayoutReconciliation" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "payoutId" TEXT NOT NULL,
  "status" "PayoutReconciliationStatus" NOT NULL DEFAULT 'PENDING',
  "expectedReservedAtomic" BIGINT NOT NULL, "destinationAmountAtomic" BIGINT NOT NULL,
  "networkFeeAtomic" BIGINT NOT NULL, "walletAssetDecreaseAtomic" BIGINT NOT NULL,
  "varianceAtomic" BIGINT NOT NULL, "evidenceDigest" TEXT NOT NULL,
  "exceptionCode" TEXT, "exceptionMessage" TEXT,
  "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutReconciliation_values_check" CHECK (
    "expectedReservedAtomic" > 0 AND "destinationAmountAtomic" > 0 AND "networkFeeAtomic" >= 0
    AND "walletAssetDecreaseAtomic" >= 0 AND "evidenceDigest" ~ '^[0-9a-f]{64}$'
    AND (("status" = 'MATCHED' AND "varianceAtomic" = 0 AND "exceptionCode" IS NULL) OR ("status" <> 'MATCHED'))
  )
);

CREATE TABLE "PayoutControl" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL,
  "requestsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "signingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "broadcastEnabled" BOOLEAN NOT NULL DEFAULT false,
  "paused" BOOLEAN NOT NULL DEFAULT true, "pauseReason" TEXT NOT NULL,
  "updatedByUserId" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutControl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutControl_values_check" CHECK (
    length("pauseReason") >= 10 AND "version" > 0
    AND (NOT "paused" OR (NOT "requestsEnabled" AND NOT "signingEnabled" AND NOT "broadcastEnabled"))
  )
);

INSERT INTO "PayoutControl" (
  "id", "assetId", "requestsEnabled", "signingEnabled", "broadcastEnabled",
  "paused", "pauseReason", "version", "updatedAt"
)
SELECT 'payout-control-' || "id", "id", false, false, false, true,
  'Controlled payout execution is installed but remains paused pending production approval.', 1, CURRENT_TIMESTAMP
FROM "Asset";

CREATE TABLE "WalletReconciliation" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "walletId" TEXT NOT NULL,
  "status" "PayoutReconciliationStatus" NOT NULL DEFAULT 'PENDING',
  "nodeBalanceAtomic" BIGINT NOT NULL, "ledgerAssetAtomic" BIGINT NOT NULL,
  "activeReservationAtomic" BIGINT NOT NULL, "pendingBroadcastAtomic" BIGINT NOT NULL,
  "varianceAtomic" BIGINT NOT NULL, "chainHeight" BIGINT, "chainTipHash" TEXT,
  "evidenceDigest" TEXT NOT NULL, "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletReconciliation_values_check" CHECK (
    "nodeBalanceAtomic" >= 0 AND "activeReservationAtomic" >= 0 AND "pendingBroadcastAtomic" >= 0
    AND "evidenceDigest" ~ '^[0-9a-f]{64}$' AND ("status" <> 'MATCHED' OR "varianceAtomic" = 0)
  )
);

CREATE UNIQUE INDEX "PayoutEligibility_payoutId_key" ON "PayoutEligibility"("payoutId");
CREATE UNIQUE INDEX "BalanceReservation_idempotencyKey_key" ON "BalanceReservation"("idempotencyKey");
CREATE UNIQUE INDEX "BalanceReservation_payoutId_key" ON "BalanceReservation"("payoutId");
CREATE UNIQUE INDEX "BalanceReservation_journalEntryId_key" ON "BalanceReservation"("journalEntryId");
CREATE UNIQUE INDEX "BalanceReservation_reversalJournalEntryId_key" ON "BalanceReservation"("reversalJournalEntryId");
CREATE INDEX "BalanceReservation_userId_assetId_status_idx" ON "BalanceReservation"("userId", "assetId", "status");
CREATE INDEX "BalanceReservation_status_createdAt_idx" ON "BalanceReservation"("status", "createdAt");
CREATE UNIQUE INDEX "PayoutApproval_idempotencyKey_key" ON "PayoutApproval"("idempotencyKey");
CREATE UNIQUE INDEX "PayoutApproval_payoutId_key" ON "PayoutApproval"("payoutId");
CREATE INDEX "PayoutApproval_actorUserId_createdAt_idx" ON "PayoutApproval"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "SigningRequest_idempotencyKey_key" ON "SigningRequest"("idempotencyKey");
CREATE UNIQUE INDEX "SigningRequest_payoutId_key" ON "SigningRequest"("payoutId");
CREATE UNIQUE INDEX "BroadcastAttempt_idempotencyKey_key" ON "BroadcastAttempt"("idempotencyKey");
CREATE INDEX "BroadcastAttempt_payoutId_attemptedAt_idx" ON "BroadcastAttempt"("payoutId", "attemptedAt");
CREATE INDEX "BroadcastAttempt_status_attemptedAt_idx" ON "BroadcastAttempt"("status", "attemptedAt");
CREATE UNIQUE INDEX "ChainObservation_idempotencyKey_key" ON "ChainObservation"("idempotencyKey");
CREATE INDEX "ChainObservation_payoutId_observedAt_idx" ON "ChainObservation"("payoutId", "observedAt");
CREATE INDEX "ChainObservation_transactionId_observedAt_idx" ON "ChainObservation"("transactionId", "observedAt");
CREATE UNIQUE INDEX "PayoutReconciliation_idempotencyKey_key" ON "PayoutReconciliation"("idempotencyKey");
CREATE INDEX "PayoutReconciliation_payoutId_reconciledAt_idx" ON "PayoutReconciliation"("payoutId", "reconciledAt");
CREATE INDEX "PayoutReconciliation_status_reconciledAt_idx" ON "PayoutReconciliation"("status", "reconciledAt");
CREATE UNIQUE INDEX "PayoutControl_assetId_key" ON "PayoutControl"("assetId");
CREATE UNIQUE INDEX "WalletReconciliation_idempotencyKey_key" ON "WalletReconciliation"("idempotencyKey");
CREATE INDEX "WalletReconciliation_walletId_reconciledAt_idx" ON "WalletReconciliation"("walletId", "reconciledAt");
CREATE INDEX "WalletReconciliation_status_reconciledAt_idx" ON "WalletReconciliation"("status", "reconciledAt");
CREATE INDEX "MiningAccount_selectedPayoutAddressId_idx" ON "MiningAccount"("selectedPayoutAddressId");
CREATE INDEX "Payout_miningAccountId_status_createdAt_idx" ON "Payout"("miningAccountId", "status", "createdAt");
CREATE INDEX "PayoutRoute_payoutWalletId_status_idx" ON "PayoutRoute"("payoutWalletId", "status");

ALTER TABLE "MiningAccount" ADD CONSTRAINT "MiningAccount_selectedPayoutAddressId_fkey"
  FOREIGN KEY ("selectedPayoutAddressId") REFERENCES "PayoutAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRoute" ADD CONSTRAINT "PayoutRoute_payoutWalletId_fkey"
  FOREIGN KEY ("payoutWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_miningAccountId_fkey"
  FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutEligibility" ADD CONSTRAINT "PayoutEligibility_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BalanceReservation"
  ADD CONSTRAINT "BalanceReservation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalanceReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalanceReservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalanceReservation_availableLedgerAccountId_fkey" FOREIGN KEY ("availableLedgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalanceReservation_reservedLedgerAccountId_fkey" FOREIGN KEY ("reservedLedgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalanceReservation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalanceReservation_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutApproval"
  ADD CONSTRAINT "PayoutApproval_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayoutApproval_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningRequest" ADD CONSTRAINT "SigningRequest_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BroadcastAttempt"
  ADD CONSTRAINT "BroadcastAttempt_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BroadcastAttempt_signingRequestId_fkey" FOREIGN KEY ("signingRequestId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChainObservation" ADD CONSTRAINT "ChainObservation_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutReconciliation" ADD CONSTRAINT "PayoutReconciliation_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutControl"
  ADD CONSTRAINT "PayoutControl_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayoutControl_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletReconciliation" ADD CONSTRAINT "WalletReconciliation_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION miningplatform_payout_route_wallet_alignment()
RETURNS trigger AS $$
DECLARE route_asset_id TEXT; wallet_record RECORD;
BEGIN
  SELECT "assetId" INTO route_asset_id FROM "AssetNetwork" WHERE "id" = NEW."assetNetworkId";
  IF NEW."status" IN ('PILOT', 'ACTIVE') AND NEW."payoutWalletId" IS NULL THEN
    RAISE EXCEPTION 'Pilot and active payout routes require an explicit payout wallet';
  END IF;
  IF NEW."payoutWalletId" IS NOT NULL THEN
    SELECT "assetId", "type" INTO wallet_record FROM "Wallet" WHERE "id" = NEW."payoutWalletId";
    IF NOT FOUND OR wallet_record."assetId" <> route_asset_id OR wallet_record."type" <> 'HOT' THEN
      RAISE EXCEPTION 'Payout route wallet must be a hot wallet for the route asset';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutRoute_wallet_alignment_trigger"
BEFORE INSERT OR UPDATE OF "assetNetworkId", "payoutWalletId", "status" ON "PayoutRoute"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_route_wallet_alignment();

CREATE OR REPLACE FUNCTION miningplatform_mining_account_payout_destination()
RETURNS trigger AS $$
DECLARE destination RECORD;
BEGIN
  IF NEW."selectedPayoutAddressId" IS NULL THEN RETURN NEW; END IF;
  SELECT "userId", "assetId", "status", "active", "verified" INTO destination
  FROM "PayoutAddress" WHERE "id" = NEW."selectedPayoutAddressId";
  IF NOT FOUND OR destination."userId" <> NEW."userId" OR destination."assetId" <> NEW."assetId"
    OR destination."status" <> 'ACTIVE' OR NOT destination."active" OR NOT destination."verified"
  THEN
    RAISE EXCEPTION 'Selected payout destination must be the user''s active verified address for the account asset';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MiningAccount_payout_destination_trigger"
BEFORE INSERT OR UPDATE OF "userId", "assetId", "selectedPayoutAddressId" ON "MiningAccount"
FOR EACH ROW EXECUTE FUNCTION miningplatform_mining_account_payout_destination();

CREATE OR REPLACE FUNCTION miningplatform_payout_execution_alignment()
RETURNS trigger AS $$
DECLARE alignment RECORD;
BEGIN
  IF NEW."executionVersion" = 1 THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'New legacy payout rows are prohibited'; END IF;
    IF OLD."executionVersion" <> 1 OR NEW."executionVersion" <> 1
      OR NEW."status" NOT IN ('FAILED', 'CANCELLED')
      OR OLD."userId" IS DISTINCT FROM NEW."userId"
      OR OLD."assetId" IS DISTINCT FROM NEW."assetId"
      OR OLD."payoutAddressId" IS DISTINCT FROM NEW."payoutAddressId"
      OR OLD."payoutRouteId" IS DISTINCT FROM NEW."payoutRouteId"
      OR OLD."amount" IS DISTINCT FROM NEW."amount"
      OR OLD."networkFee" IS DISTINCT FROM NEW."networkFee"
    THEN RAISE EXCEPTION 'Legacy payout is historical and may only transition to a safe terminal state'; END IF;
    RETURN NEW;
  END IF;

  SELECT address."userId" AS "addressUserId", address."assetId" AS "addressAssetId",
    address."payoutRouteId" AS "addressRouteId", address."status" AS "addressStatus",
    address."active" AS "addressActive", address."verified" AS "addressVerified",
    account."userId" AS "accountUserId", account."assetId" AS "accountAssetId",
    account."selectedPayoutAddressId" AS "selectedAddressId",
    route."status" AS "routeStatus", route."manualApprovalRequired"
  INTO alignment
  FROM "PayoutAddress" address
  JOIN "MiningAccount" account ON account."id" = NEW."miningAccountId"
  JOIN "PayoutRoute" route ON route."id" = NEW."payoutRouteId"
  WHERE address."id" = NEW."payoutAddressId";

  IF NOT FOUND OR alignment."addressUserId" <> NEW."userId" OR alignment."addressAssetId" <> NEW."assetId"
    OR alignment."addressRouteId" <> NEW."payoutRouteId" OR alignment."accountUserId" <> NEW."userId"
    OR alignment."accountAssetId" <> NEW."assetId"
    OR (TG_OP = 'INSERT' AND alignment."selectedAddressId" <> NEW."payoutAddressId")
  THEN RAISE EXCEPTION 'Payout user, account, asset, route, and selected destination must align'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF alignment."addressStatus" <> 'ACTIVE' OR NOT alignment."addressActive" OR NOT alignment."addressVerified"
      THEN RAISE EXCEPTION 'Payout requires the selected active verified destination'; END IF;
    IF alignment."routeStatus" NOT IN ('PILOT', 'ACTIVE')
      THEN RAISE EXCEPTION 'Payout route is not enabled for controlled funds'; END IF;
    IF (alignment."routeStatus" = 'PILOT' OR alignment."manualApprovalRequired") AND NEW."status" <> 'REVIEW'
      THEN RAISE EXCEPTION 'Controlled payout requiring approval must enter review'; END IF;
    IF alignment."routeStatus" = 'ACTIVE' AND NOT alignment."manualApprovalRequired" AND NEW."status" <> 'QUEUED'
      THEN RAISE EXCEPTION 'Automatic active-route payout must enter queued state'; END IF;
  ELSE
    IF OLD."userId" IS DISTINCT FROM NEW."userId" OR OLD."miningAccountId" IS DISTINCT FROM NEW."miningAccountId"
      OR OLD."assetId" IS DISTINCT FROM NEW."assetId" OR OLD."payoutAddressId" IS DISTINCT FROM NEW."payoutAddressId"
      OR OLD."payoutRouteId" IS DISTINCT FROM NEW."payoutRouteId" OR OLD."amount" IS DISTINCT FROM NEW."amount"
      OR OLD."networkFee" IS DISTINCT FROM NEW."networkFee" OR OLD."amountAtomic" IS DISTINCT FROM NEW."amountAtomic"
      OR OLD."networkFeeAtomic" IS DISTINCT FROM NEW."networkFeeAtomic" OR OLD."requestSource" IS DISTINCT FROM NEW."requestSource"
      OR OLD."executionVersion" IS DISTINCT FROM NEW."executionVersion" OR OLD."requestedAt" IS DISTINCT FROM NEW."requestedAt"
      OR OLD."scheduledAt" IS DISTINCT FROM NEW."scheduledAt" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    THEN RAISE EXCEPTION 'Payout financial identity is immutable'; END IF;
    IF NOT (OLD."status" = NEW."status"
      OR (OLD."status" IN ('QUEUED', 'REVIEW') AND NEW."status" IN ('APPROVED', 'FAILED', 'CANCELLED'))
      OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('SIGNING', 'FAILED', 'CANCELLED'))
      OR (OLD."status" = 'SIGNING' AND NEW."status" IN ('BROADCAST', 'FAILED', 'CANCELLED'))
      OR (OLD."status" = 'BROADCAST' AND NEW."status" IN ('CONFIRMING', 'FAILED'))
      OR (OLD."status" = 'CONFIRMING' AND NEW."status" IN ('COMPLETED', 'BROADCAST', 'FAILED')))
    THEN RAISE EXCEPTION 'Invalid payout lifecycle transition'; END IF;
    IF NEW."rowVersion" <> OLD."rowVersion" + 1 THEN RAISE EXCEPTION 'Payout row version must advance exactly once'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "Payout_route_alignment_trigger" ON "Payout";
DROP FUNCTION miningplatform_payout_route_alignment();
CREATE TRIGGER "Payout_execution_alignment_trigger" BEFORE INSERT OR UPDATE ON "Payout"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_execution_alignment();

CREATE OR REPLACE FUNCTION miningplatform_payout_required_evidence()
RETURNS trigger AS $$
BEGIN
  IF NEW."executionVersion" <> 2 THEN RETURN NULL; END IF;
  IF NEW."status" IN ('QUEUED', 'REVIEW', 'APPROVED', 'SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED') THEN
    IF NOT EXISTS (SELECT 1 FROM "PayoutEligibility" WHERE "payoutId" = NEW."id" AND "eligible")
      OR NOT EXISTS (
        SELECT 1 FROM "BalanceReservation"
        WHERE "payoutId" = NEW."id"
          AND "amountAtomic" = NEW."amountAtomic" + NEW."networkFeeAtomic"
          AND "status" = CASE WHEN NEW."status" = 'COMPLETED'
            THEN 'CONSUMED'::"BalanceReservationStatus" ELSE 'ACTIVE'::"BalanceReservationStatus" END
      )
    THEN RAISE EXCEPTION 'Payout state requires eligible evidence and the matching reservation'; END IF;
  END IF;
  IF NEW."status" IN ('APPROVED', 'SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED')
    AND NOT EXISTS (SELECT 1 FROM "PayoutApproval" WHERE "payoutId" = NEW."id" AND "decision" = 'APPROVED')
  THEN RAISE EXCEPTION 'Payout state requires approval evidence'; END IF;
  IF NEW."status" IN ('SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED')
    AND NOT EXISTS (SELECT 1 FROM "SigningRequest" WHERE "payoutId" = NEW."id")
  THEN RAISE EXCEPTION 'Payout state requires signing evidence'; END IF;
  IF NEW."status" IN ('BROADCAST', 'CONFIRMING', 'COMPLETED')
    AND NOT EXISTS (
      SELECT 1 FROM "BroadcastAttempt" WHERE "payoutId" = NEW."id" AND "status" = 'SUCCEEDED'
        AND "transactionId" = NEW."transactionId")
  THEN RAISE EXCEPTION 'Payout state requires successful broadcast evidence'; END IF;
  IF NEW."status" = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1 FROM "PayoutReconciliation" WHERE "payoutId" = NEW."id" AND "status" = 'MATCHED'
        AND "expectedReservedAtomic" = NEW."amountAtomic" + NEW."networkFeeAtomic")
  THEN RAISE EXCEPTION 'Completed payout requires matched reconciliation evidence'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Payout_required_evidence_trigger"
AFTER INSERT OR UPDATE ON "Payout" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_required_evidence();

CREATE OR REPLACE FUNCTION miningplatform_append_only_evidence()
RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% evidence is append-only', TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutEligibility_append_only_trigger" BEFORE UPDATE OR DELETE ON "PayoutEligibility"
FOR EACH ROW EXECUTE FUNCTION miningplatform_append_only_evidence();
CREATE TRIGGER "PayoutApproval_append_only_trigger" BEFORE UPDATE OR DELETE ON "PayoutApproval"
FOR EACH ROW EXECUTE FUNCTION miningplatform_append_only_evidence();
CREATE TRIGGER "ChainObservation_append_only_trigger" BEFORE UPDATE OR DELETE ON "ChainObservation"
FOR EACH ROW EXECUTE FUNCTION miningplatform_append_only_evidence();
CREATE TRIGGER "PayoutReconciliation_append_only_trigger" BEFORE UPDATE OR DELETE ON "PayoutReconciliation"
FOR EACH ROW EXECUTE FUNCTION miningplatform_append_only_evidence();
CREATE TRIGGER "WalletReconciliation_append_only_trigger" BEFORE UPDATE OR DELETE ON "WalletReconciliation"
FOR EACH ROW EXECUTE FUNCTION miningplatform_append_only_evidence();

CREATE OR REPLACE FUNCTION miningplatform_payout_approval_separation()
RETURNS trigger AS $$
DECLARE requester_id TEXT; actor_role "UserRole";
BEGIN
  SELECT "userId" INTO requester_id FROM "Payout" WHERE "id" = NEW."payoutId";
  SELECT "role" INTO actor_role FROM "User" WHERE "id" = NEW."actorUserId";
  IF requester_id IS NULL OR actor_role IS NULL THEN RAISE EXCEPTION 'Approval principal does not exist'; END IF;
  IF requester_id = NEW."actorUserId" THEN RAISE EXCEPTION 'Payout requester cannot approve their own payout'; END IF;
  IF actor_role NOT IN ('ADMIN', 'OWNER') THEN RAISE EXCEPTION 'Payout approval requires ADMIN or OWNER role'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutApproval_separation_trigger" BEFORE INSERT ON "PayoutApproval"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_approval_separation();

CREATE OR REPLACE FUNCTION miningplatform_balance_reservation_lifecycle()
RETURNS trigger AS $$
DECLARE payout_record RECORD; available_record RECORD; reserved_record RECORD;
  debit_atomic BIGINT; credit_atomic BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Balance reservations cannot be deleted'; END IF;
  SELECT "userId", "assetId", "amountAtomic" + "networkFeeAtomic" AS total
    INTO payout_record FROM "Payout" WHERE "id" = NEW."payoutId" AND "executionVersion" = 2;
  SELECT "userId", "assetId", "type" INTO available_record FROM "LedgerAccount" WHERE "id" = NEW."availableLedgerAccountId";
  SELECT "userId", "assetId", "type" INTO reserved_record FROM "LedgerAccount" WHERE "id" = NEW."reservedLedgerAccountId";
  SELECT COALESCE(SUM("debitAtomic"), 0), COALESCE(SUM("creditAtomic"), 0)
    INTO debit_atomic, credit_atomic FROM "JournalLine" WHERE "journalEntryId" = NEW."journalEntryId";
  IF payout_record."userId" <> NEW."userId" OR payout_record."assetId" <> NEW."assetId"
    OR payout_record.total <> NEW."amountAtomic"
    OR available_record."userId" <> NEW."userId" OR available_record."assetId" <> NEW."assetId"
    OR reserved_record."userId" <> NEW."userId" OR reserved_record."assetId" <> NEW."assetId"
    OR available_record."type" <> 'LIABILITY' OR reserved_record."type" <> 'LIABILITY'
    OR debit_atomic <> NEW."amountAtomic" OR credit_atomic <> NEW."amountAtomic"
    OR NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE "id" = NEW."journalEntryId" AND "status" = 'POSTED')
  THEN RAISE EXCEPTION 'Balance reservation must align with payout and a balanced posted journal'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."payoutId" IS DISTINCT FROM NEW."payoutId" OR OLD."userId" IS DISTINCT FROM NEW."userId"
      OR OLD."assetId" IS DISTINCT FROM NEW."assetId"
      OR OLD."availableLedgerAccountId" IS DISTINCT FROM NEW."availableLedgerAccountId"
      OR OLD."reservedLedgerAccountId" IS DISTINCT FROM NEW."reservedLedgerAccountId"
      OR OLD."journalEntryId" IS DISTINCT FROM NEW."journalEntryId"
      OR OLD."amountAtomic" IS DISTINCT FROM NEW."amountAtomic" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    THEN RAISE EXCEPTION 'Balance reservation identity is immutable'; END IF;
    IF OLD."status" <> 'ACTIVE' OR NEW."status" NOT IN ('CONSUMED', 'RELEASED')
      THEN RAISE EXCEPTION 'Invalid balance reservation transition'; END IF;
    IF NEW."status" = 'RELEASED' AND NOT EXISTS (
      SELECT 1 FROM "JournalEntry" WHERE "id" = NEW."reversalJournalEntryId" AND "status" = 'POSTED'
        AND "referenceType" = 'PayoutReservationReversal' AND "referenceId" = NEW."payoutId")
    THEN RAISE EXCEPTION 'Reservation release requires a posted reversal journal'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BalanceReservation_lifecycle_trigger" BEFORE INSERT OR UPDATE OR DELETE ON "BalanceReservation"
FOR EACH ROW EXECUTE FUNCTION miningplatform_balance_reservation_lifecycle();

CREATE OR REPLACE FUNCTION miningplatform_signing_request_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Signing requests cannot be deleted'; END IF;
  IF OLD."payoutId" IS DISTINCT FROM NEW."payoutId" OR OLD."signerKeyReference" IS DISTINCT FROM NEW."signerKeyReference"
    OR OLD."manifest" IS DISTINCT FROM NEW."manifest" OR OLD."manifestDigest" IS DISTINCT FROM NEW."manifestDigest"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN RAISE EXCEPTION 'Signing request manifest is immutable'; END IF;
  IF NOT (OLD."status" = NEW."status"
    OR (OLD."status" = 'PENDING' AND NEW."status" IN ('SUBMITTED', 'REJECTED', 'FAILED'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('SIGNED', 'REJECTED', 'FAILED')))
  THEN RAISE EXCEPTION 'Invalid signing request transition'; END IF;
  IF NEW."attemptCount" < OLD."attemptCount" OR NEW."attemptCount" > OLD."attemptCount" + 1
    THEN RAISE EXCEPTION 'Signing attempt count can advance only once'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SigningRequest_lifecycle_trigger" BEFORE UPDATE OR DELETE ON "SigningRequest"
FOR EACH ROW EXECUTE FUNCTION miningplatform_signing_request_lifecycle();

CREATE OR REPLACE FUNCTION miningplatform_broadcast_attempt_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Broadcast attempts cannot be deleted'; END IF;
  IF OLD."payoutId" IS DISTINCT FROM NEW."payoutId" OR OLD."signingRequestId" IS DISTINCT FROM NEW."signingRequestId"
    OR OLD."provider" IS DISTINCT FROM NEW."provider" OR OLD."requestDigest" IS DISTINCT FROM NEW."requestDigest"
    OR OLD."attemptedAt" IS DISTINCT FROM NEW."attemptedAt" OR OLD."status" <> 'PENDING' OR NEW."status" = 'PENDING'
  THEN RAISE EXCEPTION 'Broadcast attempt identity is immutable and can complete once'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BroadcastAttempt_lifecycle_trigger" BEFORE UPDATE OR DELETE ON "BroadcastAttempt"
FOR EACH ROW EXECUTE FUNCTION miningplatform_broadcast_attempt_lifecycle();

CREATE OR REPLACE FUNCTION miningplatform_payout_address_not_selected_on_disable()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DISABLED' AND NEW."status" = 'DISABLED'
    AND EXISTS (SELECT 1 FROM "MiningAccount" WHERE "selectedPayoutAddressId" = OLD."id")
  THEN RAISE EXCEPTION 'Clear the selected payout destination before disabling the address'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PayoutAddress_selected_destination_trigger" BEFORE UPDATE OF "status" ON "PayoutAddress"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_address_not_selected_on_disable();
