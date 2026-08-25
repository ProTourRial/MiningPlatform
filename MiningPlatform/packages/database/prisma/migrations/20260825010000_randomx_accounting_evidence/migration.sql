-- MiningPlatform
-- Author: Abia Nugrahanto
-- Append-only algorithm-discriminated RandomX evidence. This table does not
-- create a contribution fact, reward allocation, journal entry, or balance.

CREATE TABLE "RandomXAcceptedShareEvidence" (
  "id" TEXT NOT NULL,
  "evidenceVersion" INTEGER NOT NULL DEFAULT 1,
  "sourceDigest" TEXT NOT NULL,
  "shareFingerprint" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT NOT NULL,
  "upstreamSessionId" TEXT NOT NULL,
  "upstreamJobId" TEXT NOT NULL,
  "upstreamClientId" TEXT NOT NULL,
  "workerName" TEXT NOT NULL,
  "seedHash" TEXT NOT NULL,
  "targetHex" TEXT NOT NULL,
  "target" DECIMAL(20,0) NOT NULL,
  "nonce" TEXT NOT NULL,
  "submittedResult" TEXT NOT NULL,
  "computedResult" TEXT NOT NULL,
  "acceptedDifficulty" DECIMAL(38,12) NOT NULL,
  "jobReceivedAt" TIMESTAMP(3) NOT NULL,
  "jobExpiresAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "correlationId" TEXT NOT NULL,
  "validationDigest" TEXT NOT NULL,
  "upstreamDecisionDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RandomXAcceptedShareEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RandomXAcceptedShareEvidence_values_check" CHECK (
    "evidenceVersion" = 1
    AND "algorithm" = 'rx/0'
    AND "sourceDigest" ~ '^[0-9a-f]{64}$'
    AND "shareFingerprint" ~ '^[0-9a-f]{64}$'
    AND "seedHash" ~ '^[0-9a-f]{64}$'
    AND "targetHex" ~ '^([0-9a-f]{8}|[0-9a-f]{16})$'
    AND "target" > 0
    AND "nonce" ~ '^[0-9a-f]{8}$'
    AND "submittedResult" ~ '^[0-9a-f]{64}$'
    AND "computedResult" = "submittedResult"
    AND "acceptedDifficulty" > 0
    AND "validationDigest" ~ '^[0-9a-f]{64}$'
    AND "upstreamDecisionDigest" ~ '^[0-9a-f]{64}$'
    AND length("upstreamSessionId") BETWEEN 1 AND 256
    AND length("upstreamJobId") BETWEEN 1 AND 256
    AND length("upstreamClientId") BETWEEN 1 AND 256
    AND length("workerName") BETWEEN 1 AND 256
    AND length("correlationId") BETWEEN 1 AND 256
    AND "jobReceivedAt" <= "submittedAt"
    AND "submittedAt" <= "jobExpiresAt"
    AND "submittedAt" <= "acceptedAt"
  )
);

CREATE UNIQUE INDEX "RandomXAcceptedShareEvidence_sourceDigest_key"
  ON "RandomXAcceptedShareEvidence"("sourceDigest");
CREATE UNIQUE INDEX "RandomXAcceptedShareEvidence_shareFingerprint_key"
  ON "RandomXAcceptedShareEvidence"("shareFingerprint");
CREATE INDEX "RandomXAcceptedShareEvidence_assetId_upstreamPoolId_acceptedAt_idx"
  ON "RandomXAcceptedShareEvidence"("assetId", "upstreamPoolId", "acceptedAt");
CREATE INDEX "RandomXAcceptedShareEvidence_miningAccountId_acceptedAt_idx"
  ON "RandomXAcceptedShareEvidence"("miningAccountId", "acceptedAt");
CREATE INDEX "RandomXAcceptedShareEvidence_upstreamPoolId_upstreamSessionId_upstreamJobId_idx"
  ON "RandomXAcceptedShareEvidence"("upstreamPoolId", "upstreamSessionId", "upstreamJobId");

ALTER TABLE "RandomXAcceptedShareEvidence"
  ADD CONSTRAINT "RandomXAcceptedShareEvidence_miningAccountId_fkey"
  FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RandomXAcceptedShareEvidence"
  ADD CONSTRAINT "RandomXAcceptedShareEvidence_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RandomXAcceptedShareEvidence"
  ADD CONSTRAINT "RandomXAcceptedShareEvidence_upstreamPoolId_fkey"
  FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION miningplatform_randomx_evidence_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RandomX accepted-share evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RandomXAcceptedShareEvidence_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RandomXAcceptedShareEvidence"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_evidence_immutable();

CREATE FUNCTION miningplatform_randomx_evidence_correlates()
RETURNS trigger AS $$
DECLARE
  account_asset_id TEXT;
  pool_asset_id TEXT;
  asset_algorithm TEXT;
BEGIN
  SELECT "assetId" INTO account_asset_id
  FROM "MiningAccount" WHERE "id" = NEW."miningAccountId" FOR KEY SHARE;
  SELECT "assetId" INTO pool_asset_id
  FROM "UpstreamPool" WHERE "id" = NEW."upstreamPoolId" FOR KEY SHARE;
  SELECT "algorithm" INTO asset_algorithm
  FROM "Asset" WHERE "id" = NEW."assetId" FOR KEY SHARE;

  IF account_asset_id IS DISTINCT FROM NEW."assetId"
    OR pool_asset_id IS DISTINCT FROM NEW."assetId"
  THEN
    RAISE EXCEPTION 'RandomX evidence account, asset, and pool do not correlate';
  END IF;
  IF asset_algorithm IS NULL OR upper(asset_algorithm) NOT IN ('RANDOMX', 'RX/0') THEN
    RAISE EXCEPTION 'RandomX evidence asset must use the RANDOMX or RX/0 algorithm';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RandomXAcceptedShareEvidence_correlation_trigger"
BEFORE INSERT ON "RandomXAcceptedShareEvidence"
FOR EACH ROW EXECUTE FUNCTION miningplatform_randomx_evidence_correlates();
