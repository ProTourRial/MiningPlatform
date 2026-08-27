-- MiningPlatform
-- Author: Abia Nugrahanto
-- Append-only read-only observations for resolving ambiguous native Bitcoin
-- submitblock intents without automatically replaying the side effect.

CREATE TYPE "NativeBitcoinRecoveryObservationStatus" AS ENUM (
  'ACTIVE_CHAIN', 'STALE_CHAIN', 'NOT_FOUND'
);

CREATE TABLE "NativeBitcoinSubmissionRecoveryObservation" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "submissionIntentId" TEXT NOT NULL,
  "status" "NativeBitcoinRecoveryObservationStatus" NOT NULL,
  "blockHash" TEXT NOT NULL,
  "confirmations" INTEGER NOT NULL,
  "blockHeight" INTEGER,
  "transactionCount" INTEGER,
  "chainTipHash" TEXT NOT NULL,
  "chainHeight" INTEGER NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeBitcoinSubmissionRecoveryObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativeBitcoinSubmissionRecoveryObservation_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "blockHash" ~ '^[0-9a-f]{64}$'
    AND "chainTipHash" ~ '^[0-9a-f]{64}$'
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND "chainHeight" >= 0
    AND (
      (
        "status" = 'ACTIVE_CHAIN'
        AND "confirmations" >= 1
        AND "blockHeight" IS NOT NULL
        AND "transactionCount" BETWEEN 1 AND 100001
        AND "confirmations" = "chainHeight" - "blockHeight" + 1
      )
      OR (
        "status" = 'STALE_CHAIN'
        AND "confirmations" = -1
        AND "blockHeight" IS NOT NULL
        AND "transactionCount" BETWEEN 1 AND 100001
      )
      OR (
        "status" = 'NOT_FOUND'
        AND "confirmations" = 0
        AND "blockHeight" IS NULL
        AND "transactionCount" IS NULL
      )
    )
  )
);

CREATE UNIQUE INDEX "NativeBitcoinSubmissionRecoveryObservation_idempotencyKey_key"
  ON "NativeBitcoinSubmissionRecoveryObservation"("idempotencyKey");
CREATE UNIQUE INDEX "NativeBitcoinSubmissionRecoveryObservation_submissionIntentId_sourceDigest_key"
  ON "NativeBitcoinSubmissionRecoveryObservation"("submissionIntentId", "sourceDigest");
CREATE INDEX "NativeBitcoinSubmissionRecoveryObservation_submissionIntentId_observedAt_idx"
  ON "NativeBitcoinSubmissionRecoveryObservation"("submissionIntentId", "observedAt");
CREATE INDEX "NativeBitcoinSubmissionRecoveryObservation_status_observedAt_idx"
  ON "NativeBitcoinSubmissionRecoveryObservation"("status", "observedAt");

ALTER TABLE "NativeBitcoinSubmissionRecoveryObservation"
  ADD CONSTRAINT "NativeBitcoinSubmissionRecoveryObservation_submissionIntentId_fkey"
  FOREIGN KEY ("submissionIntentId") REFERENCES "NativeBitcoinSubmissionIntent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "NativeBitcoinSubmissionRecoveryObservation_immutable_trigger"
BEFORE UPDATE OR DELETE ON "NativeBitcoinSubmissionRecoveryObservation"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_evidence_immutable();

CREATE OR REPLACE FUNCTION miningplatform_native_bitcoin_recovery_observation_correlates()
RETURNS trigger AS $$
DECLARE candidate_hash TEXT;
BEGIN
  SELECT candidate."blockHash" INTO candidate_hash
  FROM "NativeBitcoinSubmissionIntent" intent
  JOIN "NativeBitcoinCandidate" candidate ON candidate."id" = intent."candidateId"
  WHERE intent."id" = NEW."submissionIntentId"
  FOR KEY SHARE OF intent, candidate;

  IF candidate_hash IS DISTINCT FROM NEW."blockHash" THEN
    RAISE EXCEPTION 'Native Bitcoin recovery observation does not match its submission intent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NativeBitcoinSubmissionRecoveryObservation_correlation_trigger"
BEFORE INSERT ON "NativeBitcoinSubmissionRecoveryObservation"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_recovery_observation_correlates();
