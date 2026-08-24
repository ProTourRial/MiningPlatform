-- MiningPlatform
-- Author: Abia Nugrahanto
-- Durable, append-only correlation evidence for native Bitcoin candidates,
-- proposal validation, and submitblock outcomes. This migration does not
-- activate native mining or store raw blocks.

CREATE TYPE "NativeBitcoinChain" AS ENUM ('MAIN', 'TEST', 'TESTNET4', 'SIGNET', 'REGTEST');
CREATE TYPE "NativeBitcoinProposalStatus" AS ENUM ('VALID', 'REJECTED');
CREATE TYPE "NativeBitcoinSubmissionStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'INCONCLUSIVE', 'REJECTED');

CREATE TABLE "NativeBitcoinCandidate" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "chain" "NativeBitcoinChain" NOT NULL,
  "jobId" TEXT NOT NULL,
  "templateSourceDigest" TEXT NOT NULL,
  "coinbasePolicyDigest" TEXT NOT NULL,
  "blockHash" TEXT NOT NULL,
  "headerHex" TEXT NOT NULL,
  "rawBlockDigest" TEXT NOT NULL,
  "reconstructedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeBitcoinCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativeBitcoinCandidate_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "jobId" ~ '^native-[1-9][0-9]{0,9}-[0-9a-f]{24}$'
    AND "templateSourceDigest" ~ '^[0-9a-f]{64}$'
    AND "coinbasePolicyDigest" ~ '^[0-9a-f]{64}$'
    AND "blockHash" ~ '^[0-9a-f]{64}$'
    AND "headerHex" ~ '^[0-9a-f]{160}$'
    AND "rawBlockDigest" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE "NativeBitcoinProposalEvidence" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "status" "NativeBitcoinProposalStatus" NOT NULL,
  "reason" TEXT,
  "rawBlockDigest" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeBitcoinProposalEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativeBitcoinProposalEvidence_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "rawBlockDigest" ~ '^[0-9a-f]{64}$'
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND "validUntil" > "observedAt"
    AND "validUntil" <= "observedAt" + INTERVAL '5 minutes'
    AND (("status" = 'VALID' AND "reason" IS NULL)
      OR ("status" = 'REJECTED' AND length("reason") BETWEEN 1 AND 1024))
  )
);

CREATE TABLE "NativeBitcoinSubmissionAttempt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "proposalEvidenceId" TEXT NOT NULL,
  "status" "NativeBitcoinSubmissionStatus" NOT NULL,
  "reason" TEXT,
  "rawBlockDigest" TEXT NOT NULL,
  "workId" TEXT,
  "sourceDigest" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeBitcoinSubmissionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativeBitcoinSubmissionAttempt_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "rawBlockDigest" ~ '^[0-9a-f]{64}$'
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND ("workId" IS NULL OR length("workId") BETWEEN 1 AND 1024)
    AND (("status" = 'ACCEPTED' AND "reason" IS NULL)
      OR ("status" <> 'ACCEPTED' AND length("reason") BETWEEN 1 AND 1024))
  )
);

CREATE UNIQUE INDEX "NativeBitcoinCandidate_idempotencyKey_key"
  ON "NativeBitcoinCandidate"("idempotencyKey");
CREATE UNIQUE INDEX "NativeBitcoinCandidate_chain_blockHash_key"
  ON "NativeBitcoinCandidate"("chain", "blockHash");
CREATE UNIQUE INDEX "NativeBitcoinCandidate_chain_rawBlockDigest_key"
  ON "NativeBitcoinCandidate"("chain", "rawBlockDigest");
CREATE INDEX "NativeBitcoinCandidate_chain_reconstructedAt_idx"
  ON "NativeBitcoinCandidate"("chain", "reconstructedAt");
CREATE INDEX "NativeBitcoinCandidate_jobId_reconstructedAt_idx"
  ON "NativeBitcoinCandidate"("jobId", "reconstructedAt");

CREATE UNIQUE INDEX "NativeBitcoinProposalEvidence_idempotencyKey_key"
  ON "NativeBitcoinProposalEvidence"("idempotencyKey");
CREATE UNIQUE INDEX "NativeBitcoinProposalEvidence_candidateId_sourceDigest_key"
  ON "NativeBitcoinProposalEvidence"("candidateId", "sourceDigest");
CREATE INDEX "NativeBitcoinProposalEvidence_candidateId_observedAt_idx"
  ON "NativeBitcoinProposalEvidence"("candidateId", "observedAt");
CREATE INDEX "NativeBitcoinProposalEvidence_status_validUntil_idx"
  ON "NativeBitcoinProposalEvidence"("status", "validUntil");

CREATE UNIQUE INDEX "NativeBitcoinSubmissionAttempt_idempotencyKey_key"
  ON "NativeBitcoinSubmissionAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "NativeBitcoinSubmissionAttempt_candidateId_sourceDigest_key"
  ON "NativeBitcoinSubmissionAttempt"("candidateId", "sourceDigest");
CREATE INDEX "NativeBitcoinSubmissionAttempt_candidateId_observedAt_idx"
  ON "NativeBitcoinSubmissionAttempt"("candidateId", "observedAt");
CREATE INDEX "NativeBitcoinSubmissionAttempt_status_observedAt_idx"
  ON "NativeBitcoinSubmissionAttempt"("status", "observedAt");

ALTER TABLE "NativeBitcoinProposalEvidence"
  ADD CONSTRAINT "NativeBitcoinProposalEvidence_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "NativeBitcoinCandidate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NativeBitcoinSubmissionAttempt"
  ADD CONSTRAINT "NativeBitcoinSubmissionAttempt_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "NativeBitcoinCandidate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "NativeBitcoinSubmissionAttempt_proposalEvidenceId_fkey"
  FOREIGN KEY ("proposalEvidenceId") REFERENCES "NativeBitcoinProposalEvidence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION miningplatform_native_bitcoin_evidence_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Native Bitcoin evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NativeBitcoinCandidate_immutable_trigger"
BEFORE UPDATE OR DELETE ON "NativeBitcoinCandidate"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_evidence_immutable();

CREATE TRIGGER "NativeBitcoinProposalEvidence_immutable_trigger"
BEFORE UPDATE OR DELETE ON "NativeBitcoinProposalEvidence"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_evidence_immutable();

CREATE TRIGGER "NativeBitcoinSubmissionAttempt_immutable_trigger"
BEFORE UPDATE OR DELETE ON "NativeBitcoinSubmissionAttempt"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_evidence_immutable();

CREATE OR REPLACE FUNCTION miningplatform_native_bitcoin_proposal_correlates()
RETURNS trigger AS $$
DECLARE candidate_digest TEXT;
BEGIN
  SELECT "rawBlockDigest" INTO candidate_digest
  FROM "NativeBitcoinCandidate" WHERE "id" = NEW."candidateId" FOR KEY SHARE;
  IF candidate_digest IS NULL OR candidate_digest <> NEW."rawBlockDigest" THEN
    RAISE EXCEPTION 'Native Bitcoin proposal must match its candidate digest';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NativeBitcoinProposalEvidence_correlation_trigger"
BEFORE INSERT ON "NativeBitcoinProposalEvidence"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_proposal_correlates();

CREATE OR REPLACE FUNCTION miningplatform_native_bitcoin_submission_correlates()
RETURNS trigger AS $$
DECLARE proposal_record RECORD; candidate_digest TEXT;
BEGIN
  SELECT "candidateId", "status", "rawBlockDigest", "observedAt", "validUntil"
    INTO proposal_record FROM "NativeBitcoinProposalEvidence"
    WHERE "id" = NEW."proposalEvidenceId" FOR KEY SHARE;
  SELECT "rawBlockDigest" INTO candidate_digest
    FROM "NativeBitcoinCandidate" WHERE "id" = NEW."candidateId" FOR KEY SHARE;
  IF proposal_record."candidateId" IS DISTINCT FROM NEW."candidateId"
    OR proposal_record."status" IS DISTINCT FROM 'VALID'
    OR proposal_record."rawBlockDigest" IS DISTINCT FROM NEW."rawBlockDigest"
    OR candidate_digest IS DISTINCT FROM NEW."rawBlockDigest"
    OR NEW."observedAt" < proposal_record."observedAt"
    OR NEW."observedAt" > proposal_record."validUntil"
  THEN
    RAISE EXCEPTION 'Native Bitcoin submission requires fresh matching valid proposal evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NativeBitcoinSubmissionAttempt_correlation_trigger"
BEFORE INSERT ON "NativeBitcoinSubmissionAttempt"
FOR EACH ROW EXECUTE FUNCTION miningplatform_native_bitcoin_submission_correlates();
