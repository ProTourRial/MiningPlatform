-- MiningPlatform
-- Author: Abia Nugrahanto
-- Durable, replay-safe Google OAuth identity linking. Provider tokens are never
-- persisted; one-time attempts retain only hashes and encrypted PKCE material.

BEGIN;

ALTER TYPE "StepUpScope" ADD VALUE IF NOT EXISTS 'EXTERNAL_IDENTITY_LINK';

COMMIT;

BEGIN;

CREATE TYPE "ExternalIdentityProvider" AS ENUM ('GOOGLE');
CREATE TYPE "OAuthAttemptPurpose" AS ENUM ('SIGN_IN', 'LINK');

CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ExternalIdentityProvider" NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalIdentity_provider_subject_check"
    CHECK (char_length("providerSubject") BETWEEN 1 AND 255),
  CONSTRAINT "ExternalIdentity_email_check"
    CHECK (char_length("email") BETWEEN 3 AND 320 AND "email" = lower("email"))
);

CREATE TABLE "OAuthAttempt" (
  "id" TEXT NOT NULL,
  "provider" "ExternalIdentityProvider" NOT NULL,
  "purpose" "OAuthAttemptPurpose" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "codeVerifierEncrypted" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "browserBindingHash" TEXT NOT NULL,
  "userId" TEXT,
  "redirectPath" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OAuthAttempt_state_hash_check" CHECK ("stateHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "OAuthAttempt_nonce_hash_check" CHECK ("nonceHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "OAuthAttempt_browser_binding_hash_check"
    CHECK ("browserBindingHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "OAuthAttempt_verifier_check" CHECK (char_length("codeVerifierEncrypted") >= 32),
  CONSTRAINT "OAuthAttempt_redirect_check"
    CHECK ("redirectPath" ~ '^/[A-Za-z0-9/_?=&.%+-]*$' AND "redirectPath" !~ '^//'),
  CONSTRAINT "OAuthAttempt_purpose_user_check"
    CHECK (("purpose" = 'LINK' AND "userId" IS NOT NULL) OR ("purpose" = 'SIGN_IN' AND "userId" IS NULL))
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_providerSubject_key"
  ON "ExternalIdentity"("provider", "providerSubject");
CREATE UNIQUE INDEX "ExternalIdentity_userId_provider_key"
  ON "ExternalIdentity"("userId", "provider");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

CREATE UNIQUE INDEX "OAuthAttempt_stateHash_key" ON "OAuthAttempt"("stateHash");
CREATE INDEX "OAuthAttempt_provider_purpose_consumedAt_expiresAt_idx"
  ON "OAuthAttempt"("provider", "purpose", "consumedAt", "expiresAt");
CREATE INDEX "OAuthAttempt_userId_consumedAt_expiresAt_idx"
  ON "OAuthAttempt"("userId", "consumedAt", "expiresAt");

ALTER TABLE "ExternalIdentity"
  ADD CONSTRAINT "ExternalIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthAttempt"
  ADD CONSTRAINT "OAuthAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
