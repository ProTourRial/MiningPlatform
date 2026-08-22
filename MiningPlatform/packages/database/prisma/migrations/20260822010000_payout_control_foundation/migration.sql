-- MiningPlatform
-- Author: Abia Nugrahanto
-- P0.4 payout-control foundation: versioned routes, single-use step-up,
-- checksum-aware address registration, cooldown, and immutable identity.

CREATE TYPE "StepUpScope" AS ENUM ('PAYOUT_ADDRESS_WRITE');
CREATE TYPE "AddressValidator" AS ENUM ('BITCOIN', 'UNSUPPORTED');
CREATE TYPE "PayoutRouteStatus" AS ENUM ('DISABLED', 'ADDRESS_REGISTRATION', 'PILOT', 'ACTIVE');
CREATE TYPE "PayoutAddressStatus" AS ENUM ('COOLDOWN', 'ACTIVE', 'DISABLED');

ALTER TABLE "UserSecurity"
  ADD COLUMN "lastTotpCounter" BIGINT;

CREATE TABLE "StepUpAuthorization" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "scope" "StepUpScope" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StepUpAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetNetwork" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "networkKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "chainFamily" TEXT NOT NULL,
  "addressValidator" "AddressValidator" NOT NULL,
  "isTestnet" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetNetwork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayoutRoute" (
  "id" TEXT NOT NULL,
  "assetNetworkId" TEXT NOT NULL,
  "routeKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PayoutRouteStatus" NOT NULL DEFAULT 'DISABLED',
  "minimumPayoutAtomic" BIGINT NOT NULL,
  "maximumPayoutAtomic" BIGINT,
  "fixedNetworkFeeAtomic" BIGINT NOT NULL DEFAULT 0,
  "addressCooldownSeconds" INTEGER NOT NULL DEFAULT 86400,
  "requiredConfirmations" INTEGER NOT NULL,
  "manualApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "changeReason" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutRoute_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AssetNetwork" (
  "id", "assetId", "networkKey", "displayName", "chainFamily",
  "addressValidator", "isTestnet", "enabled", "createdAt", "updatedAt"
)
SELECT
  'asset-network-' || asset."id",
  asset."id",
  CASE WHEN asset."symbol" = 'BTC' THEN 'bitcoin-mainnet' ELSE 'legacy-mainnet' END,
  CASE WHEN asset."symbol" = 'BTC' THEN 'Bitcoin Mainnet' ELSE asset."name" || ' Legacy Mainnet' END,
  CASE WHEN asset."symbol" = 'BTC' THEN 'BITCOIN' ELSE upper(asset."symbol") END,
  CASE WHEN asset."symbol" = 'BTC' THEN 'BITCOIN'::"AddressValidator" ELSE 'UNSUPPORTED'::"AddressValidator" END,
  false,
  asset."enabled" AND asset."symbol" = 'BTC',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Asset" asset;

INSERT INTO "PayoutRoute" (
  "id", "assetNetworkId", "routeKey", "version", "status",
  "minimumPayoutAtomic", "maximumPayoutAtomic", "fixedNetworkFeeAtomic",
  "addressCooldownSeconds", "requiredConfirmations", "manualApprovalRequired",
  "effectiveFrom", "effectiveUntil", "changeReason", "createdAt"
)
SELECT
  'payout-route-' || asset."id",
  network."id",
  'default',
  1,
  CASE WHEN asset."symbol" = 'BTC'
    THEN 'ADDRESS_REGISTRATION'::"PayoutRouteStatus"
    ELSE 'DISABLED'::"PayoutRouteStatus"
  END,
  LEAST(
    9223372036854775807::numeric,
    FLOOR(asset."minimumPayout" * POWER(10::numeric, asset."decimals"))
  )::bigint,
  NULL,
  0,
  86400,
  asset."requiredConfirmations",
  true,
  TIMESTAMP '2026-08-22 00:00:00',
  NULL,
  'P0.4 address-registration foundation; signing and broadcast remain disabled.',
  CURRENT_TIMESTAMP
FROM "Asset" asset
JOIN "AssetNetwork" network ON network."assetId" = asset."id";

ALTER TABLE "PayoutAddress"
  ADD COLUMN "assetNetworkId" TEXT,
  ADD COLUMN "payoutRouteId" TEXT,
  ADD COLUMN "addressHash" TEXT,
  ADD COLUMN "status" "PayoutAddressStatus" NOT NULL DEFAULT 'COOLDOWN',
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "cooldownUntil" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3);

UPDATE "PayoutAddress" address
SET
  "assetNetworkId" = network."id",
  "payoutRouteId" = route."id",
  "addressHash" = encode(digest(network."id" || ':' || address."address", 'sha256'), 'hex'),
  "status" = CASE
    WHEN address."verified" AND address."active" THEN 'ACTIVE'::"PayoutAddressStatus"
    ELSE 'DISABLED'::"PayoutAddressStatus"
  END,
  "verifiedAt" = CASE WHEN address."verified" THEN address."createdAt" ELSE NULL END,
  "active" = address."verified" AND address."active",
  "activatedAt" = CASE
    WHEN address."verified" AND address."active" THEN COALESCE(address."activatedAt", address."createdAt")
    ELSE NULL
  END,
  "cooldownUntil" = address."createdAt",
  "disabledAt" = CASE
    WHEN address."verified" AND address."active" THEN NULL
    ELSE CURRENT_TIMESTAMP
  END
FROM "AssetNetwork" network
JOIN "PayoutRoute" route ON route."assetNetworkId" = network."id"
WHERE network."assetId" = address."assetId";

ALTER TABLE "PayoutAddress"
  ALTER COLUMN "assetNetworkId" SET NOT NULL,
  ALTER COLUMN "payoutRouteId" SET NOT NULL,
  ALTER COLUMN "addressHash" SET NOT NULL,
  ALTER COLUMN "cooldownUntil" SET NOT NULL,
  ALTER COLUMN "active" SET DEFAULT false;

ALTER TABLE "Payout"
  ADD COLUMN "payoutRouteId" TEXT;

UPDATE "Payout" payout
SET "payoutRouteId" = address."payoutRouteId"
FROM "PayoutAddress" address
WHERE address."id" = payout."payoutAddressId";

ALTER TABLE "Payout"
  ALTER COLUMN "payoutRouteId" SET NOT NULL;

ALTER TABLE "PayoutAddress"
  DROP CONSTRAINT "PayoutAddress_assetId_address_key";

CREATE UNIQUE INDEX "StepUpAuthorization_tokenHash_key" ON "StepUpAuthorization"("tokenHash");
CREATE INDEX "StepUpAuthorization_userId_scope_consumedAt_expiresAt_idx"
  ON "StepUpAuthorization"("userId", "scope", "consumedAt", "expiresAt");
CREATE INDEX "StepUpAuthorization_sessionId_consumedAt_expiresAt_idx"
  ON "StepUpAuthorization"("sessionId", "consumedAt", "expiresAt");

CREATE UNIQUE INDEX "AssetNetwork_assetId_networkKey_key"
  ON "AssetNetwork"("assetId", "networkKey");
CREATE INDEX "AssetNetwork_enabled_chainFamily_idx"
  ON "AssetNetwork"("enabled", "chainFamily");

CREATE UNIQUE INDEX "PayoutRoute_assetNetworkId_routeKey_version_key"
  ON "PayoutRoute"("assetNetworkId", "routeKey", "version");
CREATE INDEX "PayoutRoute_status_effectiveFrom_effectiveUntil_idx"
  ON "PayoutRoute"("status", "effectiveFrom", "effectiveUntil");

CREATE UNIQUE INDEX "PayoutAddress_assetNetworkId_addressHash_key"
  ON "PayoutAddress"("assetNetworkId", "addressHash");
CREATE INDEX "PayoutAddress_userId_payoutRouteId_status_idx"
  ON "PayoutAddress"("userId", "payoutRouteId", "status");
CREATE UNIQUE INDEX "PayoutAddress_one_active_per_route_key"
  ON "PayoutAddress"("userId", "payoutRouteId")
  WHERE "status" = 'ACTIVE' AND "active";

CREATE INDEX "Payout_payoutRouteId_status_idx" ON "Payout"("payoutRouteId", "status");

ALTER TABLE "StepUpAuthorization"
  ADD CONSTRAINT "StepUpAuthorization_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StepUpAuthorization_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetNetwork"
  ADD CONSTRAINT "AssetNetwork_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayoutRoute"
  ADD CONSTRAINT "PayoutRoute_assetNetworkId_fkey"
  FOREIGN KEY ("assetNetworkId") REFERENCES "AssetNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayoutRoute_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PayoutRoute_amounts_check"
  CHECK (
    "version" > 0
    AND "minimumPayoutAtomic" > 0
    AND ("maximumPayoutAtomic" IS NULL OR "maximumPayoutAtomic" >= "minimumPayoutAtomic")
    AND "fixedNetworkFeeAtomic" >= 0
    AND "addressCooldownSeconds" >= 0
    AND "requiredConfirmations" > 0
    AND ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom")
  );

ALTER TABLE "PayoutAddress"
  ADD CONSTRAINT "PayoutAddress_assetNetworkId_fkey"
  FOREIGN KEY ("assetNetworkId") REFERENCES "AssetNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayoutAddress_payoutRouteId_fkey"
  FOREIGN KEY ("payoutRouteId") REFERENCES "PayoutRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayoutAddress_status_check"
  CHECK (
    ("status" = 'ACTIVE' AND "active" AND "verified" AND "verifiedAt" IS NOT NULL AND "activatedAt" IS NOT NULL AND "disabledAt" IS NULL)
    OR ("status" = 'COOLDOWN' AND NOT "active" AND "verified" AND "verifiedAt" IS NOT NULL AND "activatedAt" IS NULL AND "disabledAt" IS NULL)
    OR ("status" = 'DISABLED' AND NOT "active" AND "disabledAt" IS NOT NULL)
  );

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_payoutRouteId_fkey"
  FOREIGN KEY ("payoutRouteId") REFERENCES "PayoutRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION miningplatform_step_up_authorization_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Step-up authorizations are immutable and cannot be deleted';
  END IF;
  IF OLD."userId" IS DISTINCT FROM NEW."userId"
    OR OLD."sessionId" IS DISTINCT FROM NEW."sessionId"
    OR OLD."scope" IS DISTINCT FROM NEW."scope"
    OR OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash"
    OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."consumedAt" IS NOT NULL
    OR NEW."consumedAt" IS NULL
  THEN
    RAISE EXCEPTION 'Step-up authorization identity is immutable and may be consumed exactly once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StepUpAuthorization_immutable_trigger"
BEFORE UPDATE OR DELETE ON "StepUpAuthorization"
FOR EACH ROW EXECUTE FUNCTION miningplatform_step_up_authorization_immutable();

CREATE OR REPLACE FUNCTION miningplatform_payout_route_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Payout routes are immutable; create a new version instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutRoute_immutable_trigger"
BEFORE UPDATE OR DELETE ON "PayoutRoute"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_route_immutable();

CREATE OR REPLACE FUNCTION miningplatform_payout_address_lifecycle()
RETURNS trigger AS $$
DECLARE
  route_asset_id TEXT;
  route_network_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payout addresses cannot be deleted; disable them instead';
  END IF;

  SELECT network."assetId", route."assetNetworkId"
    INTO route_asset_id, route_network_id
  FROM "PayoutRoute" route
  JOIN "AssetNetwork" network ON network."id" = route."assetNetworkId"
  WHERE route."id" = NEW."payoutRouteId";

  IF route_asset_id IS NULL
    OR route_asset_id <> NEW."assetId"
    OR route_network_id <> NEW."assetNetworkId"
  THEN
    RAISE EXCEPTION 'Payout address route, network, and asset must align';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."userId" IS DISTINCT FROM NEW."userId"
      OR OLD."assetId" IS DISTINCT FROM NEW."assetId"
      OR OLD."assetNetworkId" IS DISTINCT FROM NEW."assetNetworkId"
      OR OLD."payoutRouteId" IS DISTINCT FROM NEW."payoutRouteId"
      OR OLD."address" IS DISTINCT FROM NEW."address"
      OR OLD."addressHash" IS DISTINCT FROM NEW."addressHash"
      OR OLD."verified" IS DISTINCT FROM NEW."verified"
      OR OLD."verifiedAt" IS DISTINCT FROM NEW."verifiedAt"
      OR OLD."cooldownUntil" IS DISTINCT FROM NEW."cooldownUntil"
      OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    THEN
      RAISE EXCEPTION 'Payout address identity and verification evidence are immutable';
    END IF;

    IF NOT (
      OLD."status" = NEW."status"
      OR (OLD."status" = 'COOLDOWN' AND NEW."status" IN ('ACTIVE', 'DISABLED'))
      OR (OLD."status" = 'ACTIVE' AND NEW."status" = 'DISABLED')
    ) THEN
      RAISE EXCEPTION 'Invalid payout address lifecycle transition';
    END IF;

    IF OLD."status" = NEW."status" AND (
      OLD."active" IS DISTINCT FROM NEW."active"
      OR OLD."activatedAt" IS DISTINCT FROM NEW."activatedAt"
      OR OLD."disabledAt" IS DISTINCT FROM NEW."disabledAt"
    ) THEN
      RAISE EXCEPTION 'Payout address lifecycle evidence cannot change without a status transition';
    END IF;
  END IF;

  IF NEW."status" = 'ACTIVE' AND NEW."cooldownUntil" > CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Payout address cooldown has not elapsed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutAddress_lifecycle_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "PayoutAddress"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_address_lifecycle();

CREATE OR REPLACE FUNCTION miningplatform_payout_route_alignment()
RETURNS trigger AS $$
DECLARE
  address_record RECORD;
BEGIN
  SELECT address."userId", address."assetId", address."payoutRouteId",
         address."status", address."active", address."verified", route."status" AS "routeStatus"
    INTO address_record
  FROM "PayoutAddress" address
  JOIN "PayoutRoute" route ON route."id" = address."payoutRouteId"
  WHERE address."id" = NEW."payoutAddressId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout address does not exist';
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW."status" IN ('FAILED', 'CANCELLED')
    AND NEW."userId" = OLD."userId"
    AND NEW."assetId" = OLD."assetId"
    AND NEW."payoutAddressId" = OLD."payoutAddressId"
    AND NEW."payoutRouteId" = OLD."payoutRouteId"
  THEN
    RETURN NEW;
  END IF;
  IF address_record."userId" <> NEW."userId"
    OR address_record."assetId" <> NEW."assetId"
    OR address_record."payoutRouteId" <> NEW."payoutRouteId"
    OR address_record."status" <> 'ACTIVE'
    OR NOT address_record."active"
    OR NOT address_record."verified"
  THEN
    RAISE EXCEPTION 'Payout must use the user''s active verified address on the same route and asset';
  END IF;
  IF address_record."routeStatus" NOT IN ('PILOT', 'ACTIVE') THEN
    RAISE EXCEPTION 'Payout route is not enabled for controlled funds';
  END IF;
  IF address_record."routeStatus" = 'PILOT' THEN
    IF TG_OP = 'INSERT' AND NEW."status" <> 'REVIEW' THEN
      RAISE EXCEPTION 'Pilot payout must enter manual review';
    END IF;
    IF TG_OP = 'UPDATE'
      AND NEW."status" IS DISTINCT FROM OLD."status"
      AND NEW."status" NOT IN ('REVIEW', 'FAILED', 'CANCELLED')
    THEN
      RAISE EXCEPTION 'Pilot payout cannot leave manual review without an approval control';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payout_route_alignment_trigger"
BEFORE INSERT OR UPDATE OF "userId", "assetId", "payoutAddressId", "payoutRouteId", "status" ON "Payout"
FOR EACH ROW EXECUTE FUNCTION miningplatform_payout_route_alignment();
