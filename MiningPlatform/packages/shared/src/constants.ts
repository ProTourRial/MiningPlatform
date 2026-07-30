/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const PLATFORM_DEFAULTS = {
  asset: 'BTC',
  algorithm: 'SHA256',
  rewardMethod: 'FOLLOW_UPSTREAM',
  platformFeePercent: 2,
  payoutSchedule: '0 2 * * *',
  supportedHardwareTypes: ['CPU', 'GPU', 'FPGA', 'ASIC', 'HYBRID', 'OTHER'] as const,
} as const;
