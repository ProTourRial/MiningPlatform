-- Financial Truth P0.3: auditable reconciliation exception workflow.

CREATE TYPE "ReconciliationExceptionStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RESOLVED');
CREATE TYPE "ReconciliationExceptionCategory" AS ENUM ('AMOUNT_VARIANCE', 'FEE_VARIANCE', 'MISSING_SETTLEMENT', 'DUPLICATE_SETTLEMENT', 'PROVIDER_REFERENCE', 'WRONG_ASSET', 'OTHER');
CREATE TYPE "ReconciliationExceptionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ReconciliationResolutionCode" AS ENUM ('PROVIDER_CORRECTED', 'INTERNAL_EXPECTATION_CORRECTED', 'ACCEPTED_VARIANCE', 'LEDGER_ADJUSTMENT');
CREATE TYPE "ReconciliationExceptionActionType" AS ENUM ('OPENED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESOLVED');

CREATE TABLE "ReconciliationException" (
  "id" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "status" "ReconciliationExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "category" "ReconciliationExceptionCategory" NOT NULL,
  "severity" "ReconciliationExceptionSeverity" NOT NULL,
  "summary" TEXT NOT NULL,
  "varianceAmount" DECIMAL(36,18) NOT NULL,
  "proposedResolution" TEXT NOT NULL,
  "resolutionCode" "ReconciliationResolutionCode",
  "resolutionNotes" TEXT,
  "resolutionJournalEntryId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "openedByUserId" TEXT NOT NULL,
  "submittedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationExceptionAction" (
  "id" TEXT NOT NULL,
  "exceptionId" TEXT NOT NULL,
  "action" "ReconciliationExceptionActionType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fromStatus" "ReconciliationExceptionStatus",
  "toStatus" "ReconciliationExceptionStatus" NOT NULL,
  "comment" TEXT,
  "correlationId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationExceptionAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReconciliationException_reconciliationId_key" ON "ReconciliationException"("reconciliationId");
CREATE UNIQUE INDEX "ReconciliationException_resolutionJournalEntryId_key" ON "ReconciliationException"("resolutionJournalEntryId");
CREATE INDEX "ReconciliationException_status_severity_createdAt_idx" ON "ReconciliationException"("status", "severity", "createdAt");
CREATE INDEX "ReconciliationException_reconciliationId_version_idx" ON "ReconciliationException"("reconciliationId", "version");
CREATE UNIQUE INDEX "ReconciliationExceptionAction_idempotencyKey_key" ON "ReconciliationExceptionAction"("idempotencyKey");
CREATE INDEX "ReconciliationExceptionAction_exceptionId_createdAt_idx" ON "ReconciliationExceptionAction"("exceptionId", "createdAt");
CREATE INDEX "ReconciliationExceptionAction_correlationId_idx" ON "ReconciliationExceptionAction"("correlationId");

ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "UpstreamReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_resolutionJournalEntryId_fkey" FOREIGN KEY ("resolutionJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationExceptionAction" ADD CONSTRAINT "ReconciliationExceptionAction_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "ReconciliationException"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationExceptionAction" ADD CONSTRAINT "ReconciliationExceptionAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException"
  ADD CONSTRAINT "ReconciliationException_version_positive" CHECK ("version" > 0),
  ADD CONSTRAINT "ReconciliationException_submission_state" CHECK (
    "status" = 'OPEN' OR ("submittedByUserId" IS NOT NULL AND "submittedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "ReconciliationException_approval_state" CHECK (
    "status" NOT IN ('APPROVED', 'RESOLVED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "ReconciliationException_resolution_state" CHECK (
    "status" <> 'RESOLVED' OR ("resolvedByUserId" IS NOT NULL AND "resolvedAt" IS NOT NULL AND "resolutionCode" IS NOT NULL AND "resolutionNotes" IS NOT NULL)
  ),
  ADD CONSTRAINT "ReconciliationException_maker_checker" CHECK (
    "approvedByUserId" IS NULL OR ("approvedByUserId" <> "openedByUserId" AND "approvedByUserId" IS DISTINCT FROM "submittedByUserId")
  ),
  ADD CONSTRAINT "ReconciliationException_checker_executor" CHECK (
    "resolvedByUserId" IS NULL OR "resolvedByUserId" IS DISTINCT FROM "approvedByUserId"
  ),
  ADD CONSTRAINT "ReconciliationException_resolution_journal_rule" CHECK (
    ("resolutionCode" = 'LEDGER_ADJUSTMENT' AND "resolutionJournalEntryId" IS NOT NULL)
    OR ("resolutionCode" IS DISTINCT FROM 'LEDGER_ADJUSTMENT' AND "resolutionJournalEntryId" IS NULL)
  );
