-- MiningPlatform
-- Author: Abia Nugrahanto
-- Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

BEGIN;

CREATE TYPE "ContributionSourceType" AS ENUM ('STRATUM_SHARE', 'RANDOMX_ACCEPTED_SHARE');

ALTER TABLE "ContributionFact"
  ADD COLUMN "sourceType" "ContributionSourceType" NOT NULL DEFAULT 'STRATUM_SHARE',
  ADD COLUMN "randomXEvidenceId" TEXT,
  ALTER COLUMN "shareId" DROP NOT NULL;

CREATE UNIQUE INDEX "ContributionFact_randomXEvidenceId_key"
  ON "ContributionFact"("randomXEvidenceId");

ALTER TABLE "ContributionFact"
  ADD CONSTRAINT "ContributionFact_randomXEvidenceId_fkey"
    FOREIGN KEY ("randomXEvidenceId")
    REFERENCES "RandomXAcceptedShareEvidence"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContributionFact_exact_source_check" CHECK (
    (
      "sourceType" = 'STRATUM_SHARE'
      AND "shareId" IS NOT NULL
      AND "randomXEvidenceId" IS NULL
    ) OR (
      "sourceType" = 'RANDOMX_ACCEPTED_SHARE'
      AND "shareId" IS NULL
      AND "randomXEvidenceId" IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION mining_guard_contribution_fact()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Contribution facts are immutable';
  END IF;
  IF OLD."rewardPeriodId" IS NULL
     AND NEW."rewardPeriodId" IS NOT NULL
     AND ROW(
       NEW."id", NEW."sourceEventId", NEW."sourceType", NEW."shareId",
       NEW."randomXEvidenceId", NEW."miningAccountId", NEW."assetId",
       NEW."upstreamPoolId", NEW."acceptedDifficulty", NEW."acceptedAt",
       NEW."correlationId", NEW."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       OLD."id", OLD."sourceEventId", OLD."sourceType", OLD."shareId",
       OLD."randomXEvidenceId", OLD."miningAccountId", OLD."assetId",
       OLD."upstreamPoolId", OLD."acceptedDifficulty", OLD."acceptedAt",
       OLD."correlationId", OLD."createdAt"
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Contribution facts are immutable except for one-time reward-period assignment';
END;
$$ LANGUAGE plpgsql;

-- Existing evidence may have been consumed before the accounting path existed. Re-enqueue
-- only evidence that can be correlated exactly to its immutable accepted-share outbox event.
INSERT INTO "OutboxEvent" (
  "id", "eventId", "eventName", "eventVersion", "producer", "aggregateType",
  "aggregateId", "correlationId", "causationId", "idempotencyKey", "payload",
  "occurredAt", "updatedAt"
)
SELECT
  'randomx-contribution-backfill:' || evidence."id",
  'randomx-contribution-backfill:' || evidence."id",
  'reward.randomx-contribution.accepted.v1',
  1,
  'mining-worker',
  'ContributionFact',
  evidence."id",
  evidence."correlationId",
  accepted_event."eventId",
  'randomx-contribution:' || evidence."id" || ':v1',
  jsonb_build_object(
    'sourceEventId', accepted_event."eventId",
    'randomXEvidenceId', evidence."id",
    'miningAccountId', evidence."miningAccountId",
    'assetId', evidence."assetId",
    'upstreamPoolId', evidence."upstreamPoolId",
    'acceptedDifficulty', trim_scale(evidence."acceptedDifficulty")::text,
    'acceptedAt', accepted_event."payload"->>'upstreamDecidedAt'
  ),
  evidence."acceptedAt",
  CURRENT_TIMESTAMP
FROM "RandomXAcceptedShareEvidence" AS evidence
JOIN "OutboxEvent" AS accepted_event
  ON accepted_event."eventName" = 'mining.randomx.share.accepted.v1'
 AND accepted_event."eventVersion" = 1
 AND accepted_event."producer" = 'randomx-mining-gateway'
 AND accepted_event."aggregateType" = 'MiningAccount'
 AND accepted_event."aggregateId" = evidence."miningAccountId"
 AND accepted_event."correlationId" = evidence."correlationId"
 AND accepted_event."idempotencyKey" = 'randomx-share:' || evidence."shareFingerprint"
 AND accepted_event."occurredAt" = evidence."acceptedAt"
 AND accepted_event."payload"->>'miningAccountId' = evidence."miningAccountId"
 AND accepted_event."payload"->>'assetId' = evidence."assetId"
 AND accepted_event."payload"->>'upstreamPoolId' = evidence."upstreamPoolId"
 AND accepted_event."payload"->>'localFingerprint' = evidence."shareFingerprint"
 AND accepted_event."payload"->>'upstreamAccepted' = 'true'
 AND accepted_event."payload"->>'upstreamDecisionDigest' = evidence."upstreamDecisionDigest"
 AND CASE
   WHEN pg_input_is_valid(
     accepted_event."payload"->>'acceptedDifficulty',
     'numeric'
   ) THEN (accepted_event."payload"->>'acceptedDifficulty')::numeric
     = evidence."acceptedDifficulty"
   ELSE false
 END
 AND CASE
   WHEN pg_input_is_valid(
     accepted_event."payload"->>'upstreamDecidedAt',
     'timestamp with time zone'
   ) THEN (accepted_event."payload"->>'upstreamDecidedAt')::timestamptz
     = evidence."acceptedAt"
   ELSE false
 END
LEFT JOIN "OutboxEvent" AS existing_contribution
  ON existing_contribution."idempotencyKey" = 'randomx-contribution:' || evidence."id" || ':v1'
WHERE existing_contribution."id" IS NULL;

COMMIT;
