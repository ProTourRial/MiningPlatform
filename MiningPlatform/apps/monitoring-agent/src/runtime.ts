/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { getBuildInfo } from '@mining/build-info';
import { detectMinerIdentity, type ComputeDeviceObservation, type HardwareType } from '@mining/miner-detection';
import { createLogger } from '@mining/logger';

const buildInfo = getBuildInfo('monitoring-agent');

const logger = createLogger('monitoring-agent');
logger.info({ build: buildInfo }, 'monitoring-agent build information');

interface AgentDeviceReport {
  workerId?: string;
  declaredType?: HardwareType;
  userAgent?: string;
  algorithm?: string;
  devices?: ComputeDeviceObservation[];
}

function loadDevelopmentReport(): AgentDeviceReport | undefined {
  const raw = process.env.MINER_AGENT_DEVICE_REPORT_JSON;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AgentDeviceReport;
  } catch (error) {
    logger.error({ error }, 'MINER_AGENT_DEVICE_REPORT_JSON is invalid JSON');
    return undefined;
  }
}

const report = loadDevelopmentReport();
const detection = detectMinerIdentity({
  userAgent: report?.userAgent,
  declaredType: report?.declaredType,
  algorithm: report?.algorithm,
  observations: report?.devices,
});

logger.info(
  {
    mode: 'outbound-only',
    access: 'no-wallet-no-ledger',
    workerId: report?.workerId,
    detection,
  },
  'universal monitoring agent scaffold started',
);

// Production adapters will report CPU, GPU, FPGA, ASIC, and hybrid rigs through
// outbound authenticated telemetry. No local shell command is executed by default.
