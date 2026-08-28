-- MiningPlatform
-- Author: Abia Nugrahanto
-- Durable RandomX upstream work, pre-RPC submission intent, immutable decision,
-- and accepted-event outbox correlation. None of these tables may create a
-- contribution fact, reward, journal, balance, or payout.

CREATE TABLE "RandomXUpstreamJobEvidence" (
  "id" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT NOT NULL,
  "upstreamSessionId" TEXT NOT NULL,
  "upstreamJobId" TEXT NOT NULL,
  "upstreamClientId" TEXT NOT NULL,
  "jobBlob" TEXT NOT NULL,
  "seedHash" TEXT NOT NULL,
  "targetHex" TEXT NOT NULL,
  "height" DECIMAL(20,0) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RandomXUpstreamJobEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RandomXUpstreamJobEvidence_values_check" CHECK (
    "algorithm" = 'rx/0'
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND length("upstreamSessionId") BETWEEN 1 AND 256
    AND length("upstreamJobId") BETWEEN 1 AND 256
    AND length("upstreamClientId") BETWEEN 1 AND 256
    AND "jobBlob" ~ '^[0-9a-f]+$'
    AND length("jobBlob") BETWEEN 86 AND 814
    AND length("jobBlob") % 2 = 0
    AND "seedHash" ~ '^[0-9a-f]{64}$'
    AND "targetHex" ~ '^([0-9a-f]{8}|[0-9a-f]{16})$'
    AND "height" BETWEEN 0 AND 18446744073709551615
    AND "receivedAt" <= "expiresAt"
  )
);

CREATE UNIQUE INDEX "RandomXUpstreamJobEvidence_sourceDigest_key"
  ON "RandomXUpstreamJobEvidence"("sourceDigest");
CREATE UNIQUE INDEX "RandomXUpstreamJobEvidence_upstreamPoolId_upstreamSessionId_upstreamJobId_key"
  ON "RandomXUpstreamJobEvidence"("upstreamPoolId", "upstreamSessionId", "upstreamJobId");
CREATE INDEX "RandomXUpstreamJobEvidence_assetId_upstreamPoolId_receivedAt_idx"
  ON "RandomXUpstreamJobEvidence"("assetId", "upstreamPoolId", "receivedAt");
CREATE INDEX "RandomXUpstreamJobEvidence_upstreamPoolId_expiresAt_idx"
  ON "RandomXUpstreamJobEvidence"("upstreamPoolId", "expiresAt");

CREATE TABLE "RandomXShareSubmissionIntent" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "shareFingerprint" TEXT NOT NULL,
  "jobEvidenceId" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT NOT NULL,
  "workerName" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "submittedResult" TEXT NOT NULL,
  "computedResult" TEXT NOT NULL,
  "localTarget" DECIMAL(20,0) NOT NULL,
  "acceptedDifficulty" DECIMAL(38,12) NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "correlationId" TEXT NOT NULL,
  "validationDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RandomXShareSubmissionIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RandomXShareSubmissionIntent_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND "shareFingerprint" ~ '^[0-9a-f]{64}$'
    AND length("workerName") BETWEEN 1 AND 256
    AND "nonce" ~ '^[0-9a-f]{8}$'
    AND "submittedResult" ~ '^[0-9a-f]{64}$'
    AND "computedResult" = "submittedResult"
    AND "localTarget" > 0
    AND "acceptedDifficulty" > 0
    AND length("correlationId") BETWEEN 1 AND 256
    AND "validationDigest" ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "RandomXShareSubmissionIntent_idempotencyKey_key"
  ON "RandomXShareSubmissionIntent"("idempotencyKey");
CREATE UNIQUE INDEX "RandomXShareSubmissionIntent_sourceDigest_key"
  ON "RandomXShareSubmissionIntent"("sourceDigest");
CREATE UNIQUE INDEX "RandomXShareSubmissionIntent_shareFingerprint_key"
  ON "RandomXShareSubmissionIntent"("shareFingerprint");
CREATE UNIQUE INDEX "RandomXShareSubmissionIntent_jobEvidenceId_sourceDigest_key"
  ON "RandomXShareSubmissionIntent"("jobEvidenceId", "sourceDigest");
CREATE INDEX "RandomXShareSubmissionIntent_miningAccountId_submittedAt_idx"
  ON "RandomXShareSubmissionIntent"("miningAccountId", "submittedAt");
CREATE INDEX "RandomXShareSubmissionIntent_assetId_upstreamPoolId_submittedAt_idx"
  ON "RandomXShareSubmissionIntent"("assetId", "upstreamPoolId", "submittedAt");
CREATE INDEX "RandomXShareSubmissionIntent_jobEvidenceId_submittedAt_idx"
  ON "RandomXShareSubmissionIntent"("jobEvidenceId", "submittedAt");

CREATE TABLE "RandomXUpstreamShareDecision" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "submissionIntentId" TEXT NOT NULL,
  "accepted" BOOLEAN NOT NULL,
  "errorCode" INTEGER,
  "errorMessage" TEXT,
  "sourceDigest" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "outboxEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RandomXUpstreamShareDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RandomXUpstreamShareDecision_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 256
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND (
      ("accepted" = true AND "errorCode" IS NULL AND "errorMessage" IS NULL AND "outboxEventId" IS NOT NULL)
      OR
      ("accepted" = false AND "errorMessage" IS NOT NULL
        AND length("errorMessage") BETWEEN 1 AND 512 AND "outboxEventId" IS NULL)
    )
  )
);

CREATE UNIQUE INDEX "RandomXUpstreamShareDecision_idempotencyKey_key"
  ON "RandomXUpstreamShareDecision"("idempotencyKey");
CREATE UNIQUE INDEX "RandomXUpstreamShareDecision_submissionIntentId_key"
  ON "RandomXUpstreamShareDecision"("submissionIntentId");
CREATE UNIQUE INDEX "RandomXUpstreamShareDecision_sourceDigest_key"
  ON "RandomXUpstreamShareDecision"("sourceDigest");
CREATE UNIQUE INDEX "RandomXUpstreamShareDecision_outboxEventId_key"
  ON "RandomXUpstreamShareDecision"("outboxEventId");
CREATE INDEX "RandomXUpstreamShareDecision_accepted_decidedAt_idx"
  ON "RandomXUpstreamShareDecision"("accepted", "decidedAt");
CREATE INDEX "RandomXUpstreamShareDecision_submissionIntentId_decidedAt_idx"
  ON "RandomXUpstreamShareDecision"("submissionIntentId", "decidedAt");

ALTER TABLE "RandomXUpstreamJobEvidence"
  ADD CONSTRAINT "RandomXUpstreamJobEvidence_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RandomXUpstreamJobEvidence_upstreamPoolId_fkey"
  FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RandomXShareSubmissionIntent"
  ADD CONSTRAINT "RandomXShareSubmissionIntent_jobEvidenceId_fkey"
  FOREIGN KEY ("jobEvidenceId") REFERENCES "RandomXUpstreamJobEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RandomXShareSubmissionIntent_miningAccountId_fkey"
  FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RandomXShareSubmissionIntent_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RandomXShareSubmissionIntent_upstreamPoolId_fkey"
  FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RandomXUpstreamShareDecision"
  ADD CONSTRAINT "RandomXUpstreamShareDecision_submissionIntentId_fkey"
  FOREIGN KEY ("submissionIntentId") REFERENCES "RandomXShareSubmissionIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RandomXUpstreamShareDecision_outboxEventId_fkey"
  FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION miningplatform_randomx_submission_evidence_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RandomX upstream job, submission intent, and decision evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RandomXUpstreamJobEvidence_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RandomXUpstreamJobEvidence"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_submission_evidence_immutable();
CREATE TRIGGER "RandomXShareSubmissionIntent_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RandomXShareSubmissionIntent"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_submission_evidence_immutable();
CREATE TRIGGER "RandomXUpstreamShareDecision_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RandomXUpstreamShareDecision"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_submission_evidence_immutable();

CREATE FUNCTION miningplatform_randomx_job_evidence_correlates()
RETURNS trigger AS $$
DECLARE pool_asset_id TEXT; asset_algorithm TEXT;
BEGIN
  SELECT "assetId" INTO pool_asset_id
  FROM "UpstreamPool" WHERE "id" = NEW."upstreamPoolId" FOR KEY SHARE;
  SELECT "algorithm" INTO asset_algorithm
  FROM "Asset" WHERE "id" = NEW."assetId" FOR KEY SHARE;
  IF pool_asset_id IS DISTINCT FROM NEW."assetId" THEN
    RAISE EXCEPTION 'RandomX job evidence asset and upstream pool do not correlate';
  END IF;
  IF asset_algorithm IS NULL OR upper(asset_algorithm) NOT IN ('RANDOMX', 'RX/0') THEN
    RAISE EXCEPTION 'RandomX job evidence asset must use the RANDOMX or RX/0 algorithm';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RandomXUpstreamJobEvidence_correlation_trigger"
BEFORE INSERT ON "RandomXUpstreamJobEvidence"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_job_evidence_correlates();

CREATE FUNCTION miningplatform_randomx_submission_intent_correlates()
RETURNS trigger AS $$
DECLARE job_record RECORD; account_asset_id TEXT; pool_asset_id TEXT;
BEGIN
  SELECT "assetId", "upstreamPoolId", "receivedAt", "expiresAt"
    INTO job_record FROM "RandomXUpstreamJobEvidence"
    WHERE "id" = NEW."jobEvidenceId" FOR KEY SHARE;
  SELECT "assetId" INTO account_asset_id
  FROM "MiningAccount" WHERE "id" = NEW."miningAccountId" FOR KEY SHARE;
  SELECT "assetId" INTO pool_asset_id
  FROM "UpstreamPool" WHERE "id" = NEW."upstreamPoolId" FOR KEY SHARE;
  IF job_record."assetId" IS DISTINCT FROM NEW."assetId"
    OR job_record."upstreamPoolId" IS DISTINCT FROM NEW."upstreamPoolId"
    OR account_asset_id IS DISTINCT FROM NEW."assetId"
    OR pool_asset_id IS DISTINCT FROM NEW."assetId"
    OR NEW."submittedAt" < job_record."receivedAt"
    OR NEW."submittedAt" > job_record."expiresAt"
  THEN
    RAISE EXCEPTION 'RandomX submission intent does not correlate with job, account, asset, pool, or time';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RandomXShareSubmissionIntent_correlation_trigger"
BEFORE INSERT ON "RandomXShareSubmissionIntent"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_submission_intent_correlates();

CREATE FUNCTION miningplatform_randomx_upstream_decision_correlates()
RETURNS trigger AS $$
DECLARE intent_record RECORD; outbox_record RECORD;
BEGIN
  SELECT intent."shareFingerprint", intent."miningAccountId", intent."assetId",
         intent."upstreamPoolId", intent."workerName", intent."nonce",
         intent."submittedResult", intent."computedResult", intent."localTarget",
         intent."acceptedDifficulty", intent."submittedAt", intent."correlationId",
         job."algorithm", job."upstreamSessionId", job."upstreamJobId",
         job."upstreamClientId", job."jobBlob", job."seedHash", job."targetHex",
         job."height", job."receivedAt", job."expiresAt"
    INTO intent_record FROM "RandomXShareSubmissionIntent" intent
    JOIN "RandomXUpstreamJobEvidence" job ON job."id" = intent."jobEvidenceId"
    WHERE intent."id" = NEW."submissionIntentId" FOR KEY SHARE OF intent, job;
  IF NEW."decidedAt" < intent_record."submittedAt" THEN
    RAISE EXCEPTION 'RandomX upstream decision predates the submission intent';
  END IF;

  IF NEW."accepted" THEN
    SELECT "eventName", "eventVersion", "producer", "aggregateType", "aggregateId",
           "correlationId", "causationId", "idempotencyKey", "payload", "occurredAt"
      INTO outbox_record FROM "OutboxEvent"
      WHERE "id" = NEW."outboxEventId" FOR KEY SHARE;
    IF outbox_record."eventName" IS DISTINCT FROM 'mining.randomx.share.accepted.v1'
      OR outbox_record."eventVersion" IS DISTINCT FROM 1
      OR outbox_record."producer" IS DISTINCT FROM 'randomx-mining-gateway'
      OR outbox_record."aggregateType" IS DISTINCT FROM 'MiningAccount'
      OR outbox_record."aggregateId" IS DISTINCT FROM intent_record."miningAccountId"
      OR outbox_record."correlationId" IS DISTINCT FROM intent_record."correlationId"
      OR outbox_record."causationId" IS DISTINCT FROM NEW."id"
      OR outbox_record."idempotencyKey" IS DISTINCT FROM ('randomx-share:' || intent_record."shareFingerprint")
      OR outbox_record."occurredAt" IS DISTINCT FROM NEW."decidedAt"
      OR jsonb_typeof(outbox_record."payload") IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(outbox_record."payload"))
        IS DISTINCT FROM 26::bigint
      OR outbox_record."payload"->>'miningAccountId' IS DISTINCT FROM intent_record."miningAccountId"
      OR outbox_record."payload"->>'assetId' IS DISTINCT FROM intent_record."assetId"
      OR outbox_record."payload"->>'algorithm' IS DISTINCT FROM intent_record."algorithm"
      OR outbox_record."payload"->>'upstreamPoolId' IS DISTINCT FROM intent_record."upstreamPoolId"
      OR outbox_record."payload"->>'upstreamSessionId' IS DISTINCT FROM intent_record."upstreamSessionId"
      OR outbox_record."payload"->>'upstreamJobId' IS DISTINCT FROM intent_record."upstreamJobId"
      OR outbox_record."payload"->>'upstreamClientId' IS DISTINCT FROM intent_record."upstreamClientId"
      OR outbox_record."payload"->>'workerName' IS DISTINCT FROM intent_record."workerName"
      OR outbox_record."payload"->>'jobBlob' IS DISTINCT FROM intent_record."jobBlob"
      OR outbox_record."payload"->>'seedHash' IS DISTINCT FROM intent_record."seedHash"
      OR outbox_record."payload"->>'targetHex' IS DISTINCT FROM intent_record."targetHex"
      OR outbox_record."payload"->>'jobHeight' IS DISTINCT FROM trim_scale(intent_record."height")::text
      OR ((outbox_record."payload"->>'jobReceivedAt')::timestamptz AT TIME ZONE 'UTC')
        IS DISTINCT FROM intent_record."receivedAt"
      OR ((outbox_record."payload"->>'jobExpiresAt')::timestamptz AT TIME ZONE 'UTC')
        IS DISTINCT FROM intent_record."expiresAt"
      OR outbox_record."payload"->>'nonce' IS DISTINCT FROM intent_record."nonce"
      OR outbox_record."payload"->>'submittedResult' IS DISTINCT FROM intent_record."submittedResult"
      OR ((outbox_record."payload"->>'submittedAt')::timestamptz AT TIME ZONE 'UTC')
        IS DISTINCT FROM intent_record."submittedAt"
      OR jsonb_typeof(outbox_record."payload"->'localAccepted') IS DISTINCT FROM 'boolean'
      OR outbox_record."payload"->>'localAccepted' IS DISTINCT FROM 'true'
      OR outbox_record."payload"->>'localReason' IS DISTINCT FROM 'ACCEPTED'
      OR outbox_record."payload"->>'localFingerprint' IS DISTINCT FROM intent_record."shareFingerprint"
      OR outbox_record."payload"->>'computedResult' IS DISTINCT FROM intent_record."computedResult"
      OR outbox_record."payload"->>'localTarget' IS DISTINCT FROM trim_scale(intent_record."localTarget")::text
      OR outbox_record."payload"->>'acceptedDifficulty'
        IS DISTINCT FROM trim_scale(intent_record."acceptedDifficulty")::text
      OR jsonb_typeof(outbox_record."payload"->'upstreamAccepted') IS DISTINCT FROM 'boolean'
      OR outbox_record."payload"->>'upstreamDecisionDigest' IS DISTINCT FROM NEW."sourceDigest"
      OR outbox_record."payload"->>'upstreamAccepted' IS DISTINCT FROM 'true'
      OR ((outbox_record."payload"->>'upstreamDecidedAt')::timestamptz AT TIME ZONE 'UTC')
        IS DISTINCT FROM NEW."decidedAt"
    THEN
      RAISE EXCEPTION 'RandomX accepted decision requires exact correlated outbox evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RandomXUpstreamShareDecision_correlation_trigger"
BEFORE INSERT ON "RandomXUpstreamShareDecision"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_upstream_decision_correlates();

CREATE FUNCTION miningplatform_randomx_decision_outbox_envelope_immutable()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RandomXUpstreamShareDecision"
    WHERE "outboxEventId" = OLD."id"
  ) AND (
    NEW."eventId" IS DISTINCT FROM OLD."eventId"
    OR NEW."eventName" IS DISTINCT FROM OLD."eventName"
    OR NEW."eventVersion" IS DISTINCT FROM OLD."eventVersion"
    OR NEW."producer" IS DISTINCT FROM OLD."producer"
    OR NEW."aggregateType" IS DISTINCT FROM OLD."aggregateType"
    OR NEW."aggregateId" IS DISTINCT FROM OLD."aggregateId"
    OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
    OR NEW."causationId" IS DISTINCT FROM OLD."causationId"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'RandomX accepted-share outbox envelope is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OutboxEvent_randomx_envelope_immutable_trigger"
BEFORE UPDATE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_decision_outbox_envelope_immutable();
