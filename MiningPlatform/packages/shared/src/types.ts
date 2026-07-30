/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type UserRole = 'GUEST' | 'USER' | 'OWNER';

export type HardwareType = 'CPU' | 'GPU' | 'FPGA' | 'ASIC' | 'HYBRID' | 'OTHER' | 'UNKNOWN';

export type HardwareDetectionSource =
  | 'USER_DECLARED'
  | 'STRATUM_USER_AGENT'
  | 'MONITORING_AGENT'
  | 'MINER_API'
  | 'COMBINED'
  | 'UNKNOWN';

export type HardwareDetectionConfidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED';

export interface WorkerDeviceProfileView {
  workerId: string;
  declaredType?: HardwareType;
  detectedType: HardwareType;
  possibleTypes: readonly HardwareType[];
  detectionSource: HardwareDetectionSource;
  confidence: HardwareDetectionConfidence;
  minerSoftware?: string;
  softwareVersion?: string;
  vendor?: string;
  model?: string;
  architecture?: string;
  operatingSystem?: string;
  deviceCount: number;
  algorithmCapabilities: readonly string[];
  lastDetectedAt: string;
}

export type WorkerState =
  | 'PENDING'
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'DISABLED'
  | 'UNKNOWN';

export type MinerSessionState =
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DISCONNECTED';

export type ShareState =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'LOCAL_ACCEPTED'
  | 'LOCAL_REJECTED'
  | 'UPSTREAM_PENDING'
  | 'UPSTREAM_ACCEPTED'
  | 'UPSTREAM_REJECTED'
  | 'UPSTREAM_TIMEOUT';

export type RewardMethod = 'FOLLOW_UPSTREAM' | 'PPS' | 'FPPS' | 'PPLNS' | 'PROP' | 'SOLO';

export interface PublicPoolStats {
  asset: string;
  algorithm: string;
  poolHashrate: string;
  activeWorkers: number;
  rewardToday: string;
  totalPaid: string;
  upstreamStatus: 'operational' | 'degraded' | 'offline' | 'setup';
  updatedAt: string;
}
