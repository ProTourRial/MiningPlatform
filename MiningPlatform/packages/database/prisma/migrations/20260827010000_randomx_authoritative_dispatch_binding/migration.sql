-- MiningPlatform
-- Author: Abia Nugrahanto
-- Bind every durable RandomX intent to the upstream wire proof independently
-- from local worker attribution and receipt metadata. Existing schema-v19 rows
-- retain their unique local fingerprint as a collision-safe legacy key.

BEGIN;

ALTER TABLE "RandomXShareSubmissionIntent"
  ADD COLUMN "upstreamDispatchFingerprint" TEXT;

ALTER TABLE "RandomXShareSubmissionIntent"
  DISABLE TRIGGER "RandomXShareSubmissionIntent_immutable_trigger";

UPDATE "RandomXShareSubmissionIntent"
SET "upstreamDispatchFingerprint" = "shareFingerprint";

ALTER TABLE "RandomXShareSubmissionIntent"
  ENABLE TRIGGER "RandomXShareSubmissionIntent_immutable_trigger";

ALTER TABLE "RandomXShareSubmissionIntent"
  ALTER COLUMN "upstreamDispatchFingerprint" SET NOT NULL,
  ADD CONSTRAINT "RandomXShareSubmissionIntent_dispatch_fingerprint_check"
  CHECK ("upstreamDispatchFingerprint" ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX "RandomXShareSubmissionIntent_upstreamDispatchFingerprint_key"
  ON "RandomXShareSubmissionIntent"("upstreamDispatchFingerprint");

COMMIT;
