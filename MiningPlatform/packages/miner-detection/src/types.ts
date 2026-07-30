/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const HARDWARE_TYPES = [
  'CPU',
  'GPU',
  'FPGA',
  'ASIC',
  'HYBRID',
  'OTHER',
  'UNKNOWN',
] as const;

export type HardwareType = (typeof HARDWARE_TYPES)[number];

export type HardwareDetectionSource =
  | 'USER_DECLARED'
  | 'STRATUM_USER_AGENT'
  | 'MONITORING_AGENT'
  | 'MINER_API'
  | 'COMBINED'
  | 'UNKNOWN';

export type HardwareDetectionConfidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED';

export interface ComputeDeviceObservation {
  hardwareType: HardwareType;
  vendor?: string;
  model?: string;
  architecture?: string;
  operatingSystem?: string;
  count?: number;
  algorithmCapabilities?: readonly string[];
  source: 'MONITORING_AGENT' | 'MINER_API';
}

export interface MinerDetectionInput {
  userAgent?: string;
  declaredType?: HardwareType;
  algorithm?: string;
  observations?: readonly ComputeDeviceObservation[];
}

export interface MinerDetectionResult {
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
  evidence: readonly string[];
}
