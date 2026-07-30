-- Universal miner detection for MiningPlatform.
-- Author: Abia Nugrahanto

CREATE TYPE "HardwareType" AS ENUM ('CPU', 'GPU', 'FPGA', 'ASIC', 'HYBRID', 'OTHER', 'UNKNOWN');
CREATE TYPE "HardwareDetectionSource" AS ENUM ('USER_DECLARED', 'STRATUM_USER_AGENT', 'MONITORING_AGENT', 'MINER_API', 'COMBINED', 'UNKNOWN');
CREATE TYPE "HardwareDetectionConfidence" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CONFIRMED');

CREATE TABLE "WorkerDeviceProfile" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "declaredType" "HardwareType",
  "detectedType" "HardwareType" NOT NULL DEFAULT 'UNKNOWN',
  "possibleTypes" "HardwareType"[] NOT NULL DEFAULT ARRAY[]::"HardwareType"[],
  "detectionSource" "HardwareDetectionSource" NOT NULL DEFAULT 'UNKNOWN',
  "detectionConfidence" "HardwareDetectionConfidence" NOT NULL DEFAULT 'UNKNOWN',
  "minerSoftware" TEXT,
  "softwareVersion" TEXT,
  "vendor" TEXT,
  "model" TEXT,
  "architecture" TEXT,
  "operatingSystem" TEXT,
  "deviceCount" INTEGER NOT NULL DEFAULT 1,
  "algorithmCapabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidence" JSONB,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerDeviceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerDeviceProfile_workerId_key" ON "WorkerDeviceProfile"("workerId");
CREATE INDEX "WorkerDeviceProfile_detectedType_detectionConfidence_idx" ON "WorkerDeviceProfile"("detectedType", "detectionConfidence");
CREATE INDEX "WorkerDeviceProfile_lastDetectedAt_idx" ON "WorkerDeviceProfile"("lastDetectedAt");

ALTER TABLE "WorkerDeviceProfile"
  ADD CONSTRAINT "WorkerDeviceProfile_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkerDeviceProfile"
  ADD CONSTRAINT "WorkerDeviceProfile_deviceCount_check" CHECK ("deviceCount" > 0);

CREATE TABLE "WorkerDeviceTelemetry" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "deviceKey" TEXT NOT NULL,
  "hardwareType" "HardwareType" NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "temperatureC" DECIMAL(8,3),
  "fanRpm" INTEGER,
  "powerWatts" DECIMAL(14,3),
  "utilizationPercent" DECIMAL(7,3),
  "memoryUtilizationPercent" DECIMAL(7,3),
  "memoryUsedBytes" BIGINT,
  "memoryTotalBytes" BIGINT,
  "coreClockMhz" INTEGER,
  "memoryClockMhz" INTEGER,
  "hashrate" DECIMAL(38,8),
  "efficiency" DECIMAL(18,8),
  "hardwareErrors" INTEGER,
  "raw" JSONB,
  CONSTRAINT "WorkerDeviceTelemetry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkerDeviceTelemetry_workerId_deviceKey_recordedAt_idx" ON "WorkerDeviceTelemetry"("workerId", "deviceKey", "recordedAt");
CREATE INDEX "WorkerDeviceTelemetry_profileId_recordedAt_idx" ON "WorkerDeviceTelemetry"("profileId", "recordedAt");
CREATE INDEX "WorkerDeviceTelemetry_hardwareType_recordedAt_idx" ON "WorkerDeviceTelemetry"("hardwareType", "recordedAt");
ALTER TABLE "WorkerDeviceTelemetry" ADD CONSTRAINT "WorkerDeviceTelemetry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerDeviceTelemetry" ADD CONSTRAINT "WorkerDeviceTelemetry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WorkerDeviceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkerDeviceTelemetry" ADD CONSTRAINT "WorkerDeviceTelemetry_utilization_check" CHECK ("utilizationPercent" IS NULL OR ("utilizationPercent" >= 0 AND "utilizationPercent" <= 100));
ALTER TABLE "WorkerDeviceTelemetry" ADD CONSTRAINT "WorkerDeviceTelemetry_memory_utilization_check" CHECK ("memoryUtilizationPercent" IS NULL OR ("memoryUtilizationPercent" >= 0 AND "memoryUtilizationPercent" <= 100));
