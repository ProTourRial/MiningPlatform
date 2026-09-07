-- MiningPlatform
-- Author: Abia Nugrahanto
-- Regtest payout reorg recovery. A completed payment may return to confirmation
-- only after append-only chain evidence proves confirmation regression. The
-- original signed transaction is replayed exactly; replacement outputs are not
-- authorized and the financial settlement is never posted twice.

BEGIN;

ALTER TABLE "Payout"
  ADD COLUMN "reorgDetectedAt" TIMESTAMP(3),
  ADD COLUMN "reconfirmationCount" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Payout_reconfirmation_count_check" CHECK ("reconfirmationCount" >= 0);

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
    IF NEW."status" = 'CONSUMED' AND NOT EXISTS (
      SELECT 1 FROM "JournalEntry" WHERE "status" = 'POSTED'
        AND "referenceType" = 'PayoutSettlement' AND "referenceId" = NEW."payoutId")
    THEN RAISE EXCEPTION 'Reservation consumption requires a posted payout settlement journal'; END IF;
    IF NEW."status" = 'RELEASED' AND NOT EXISTS (
      SELECT 1 FROM "JournalEntry" WHERE "id" = NEW."reversalJournalEntryId" AND "status" = 'POSTED'
        AND "referenceType" = 'PayoutReservationReversal' AND "referenceId" = NEW."payoutId")
    THEN RAISE EXCEPTION 'Reservation release requires a posted reversal journal'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
    route."status" AS "routeStatus", route."manualApprovalRequired", route."requiredConfirmations"
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
    IF NEW."reconfirmationCount" <> 0 OR NEW."reorgDetectedAt" IS NOT NULL
      THEN RAISE EXCEPTION 'New payout cannot contain reorg recovery evidence'; END IF;
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
      OR (OLD."status" = 'CONFIRMING' AND NEW."status" IN ('COMPLETED', 'BROADCAST', 'FAILED'))
      OR (OLD."status" = 'COMPLETED' AND NEW."status" = 'CONFIRMING'))
    THEN RAISE EXCEPTION 'Invalid payout lifecycle transition'; END IF;
    IF NEW."rowVersion" <> OLD."rowVersion" + 1 THEN RAISE EXCEPTION 'Payout row version must advance exactly once'; END IF;

    IF OLD."status" = 'COMPLETED' AND NEW."status" = 'CONFIRMING' THEN
      IF OLD."transactionId" IS NULL OR NEW."transactionId" IS DISTINCT FROM OLD."transactionId"
        OR NEW."reorgDetectedAt" IS NULL
        OR (OLD."reorgDetectedAt" IS NOT NULL AND NEW."reorgDetectedAt" <= OLD."reorgDetectedAt")
        OR NEW."reconfirmationCount" <> OLD."reconfirmationCount"
        OR NOT EXISTS (
          SELECT 1 FROM "ChainObservation" observation
          WHERE observation."payoutId" = OLD."id"
            AND observation."transactionId" = OLD."transactionId"
            AND observation."observedAt" >= OLD."completedAt"
            AND (
              observation."status" IN ('MEMPOOL', 'REORGED', 'DROPPED')
              OR observation."confirmations" < alignment."requiredConfirmations"
            )
        )
      THEN RAISE EXCEPTION 'Completed payout may re-enter confirmation only after chain-regression evidence'; END IF;
    ELSIF OLD."status" = 'CONFIRMING' AND NEW."status" = 'COMPLETED' AND OLD."reorgDetectedAt" IS NOT NULL THEN
      IF NEW."reorgDetectedAt" IS DISTINCT FROM OLD."reorgDetectedAt"
        OR NEW."reconfirmationCount" <> OLD."reconfirmationCount" + 1
      THEN RAISE EXCEPTION 'Reconfirmed payout must advance its recovery counter exactly once'; END IF;
    ELSIF NEW."reorgDetectedAt" IS DISTINCT FROM OLD."reorgDetectedAt"
      OR NEW."reconfirmationCount" <> OLD."reconfirmationCount"
    THEN RAISE EXCEPTION 'Payout reorg recovery evidence may change only during recovery transitions'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
          AND (
            (NEW."status" = 'COMPLETED' AND "status" = 'CONSUMED')
            OR (NEW."status" = 'CONFIRMING' AND "status" IN ('ACTIVE', 'CONSUMED'))
            OR (NEW."status" NOT IN ('CONFIRMING', 'COMPLETED') AND "status" = 'ACTIVE')
          )
      )
    THEN RAISE EXCEPTION 'Payout state requires eligible evidence and the matching reservation'; END IF;
  END IF;
  IF NEW."status" IN ('APPROVED', 'SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED')
    AND NOT EXISTS (SELECT 1 FROM "PayoutApproval" WHERE "payoutId" = NEW."id" AND "decision" = 'APPROVED')
  THEN RAISE EXCEPTION 'Payout state requires approval evidence'; END IF;
  IF NEW."status" = 'SIGNING'
    AND NOT EXISTS (SELECT 1 FROM "SigningRequest" WHERE "payoutId" = NEW."id")
  THEN RAISE EXCEPTION 'Payout state requires signing evidence'; END IF;
  IF NEW."status" IN ('BROADCAST', 'CONFIRMING', 'COMPLETED')
    AND NOT EXISTS (
      SELECT 1 FROM "SigningRequest" WHERE "payoutId" = NEW."id" AND "status" = 'SIGNED'
        AND "signedTransactionDigest" IS NOT NULL AND "signedArtifactReference" IS NOT NULL)
  THEN RAISE EXCEPTION 'Broadcast payout state requires completed signing evidence'; END IF;
  IF NEW."status" IN ('BROADCAST', 'CONFIRMING', 'COMPLETED')
    AND NOT EXISTS (
      SELECT 1 FROM "BroadcastAttempt" WHERE "payoutId" = NEW."id" AND "status" = 'SUCCEEDED'
        AND "transactionId" = NEW."transactionId")
  THEN RAISE EXCEPTION 'Payout state requires successful broadcast evidence'; END IF;
  IF NEW."status" = 'COMPLETED' AND (
    NOT EXISTS (
      SELECT 1 FROM "PayoutReconciliation" WHERE "payoutId" = NEW."id" AND "status" = 'MATCHED'
        AND "expectedReservedAtomic" = NEW."amountAtomic" + NEW."networkFeeAtomic")
    OR NOT EXISTS (
      SELECT 1 FROM "JournalEntry" WHERE "id" = NEW."journalEntryId" AND "status" = 'POSTED'
        AND "referenceType" = 'PayoutSettlement' AND "referenceId" = NEW."id")
  ) THEN RAISE EXCEPTION 'Completed payout requires matched reconciliation and posted settlement evidence'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
