/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface VariableDifficultyOptions {
  targetShareIntervalSeconds: number;
  retargetIntervalSeconds: number;
  minimumDifficulty: number;
  maximumDifficulty: number;
  maximumAdjustmentFactor: number;
  minimumSamples: number;
}

export interface DifficultyRetarget {
  previousDifficulty: string;
  nextDifficulty: string;
  observedShareIntervalSeconds: number;
  sampleCount: number;
}

const DEFAULT_OPTIONS: VariableDifficultyOptions = {
  targetShareIntervalSeconds: 15,
  retargetIntervalSeconds: 90,
  minimumDifficulty: 1,
  maximumDifficulty: 1_000_000_000,
  maximumAdjustmentFactor: 4,
  minimumSamples: 4,
};

/**
 * Conservative VarDiff controller. The upstream floor prevents generation of
 * shares that would be below the active upstream pool target.
 */
export class VariableDifficultyController {
  private current: number;
  private upstreamFloor: number;
  private readonly acceptedAt: number[] = [];
  private lastRetargetAt?: number;

  constructor(initialDifficulty: string | number, private readonly options: VariableDifficultyOptions = DEFAULT_OPTIONS) {
    this.current = parseDifficulty(initialDifficulty);
    this.upstreamFloor = this.current;
    validateOptions(options);
  }

  get currentDifficulty(): string {
    return formatDifficulty(this.current);
  }

  setUpstreamFloor(value: string | number): string {
    this.upstreamFloor = parseDifficulty(value);
    if (this.current < this.upstreamFloor) this.current = this.upstreamFloor;
    return this.currentDifficulty;
  }

  recordAcceptedShare(at = Date.now()): DifficultyRetarget | undefined {
    if (this.lastRetargetAt === undefined) this.lastRetargetAt = at;
    this.acceptedAt.push(at);
    const retention = this.options.retargetIntervalSeconds * 4 * 1_000;
    while (this.acceptedAt.length > 0 && this.acceptedAt[0]! < at - retention) this.acceptedAt.shift();
    if (at - this.lastRetargetAt < this.options.retargetIntervalSeconds * 1_000) return undefined;
    if (this.acceptedAt.length < this.options.minimumSamples) return undefined;
    const sampleCount = this.acceptedAt.length;
    const first = this.acceptedAt[0]!;
    const last = this.acceptedAt[sampleCount - 1]!;
    const observed = Math.max(0.001, (last - first) / 1_000 / Math.max(1, sampleCount - 1));
    const rawFactor = this.options.targetShareIntervalSeconds / observed;
    const factor = clamp(
      rawFactor,
      1 / this.options.maximumAdjustmentFactor,
      this.options.maximumAdjustmentFactor,
    );
    const previous = this.current;
    const next = clamp(
      previous * factor,
      Math.max(this.options.minimumDifficulty, this.upstreamFloor),
      this.options.maximumDifficulty,
    );
    this.current = next;
    this.lastRetargetAt = at;
    this.acceptedAt.splice(0);
    if (Math.abs(next - previous) / previous < 0.05) return undefined;
    return {
      previousDifficulty: formatDifficulty(previous),
      nextDifficulty: formatDifficulty(next),
      observedShareIntervalSeconds: observed,
      sampleCount,
    };
  }
}

function parseDifficulty(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Difficulty must be positive, received ${value}`);
  return parsed;
}

function formatDifficulty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validateOptions(options: VariableDifficultyOptions): void {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`VarDiff ${name} must be positive`);
  }
  if (options.minimumDifficulty > options.maximumDifficulty) {
    throw new Error('VarDiff minimumDifficulty cannot exceed maximumDifficulty');
  }
  if (!Number.isInteger(options.minimumSamples) || options.minimumSamples < 2) {
    throw new Error('VarDiff minimumSamples must be an integer of at least 2');
  }
}
