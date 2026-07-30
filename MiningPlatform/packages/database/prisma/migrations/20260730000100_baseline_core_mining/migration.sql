-- MiningPlatform baseline schema generated from schema.prisma
-- Review before production deployment. Prisma remains the schema authority.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE "UserRole" AS ENUM ('USER', 'OWNER');
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'COMPANY');
CREATE TYPE "WorkerStatus" AS ENUM ('PENDING', 'ONLINE', 'DEGRADED', 'OFFLINE', 'DISABLED', 'UNKNOWN');
CREATE TYPE "MinerSessionStatus" AS ENUM ('CONNECTED', 'SUBSCRIBED', 'AUTHORIZED', 'ACTIVE', 'DEGRADED', 'DISCONNECTED');
CREATE TYPE "ShareStatus" AS ENUM ('RECEIVED', 'VALIDATING', 'LOCAL_ACCEPTED', 'LOCAL_REJECTED', 'UPSTREAM_PENDING', 'UPSTREAM_ACCEPTED', 'UPSTREAM_REJECTED', 'UPSTREAM_TIMEOUT');
CREATE TYPE "ShareRejectionCode" AS ENUM ('MALFORMED', 'UNAUTHORIZED', 'UNKNOWN_JOB', 'STALE', 'DUPLICATE', 'LOW_DIFFICULTY', 'INVALID_TIME', 'INVALID_VERSION', 'UPSTREAM_REJECTED');
CREATE TYPE "StratumJobStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REPLACED', 'CLOSED');
CREATE TYPE "UpstreamSessionStatus" AS ENUM ('CONNECTING', 'SUBSCRIBED', 'AUTHORIZED', 'ACTIVE', 'DEGRADED', 'DISCONNECTED');
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
CREATE TYPE "IdempotencyRecordStatus" AS ENUM ('ACQUIRED', 'COMPLETED', 'RELEASED', 'EXPIRED');
CREATE TYPE "RewardMethod" AS ENUM ('FOLLOW_UPSTREAM', 'PPS', 'FPPS', 'PPLNS', 'PROP', 'SOLO');
CREATE TYPE "RewardStatus" AS ENUM ('OPEN', 'CALCULATING', 'ALLOCATED', 'RECONCILED', 'CLOSED', 'FAILED');
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY', 'CLEARING');
CREATE TYPE "JournalEntryStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');
CREATE TYPE "PayoutStatus" AS ENUM ('QUEUED', 'REVIEW', 'APPROVED', 'SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "WalletType" AS ENUM ('HOT', 'COLD', 'FEE');
CREATE TYPE "WalletTransactionType" AS ENUM ('RECEIVE', 'SEND', 'FEE', 'INTERNAL_TRANSFER');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'FAILED', 'REPLACED');
CREATE TYPE "UpstreamStatus" AS ENUM ('SETUP', 'OPERATIONAL', 'DEGRADED', 'OFFLINE', 'DISABLED');
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'SECURITY', 'WORKER', 'REWARD', 'PAYOUT');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
  "emailVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_email_key" UNIQUE ("email")
);
CREATE TABLE "UserSecurity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "totpEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "totpSecretEncrypted" TEXT,
  "recoveryCodesHash" TEXT[] NOT NULL,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSecurity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserSecurity_userId_key" UNIQUE ("userId")
);
CREATE TABLE "CompanyProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "registrationId" TEXT,
  "countryCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyProfile_userId_key" UNIQUE ("userId")
);
CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "decimals" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "minimumPayout" DECIMAL(36,18) NOT NULL,
  "requiredConfirmations" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Asset_symbol_key" UNIQUE ("symbol")
);
CREATE TABLE "MiningAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "rewardMethod" "RewardMethod" NOT NULL DEFAULT 'FOLLOW_UPSTREAM',
  "platformFeePercent" DECIMAL(7,4) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MiningAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MiningAccount_username_key" UNIQUE ("username"),
  CONSTRAINT "MiningAccount_userId_assetId_key" UNIQUE ("userId", "assetId")
);
CREATE TABLE "Worker" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" "WorkerStatus" NOT NULL DEFAULT 'PENDING',
  "lastConnectedAt" TIMESTAMP(3),
  "lastShareAt" TIMESTAMP(3),
  "lastIpHash" TEXT,
  "agentEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Worker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Worker_miningAccountId_name_key" UNIQUE ("miningAccountId", "name")
);
CREATE TABLE "WorkerTelemetry" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "temperatureC" DECIMAL(8,3),
  "fanRpm" INTEGER,
  "powerWatts" DECIMAL(14,3),
  "efficiency" DECIMAL(18,8),
  "hardwareErrors" INTEGER,
  "firmwareVersion" TEXT,
  "raw" JSONB,
  CONSTRAINT "WorkerTelemetry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MinerSession" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "workerId" TEXT,
  "status" "MinerSessionStatus" NOT NULL DEFAULT 'CONNECTED',
  "remoteIpHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "extranonce1" TEXT,
  "extranonce2Size" INTEGER,
  "activeDifficulty" DECIMAL(38,12),
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subscribedAt" TIMESTAMP(3),
  "authorizedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnectReason" TEXT,
  CONSTRAINT "MinerSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MinerSession_eventId_key" UNIQUE ("eventId")
);
CREATE TABLE "DifficultyAssignment" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "difficulty" DECIMAL(38,12) NOT NULL,
  "source" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "DifficultyAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UpstreamSession" (
  "id" TEXT NOT NULL,
  "upstreamPoolId" TEXT NOT NULL,
  "status" "UpstreamSessionStatus" NOT NULL DEFAULT 'CONNECTING',
  "remoteSessionId" TEXT,
  "extranonce1" TEXT,
  "extranonce2Size" INTEGER,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorizedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failureCode" TEXT,
  CONSTRAINT "UpstreamSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StratumJob" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT,
  "upstreamSessionId" TEXT,
  "externalJobId" TEXT NOT NULL,
  "status" "StratumJobStatus" NOT NULL DEFAULT 'ACTIVE',
  "previousBlockHash" TEXT NOT NULL,
  "coinbase1" TEXT NOT NULL,
  "coinbase2" TEXT NOT NULL,
  "merkleBranches" JSONB NOT NULL,
  "version" TEXT NOT NULL,
  "networkBits" TEXT NOT NULL,
  "networkTime" TEXT NOT NULL,
  "cleanJobs" BOOLEAN NOT NULL DEFAULT FALSE,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StratumJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StratumJob_upstreamPoolId_externalJobId_receivedAt_key" UNIQUE ("upstreamPoolId", "externalJobId", "receivedAt")
);
CREATE TABLE "ShareFingerprint" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "stratumJobId" TEXT,
  "shareId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareFingerprint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShareFingerprint_fingerprint_key" UNIQUE ("fingerprint"),
  CONSTRAINT "ShareFingerprint_shareId_key" UNIQUE ("shareId")
);
CREATE TABLE "Share" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "stratumJobId" TEXT,
  "difficultyAssignmentId" TEXT,
  "status" "ShareStatus" NOT NULL DEFAULT 'RECEIVED',
  "rejectionCode" "ShareRejectionCode",
  "rejectionReason" TEXT,
  "assignedDifficulty" DECIMAL(38,12) NOT NULL,
  "achievedDifficulty" DECIMAL(38,12),
  "blockCandidate" BOOLEAN NOT NULL DEFAULT FALSE,
  "headerHash" TEXT,
  "extranonce2" TEXT NOT NULL,
  "networkTime" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "versionBits" TEXT,
  "upstreamAccepted" BOOLEAN,
  "upstreamReason" TEXT,
  "upstreamSubmittedAt" TIMESTAMP(3),
  "upstreamRespondedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "Share_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Share_eventId_key" UNIQUE ("eventId"),
  CONSTRAINT "Share_fingerprint_key" UNIQUE ("fingerprint")
);
CREATE TABLE "HashrateSnapshot" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "windowSeconds" INTEGER NOT NULL,
  "hashrate" DECIMAL(38,8) NOT NULL,
  "acceptedShares" INTEGER NOT NULL,
  "rejectedShares" INTEGER NOT NULL,
  "invalidShares" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HashrateSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RewardPeriod" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT,
  "method" "RewardMethod" NOT NULL,
  "status" "RewardStatus" NOT NULL DEFAULT 'OPEN',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossReward" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "upstreamFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "networkFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "platformFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "distributableReward" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardPeriod_assetId_periodStart_periodEnd_key" UNIQUE ("assetId", "periodStart", "periodEnd")
);
CREATE TABLE "RewardAllocation" (
  "id" TEXT NOT NULL,
  "rewardPeriodId" TEXT NOT NULL,
  "miningAccountId" TEXT NOT NULL,
  "contribution" DECIMAL(38,18) NOT NULL,
  "grossAmount" DECIMAL(36,18) NOT NULL,
  "platformFeeAmount" DECIMAL(36,18) NOT NULL,
  "netAmount" DECIMAL(36,18) NOT NULL,
  "journalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardAllocation_journalEntryId_key" UNIQUE ("journalEntryId"),
  CONSTRAINT "RewardAllocation_rewardPeriodId_miningAccountId_key" UNIQUE ("rewardPeriodId", "miningAccountId")
);
CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "LedgerAccountType" NOT NULL,
  "userId" TEXT,
  "assetId" TEXT NOT NULL,
  "systemAccount" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerAccount_code_key" UNIQUE ("code"),
  CONSTRAINT "LedgerAccount_userId_assetId_name_key" UNIQUE ("userId", "assetId", "name")
);
CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'PENDING',
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "postedAt" TIMESTAMP(3),
  "reversedEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalEntry_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "JournalEntry_reversedEntryId_key" UNIQUE ("reversedEntryId")
);
CREATE TABLE "JournalLine" (
  "id" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "ledgerAccountId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "debit" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "credit" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayoutAddress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "label" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutAddress_assetId_address_key" UNIQUE ("assetId", "address")
);
CREATE TABLE "Payout" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "payoutAddressId" TEXT NOT NULL,
  "journalEntryId" TEXT,
  "amount" DECIMAL(36,18) NOT NULL,
  "networkFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "status" "PayoutStatus" NOT NULL DEFAULT 'QUEUED',
  "transactionId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "broadcastAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payout_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "Payout_journalEntryId_key" UNIQUE ("journalEntryId")
);
CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" "WalletType" NOT NULL,
  "name" TEXT NOT NULL,
  "rpcWalletName" TEXT,
  "addressReference" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Wallet_assetId_type_name_key" UNIQUE ("assetId", "type", "name")
);
CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "outputIndex" INTEGER,
  "type" "WalletTransactionType" NOT NULL,
  "status" "WalletTransactionStatus" NOT NULL DEFAULT 'DETECTED',
  "amount" DECIMAL(36,18) NOT NULL,
  "networkFee" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "blockHeight" BIGINT,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "raw" JSONB,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletTransaction_assetId_transactionId_outputIndex_key" UNIQUE ("assetId", "transactionId", "outputIndex")
);
CREATE TABLE "UpstreamPool" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "port" INTEGER NOT NULL,
  "tls" BOOLEAN NOT NULL DEFAULT FALSE,
  "rewardMethod" "RewardMethod" NOT NULL,
  "status" "UpstreamStatus" NOT NULL DEFAULT 'SETUP',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "encryptedCredential" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UpstreamPool_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UpstreamPool_assetId_name_key" UNIQUE ("assetId", "name")
);
CREATE TABLE "UpstreamReconciliation" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "upstreamPoolId" TEXT NOT NULL,
  "rewardPeriodId" TEXT NOT NULL,
  "upstreamGrossReward" DECIMAL(36,18) NOT NULL,
  "upstreamFee" DECIMAL(36,18) NOT NULL,
  "receivedAmount" DECIMAL(36,18) NOT NULL,
  "internalExpectedAmount" DECIMAL(36,18) NOT NULL,
  "varianceAmount" DECIMAL(36,18) NOT NULL,
  "status" TEXT NOT NULL,
  "sourceReference" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UpstreamReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UpstreamReconciliation_rewardPeriodId_key" UNIQUE ("rewardPeriodId")
);
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SystemSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "secret" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SystemSetting_key_key" UNIQUE ("key")
);
CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "causationId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxEvent_eventId_key" UNIQUE ("eventId"),
  CONSTRAINT "OutboxEvent_idempotencyKey_key" UNIQUE ("idempotencyKey")
);
CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "IdempotencyRecordStatus" NOT NULL DEFAULT 'ACQUIRED',
  "resultReference" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdempotencyRecord_key_key" UNIQUE ("key")
);

ALTER TABLE "UserSecurity" ADD CONSTRAINT "UserSecurity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MiningAccount" ADD CONSTRAINT "MiningAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MiningAccount" ADD CONSTRAINT "MiningAccount_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_miningAccountId_fkey" FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerTelemetry" ADD CONSTRAINT "WorkerTelemetry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MinerSession" ADD CONSTRAINT "MinerSession_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DifficultyAssignment" ADD CONSTRAINT "DifficultyAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MinerSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DifficultyAssignment" ADD CONSTRAINT "DifficultyAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UpstreamSession" ADD CONSTRAINT "UpstreamSession_upstreamPoolId_fkey" FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StratumJob" ADD CONSTRAINT "StratumJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StratumJob" ADD CONSTRAINT "StratumJob_upstreamPoolId_fkey" FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StratumJob" ADD CONSTRAINT "StratumJob_upstreamSessionId_fkey" FOREIGN KEY ("upstreamSessionId") REFERENCES "UpstreamSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShareFingerprint" ADD CONSTRAINT "ShareFingerprint_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareFingerprint" ADD CONSTRAINT "ShareFingerprint_stratumJobId_fkey" FOREIGN KEY ("stratumJobId") REFERENCES "StratumJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareFingerprint" ADD CONSTRAINT "ShareFingerprint_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MinerSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_stratumJobId_fkey" FOREIGN KEY ("stratumJobId") REFERENCES "StratumJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_difficultyAssignmentId_fkey" FOREIGN KEY ("difficultyAssignmentId") REFERENCES "DifficultyAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HashrateSnapshot" ADD CONSTRAINT "HashrateSnapshot_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewardPeriod" ADD CONSTRAINT "RewardPeriod_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardPeriod" ADD CONSTRAINT "RewardPeriod_upstreamPoolId_fkey" FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation" ADD CONSTRAINT "RewardAllocation_rewardPeriodId_fkey" FOREIGN KEY ("rewardPeriodId") REFERENCES "RewardPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation" ADD CONSTRAINT "RewardAllocation_miningAccountId_fkey" FOREIGN KEY ("miningAccountId") REFERENCES "MiningAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation" ADD CONSTRAINT "RewardAllocation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "JournalEntry" ("id") ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutAddress" ADD CONSTRAINT "PayoutAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayoutAddress" ADD CONSTRAINT "PayoutAddress_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_payoutAddressId_fkey" FOREIGN KEY ("payoutAddressId") REFERENCES "PayoutAddress" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpstreamPool" ADD CONSTRAINT "UpstreamPool_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpstreamReconciliation" ADD CONSTRAINT "UpstreamReconciliation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpstreamReconciliation" ADD CONSTRAINT "UpstreamReconciliation_upstreamPoolId_fkey" FOREIGN KEY ("upstreamPoolId") REFERENCES "UpstreamPool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UpstreamReconciliation" ADD CONSTRAINT "UpstreamReconciliation_rewardPeriodId_fkey" FOREIGN KEY ("rewardPeriodId") REFERENCES "RewardPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_status_idx" ON "User" ("status");
CREATE INDEX "MiningAccount_assetId_enabled_idx" ON "MiningAccount" ("assetId", "enabled");
CREATE INDEX "Worker_userId_status_idx" ON "Worker" ("userId", "status");
CREATE INDEX "WorkerTelemetry_workerId_recordedAt_idx" ON "WorkerTelemetry" ("workerId", "recordedAt");
CREATE INDEX "MinerSession_workerId_status_idx" ON "MinerSession" ("workerId", "status");
CREATE INDEX "MinerSession_status_lastActivityAt_idx" ON "MinerSession" ("status", "lastActivityAt");
CREATE INDEX "DifficultyAssignment_sessionId_assignedAt_idx" ON "DifficultyAssignment" ("sessionId", "assignedAt");
CREATE INDEX "DifficultyAssignment_workerId_assignedAt_idx" ON "DifficultyAssignment" ("workerId", "assignedAt");
CREATE INDEX "UpstreamSession_upstreamPoolId_status_idx" ON "UpstreamSession" ("upstreamPoolId", "status");
CREATE INDEX "UpstreamSession_status_lastActivityAt_idx" ON "UpstreamSession" ("status", "lastActivityAt");
CREATE INDEX "StratumJob_assetId_status_expiresAt_idx" ON "StratumJob" ("assetId", "status", "expiresAt");
CREATE INDEX "StratumJob_upstreamSessionId_status_idx" ON "StratumJob" ("upstreamSessionId", "status");
CREATE INDEX "ShareFingerprint_expiresAt_idx" ON "ShareFingerprint" ("expiresAt");
CREATE INDEX "ShareFingerprint_workerId_createdAt_idx" ON "ShareFingerprint" ("workerId", "createdAt");
CREATE INDEX "Share_workerId_submittedAt_idx" ON "Share" ("workerId", "submittedAt");
CREATE INDEX "Share_sessionId_submittedAt_idx" ON "Share" ("sessionId", "submittedAt");
CREATE INDEX "Share_stratumJobId_status_idx" ON "Share" ("stratumJobId", "status");
CREATE INDEX "Share_assetId_status_submittedAt_idx" ON "Share" ("assetId", "status", "submittedAt");
CREATE INDEX "HashrateSnapshot_workerId_recordedAt_idx" ON "HashrateSnapshot" ("workerId", "recordedAt");
CREATE INDEX "RewardPeriod_status_periodEnd_idx" ON "RewardPeriod" ("status", "periodEnd");
CREATE INDEX "LedgerAccount_assetId_type_idx" ON "LedgerAccount" ("assetId", "type");
CREATE INDEX "JournalEntry_referenceType_referenceId_idx" ON "JournalEntry" ("referenceType", "referenceId");
CREATE INDEX "JournalEntry_status_effectiveAt_idx" ON "JournalEntry" ("status", "effectiveAt");
CREATE INDEX "JournalLine_ledgerAccountId_createdAt_idx" ON "JournalLine" ("ledgerAccountId", "createdAt");
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine" ("journalEntryId");
CREATE INDEX "PayoutAddress_userId_assetId_active_idx" ON "PayoutAddress" ("userId", "assetId", "active");
CREATE INDEX "Payout_status_scheduledAt_idx" ON "Payout" ("status", "scheduledAt");
CREATE INDEX "Payout_userId_createdAt_idx" ON "Payout" ("userId", "createdAt");
CREATE INDEX "WalletTransaction_status_detectedAt_idx" ON "WalletTransaction" ("status", "detectedAt");
CREATE INDEX "UpstreamPool_assetId_status_priority_idx" ON "UpstreamPool" ("assetId", "status", "priority");
CREATE INDEX "UpstreamReconciliation_status_createdAt_idx" ON "UpstreamReconciliation" ("status", "createdAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification" ("userId", "readAt", "createdAt");
CREATE INDEX "AuditLog_actorUserId_occurredAt_idx" ON "AuditLog" ("actorUserId", "occurredAt");
CREATE INDEX "AuditLog_resourceType_resourceId_occurredAt_idx" ON "AuditLog" ("resourceType", "resourceId", "occurredAt");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent" ("status", "availableAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx" ON "OutboxEvent" ("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "IdempotencyRecord_status_expiresAt_idx" ON "IdempotencyRecord" ("status", "expiresAt");
