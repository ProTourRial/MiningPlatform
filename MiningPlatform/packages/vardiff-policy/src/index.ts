/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface VardiffPolicy {
  readonly targetShareIntervalSeconds: number;
  readonly retargetIntervalSeconds: number;
  readonly minimumDifficulty: number;
  readonly maximumDifficulty: number;
  readonly maximumAdjustmentFactor: number;
  readonly minimumSamples: number;
  readonly minimumAdjustmentRatio: number;
}

export const DEFAULT_VARDIFF_POLICY: VardiffPolicy = Object.freeze({
  targetShareIntervalSeconds: 15,
  retargetIntervalSeconds: 90,
  minimumDifficulty: 1,
  maximumDifficulty: 1_000_000_000,
  maximumAdjustmentFactor: 4,
  minimumSamples: 4,
  minimumAdjustmentRatio: 0.05,
});

export interface VardiffDecision {
  readonly action: 'NO_CHANGE' | 'RETARGET';
  readonly reason:
    | 'WAITING_FOR_INTERVAL'
    | 'WAITING_FOR_SAMPLES'
    | 'WITHIN_HYSTERESIS'
    | 'RETARGETED';
  readonly previousDifficulty: number;
  readonly nextDifficulty: number;
  readonly observedShareIntervalSeconds?: number;
  readonly sampleCount: number;
  readonly adjustmentFactor?: number;
}

export interface VardiffInput {
  readonly currentDifficulty: number;
  readonly upstreamFloor: number;
  readonly shareTimestampsSeconds: readonly number[];
  readonly lastRetargetAtSeconds: number;
  readonly nowSeconds: number;
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`);
  }
}

function validatePolicy(policy: VardiffPolicy): void {
  assertFinitePositive('targetShareIntervalSeconds', policy.targetShareIntervalSeconds);
  assertFinitePositive('retargetIntervalSeconds', policy.retargetIntervalSeconds);
  assertFinitePositive('minimumDifficulty', policy.minimumDifficulty);
  assertFinitePositive('maximumDifficulty', policy.maximumDifficulty);
  assertFinitePositive('maximumAdjustmentFactor', policy.maximumAdjustmentFactor);
  assertFinitePositive('minimumAdjustmentRatio', policy.minimumAdjustmentRatio);
  if (policy.minimumDifficulty > policy.maximumDifficulty) {
    throw new Error('minimumDifficulty cannot exceed maximumDifficulty');
  }
  if (policy.maximumAdjustmentFactor < 1) {
    throw new Error('maximumAdjustmentFactor must be at least 1');
  }
  if (!Number.isInteger(policy.minimumSamples) || policy.minimumSamples < 2) {
    throw new Error('minimumSamples must be an integer of at least 2');
  }
  if (policy.minimumAdjustmentRatio >= 1) {
    throw new Error('minimumAdjustmentRatio must be less than 1');
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Calculates a bounded VarDiff decision without mutating state or touching a
 * Stratum connection. Runtime integration remains a separate workstream.
 */
export function calculateVardiffDecision(
  input: VardiffInput,
  policy: VardiffPolicy = DEFAULT_VARDIFF_POLICY,
): VardiffDecision {
  validatePolicy(policy);
  assertFinitePositive('currentDifficulty', input.currentDifficulty);
  assertFinitePositive('upstreamFloor', input.upstreamFloor);
  assertFiniteNonNegative('lastRetargetAtSeconds', input.lastRetargetAtSeconds);
  assertFiniteNonNegative('nowSeconds', input.nowSeconds);
  if (input.nowSeconds < input.lastRetargetAtSeconds) {
    throw new Error('nowSeconds cannot be before lastRetargetAtSeconds');
  }
  if (input.shareTimestampsSeconds.some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('share timestamps must be finite');
  }

  const previousDifficulty = clamp(
    input.currentDifficulty,
    Math.max(policy.minimumDifficulty, input.upstreamFloor),
    policy.maximumDifficulty,
  );
  const sampleCount = input.shareTimestampsSeconds.length;
  const noChange = (
    reason: VardiffDecision['reason'],
    observedShareIntervalSeconds?: number,
  ): VardiffDecision => ({
    action: 'NO_CHANGE',
    reason,
    previousDifficulty,
    nextDifficulty: previousDifficulty,
    observedShareIntervalSeconds,
    sampleCount,
  });

  if (
    input.nowSeconds - input.lastRetargetAtSeconds < policy.retargetIntervalSeconds
  ) {
    return noChange('WAITING_FOR_INTERVAL');
  }
  if (sampleCount < policy.minimumSamples) {
    return noChange('WAITING_FOR_SAMPLES');
  }

  const first = input.shareTimestampsSeconds[0]!;
  const last = input.shareTimestampsSeconds[sampleCount - 1]!;
  const observedShareIntervalSeconds = Math.max(
    0.001,
    (last - first) / Math.max(1, sampleCount - 1),
  );
  const rawFactor = policy.targetShareIntervalSeconds / observedShareIntervalSeconds;
  const adjustmentFactor = clamp(
    rawFactor,
    1 / policy.maximumAdjustmentFactor,
    policy.maximumAdjustmentFactor,
  );
  const nextDifficulty = clamp(
    previousDifficulty * adjustmentFactor,
    Math.max(policy.minimumDifficulty, input.upstreamFloor),
    policy.maximumDifficulty,
  );
  const adjustmentRatio = Math.abs(nextDifficulty - previousDifficulty) / previousDifficulty;
  if (adjustmentRatio < policy.minimumAdjustmentRatio) {
    return noChange('WITHIN_HYSTERESIS', observedShareIntervalSeconds);
  }

  return {
    action: 'RETARGET',
    reason: 'RETARGETED',
    previousDifficulty,
    nextDifficulty,
    observedShareIntervalSeconds,
    sampleCount,
    adjustmentFactor,
  };
}
