-- MiningPlatform
-- Author: Abia Nugrahanto
-- Durable pre-RPC intent for native Bitcoin submitblock side effects. An
-- intent without an outcome is an explicit recovery exception, never success.

CREATE TABLE "NativeBitcoinSubmissionIntent" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "proposalEvidenceId" TEXT NOT NULL,
  "rawBlockDigest" TEXT NOT NULL,
  "workId" TEXT,
  "sourceDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeBitcoinSubmissionIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativeBitcoinSubmissionIntent_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "rawBlockDigest" ~ '^[0-9a-f]{64}$'
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND ("workId" IS NULL OR length("workId") BETWEEN 1 AND 1024)
  )
);

CREATE UNIQUE INDEX "NativeBitcoinSubmissionIntent_idempotencyKey_key"
  ON "NativeBitcoinSubmissionIntent"("idempotencyKey");
CREATE UNIQUE INDEX "NativeBitcoinSubmissionIntent_candidateId_sourceDigest_key"
  ON "NativeBitcoinSubmissionIntent"("candidateId", "sourceDigest");
CREATE INDEX "NativeBitcoinSubmissionIntent_candidateId_createdAt_idx"
  ON "NativeBitcoinSubmissionIntent"("candidateId", "createdAt");
CREATE INDEX "NativeBitcoinSubmissionIntent_proposalEvidenceId_createdAt_idx"
  ON "NativeBitcoinSubmissionIntent"("proposalEvidenceId", "createdAt");

ALTER TABLE "NativeBitcoinSubmissionIntent"
  ADD CONSTRAINT "NativeBitcoinSubmissionIntent_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "NativeBitcoinCandidate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "NativeBitcoinSubmissionIntent_proposalEvidenceId_fkey"
  FOREIGN KEY ("proposalEvidenceId") REFERENCES "NativeBitcoinProposalEvidence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NativeBitcoinSubmissionAttempt"
  ADD COLUMN "submissionIntentId" TEXT;

-- Preserve any schema-v15 evidence already recorded before this migration by
-- creating a deterministic synthetic intent for each historical outcome.
INSERT INTO "NativeBitcoinSubmissionIntent" (
  "id", "idempotencyKey", "candidateId", "proposalEvidenceId",
  "rawBlockDigest", "workId", "sourceDigest", "createdAt"
)
SELECT
  'intent_' || md5(attempt."id"),
  'migration:v16:' || md5(attempt."id"),
  attempt."candidateId",
  attempt."proposalEvidenceId",
  attempt."rawBlockDigest",
  attempt."workId",
  encode(digest(
    'native-intent-v16:' || attempt."id" || ':' || attempt."sourceDigest",
    'sha256'
  ), 'hex'),
  attempt."createdAt"
FROM "NativeBitcoinSubmissionAttempt" attempt;

ALTER TABLE "NativeBitcoinSubmissionAttempt"
  DISABLE TRIGGER "NativeBitcoinSubmissionAttempt_immutable_trigger";

UPDATE "NativeBitcoinSubmissionAttempt" attempt
SET "submissionIntentId" = 'intent_' || md5(attempt."id");

ALTER TABLE "NativeBitcoinSubmissionAttempt"
  ENABLE TRIGGER "NativeBitcoinSubmissionAttempt_immutable_trigger";

ALTER TABLE "NativeBitcoinSubmissionAttempt"
  ALTER COLUMN "submissionIntentId" SET NOT NULL,
  ADD CONSTRAINT "NativeBitcoinSubmissionAttempt_submissionIntentId_fkey"
  FOREIGN KEY ("submissionIntentId") REFERENCES "NativeBitcoinSubmissionIntent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "NativeBitcoinSubmissionAttempt_submissionIntentId_key"
  ON "NativeBitcoinSubmissionAttempt"("submissionIntentId");

CREATE TRIGGER "NativeBitcoinSubmissionIntent_immutable_trigger"
BEFORE UPDATE OR DELETE ON "NativeBitcoinSubmissionIntent"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_evidence_immutable();

CREATE OR REPLACE FUNCTION miningplatform_native_bitcoin_intent_correlates()
RETURNS trigger AS $$
DECLARE proposal_record RECORD; candidate_digest TEXT;
BEGIN
  SELECT "candidateId", "status", "rawBlockDigest", "validUntil"
    INTO proposal_record FROM "NativeBitcoinProposalEvidence"
    WHERE "id" = NEW."proposalEvidenceId" FOR KEY SHARE;
  SELECT "rawBlockDigest" INTO candidate_digest
    FROM "NativeBitcoinCandidate" WHERE "id" = NEW."candidateId" FOR KEY SHARE;
  IF proposal_record."candidateId" IS DISTINCT FROM NEW."candidateId"
    OR proposal_record."status" IS DISTINCT FROM 'VALID'
    OR proposal_record."rawBlockDigest" IS DISTINCT FROM NEW."rawBlockDigest"
    OR candidate_digest IS DISTINCT FROM NEW."rawBlockDigest"
    OR CURRENT_TIMESTAMP > proposal_record."validUntil"
  THEN
    RAISE EXCEPTION 'Native Bitcoin submission intent requires fresh matching valid proposal evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NativeBitcoinSubmissionIntent_correlation_trigger"
BEFORE INSERT ON "NativeBitcoinSubmissionIntent"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_intent_correlates();

CREATE OR REPLACE FUNCTION miningplatform_native_bitcoin_submission_correlates()
RETURNS trigger AS $$
DECLARE proposal_record RECORD; candidate_digest TEXT; intent_record RECORD;
BEGIN
  SELECT "candidateId", "status", "rawBlockDigest", "observedAt", "validUntil"
    INTO proposal_record FROM "NativeBitcoinProposalEvidence"
    WHERE "id" = NEW."proposalEvidenceId" FOR KEY SHARE;
  SELECT "rawBlockDigest" INTO candidate_digest
    FROM "NativeBitcoinCandidate" WHERE "id" = NEW."candidateId" FOR KEY SHARE;
  SELECT "candidateId", "proposalEvidenceId", "rawBlockDigest", "workId"
    INTO intent_record FROM "NativeBitcoinSubmissionIntent"
    WHERE "id" = NEW."submissionIntentId" FOR KEY SHARE;
  IF proposal_record."candidateId" IS DISTINCT FROM NEW."candidateId"
    OR proposal_record."status" IS DISTINCT FROM 'VALID'
    OR proposal_record."rawBlockDigest" IS DISTINCT FROM NEW."rawBlockDigest"
    OR candidate_digest IS DISTINCT FROM NEW."rawBlockDigest"
    OR intent_record."candidateId" IS DISTINCT FROM NEW."candidateId"
    OR intent_record."proposalEvidenceId" IS DISTINCT FROM NEW."proposalEvidenceId"
    OR intent_record."rawBlockDigest" IS DISTINCT FROM NEW."rawBlockDigest"
    OR intent_record."workId" IS DISTINCT FROM NEW."workId"
    OR NEW."observedAt" < proposal_record."observedAt"
    OR NEW."observedAt" > proposal_record."validUntil"
  THEN
    RAISE EXCEPTION 'Native Bitcoin submission requires matching intent and fresh valid proposal evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
