/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type ObservabilityMetricType = 'counter' | 'gauge' | 'histogram';
export type ObservabilityDomain = 'payout' | 'ledger' | 'randomx';
export type ObservabilityUnit = 'count' | 'atomic' | 'seconds' | 'ratio';

export interface AlertThreshold {
  readonly warning?: string;
  readonly critical?: string;
  readonly action: string;
}

export interface MetricDefinition {
  readonly name: string;
  readonly domain: ObservabilityDomain;
  readonly type: ObservabilityMetricType;
  readonly unit: ObservabilityUnit;
  readonly labels: readonly string[];
  readonly description: string;
  readonly alert: AlertThreshold;
  readonly public: false;
}

const commonLabels = ['asset', 'network'] as const;

export const OBSERVABILITY_METRICS: readonly MetricDefinition[] = Object.freeze([
  {
    name: 'miningplatform_payout_eligibility_failures_total',
    domain: 'payout',
    type: 'counter',
    unit: 'count',
    labels: [...commonLabels, 'reason'],
    description: 'Payout eligibility checks that fail by approved reason.',
    alert: {
      warning: '>1% of eligibility checks in 10m',
      critical: '>5% in 10m or financial/risk reason spike',
      action: 'Inspect route, policy, ledger, and risk gate.',
    },
    public: false,
  },
  {
    name: 'miningplatform_payout_reservation_conflicts_total',
    domain: 'payout',
    type: 'counter',
    unit: 'count',
    labels: [...commonLabels, 'reason'],
    description: 'Concurrent, duplicate, or insufficient payout reservation conflicts.',
    alert: {
      warning: '>10 in 10m',
      critical: '>50 in 10m or repeated account-scope conflicts',
      action: 'Pause affected reservation scope and inspect idempotency/concurrency.',
    },
    public: false,
  },
  {
    name: 'miningplatform_payout_broadcast_failures_total',
    domain: 'payout',
    type: 'counter',
    unit: 'count',
    labels: [...commonLabels, 'provider', 'reason'],
    description: 'Classified payout broadcast failures, including ambiguous submission.',
    alert: {
      warning: '>1% in 15m',
      critical: '>5% in 15m or any ambiguous broadcast',
      action: 'Pause broadcast, reconcile node/provider, and forbid blind retry.',
    },
    public: false,
  },
  {
    name: 'miningplatform_payout_queue_age_seconds',
    domain: 'payout',
    type: 'gauge',
    unit: 'seconds',
    labels: [...commonLabels, 'state'],
    description: 'Age of the oldest payout item by state.',
    alert: {
      warning: '>30m',
      critical: '>2h',
      action: 'Inspect approval, signer, provider, node, and payout gate.',
    },
    public: false,
  },
  {
    name: 'miningplatform_ledger_reconciliation_delta_atomic',
    domain: 'ledger',
    type: 'gauge',
    unit: 'atomic',
    labels: [...commonLabels, 'source'],
    description: 'Internal versus source reconciliation delta in atomic units.',
    alert: {
      warning: 'Any non-zero value for one evaluation',
      critical: 'Any unexplained non-zero value',
      action: 'Freeze affected financial scope and open reconciliation incident.',
    },
    public: false,
  },
  {
    name: 'miningplatform_ledger_unbalanced_total',
    domain: 'ledger',
    type: 'counter',
    unit: 'count',
    labels: [...commonLabels, 'reason'],
    description: 'Rejected or observed unbalanced journal attempts.',
    alert: {
      critical: 'Any non-zero value',
      action: 'Stop affected posting path and investigate journal invariant.',
    },
    public: false,
  },
  {
    name: 'miningplatform_ledger_trial_balance_atomic',
    domain: 'ledger',
    type: 'gauge',
    unit: 'atomic',
    labels: [...commonLabels],
    description: 'Trial balance delta; expected to remain zero for each asset/network.',
    alert: {
      critical: 'Any non-zero value',
      action: 'Freeze payout and reconcile immutable journals.',
    },
    public: false,
  },
  {
    name: 'miningplatform_reward_allocations_total',
    domain: 'ledger',
    type: 'counter',
    unit: 'count',
    labels: [...commonLabels, 'status'],
    description: 'Reward allocation attempts by terminal/result status.',
    alert: {
      warning: 'Allocation failure rate above approved baseline',
      action: 'Inspect source checksum, state transition, and idempotency.',
    },
    public: false,
  },
  {
    name: 'miningplatform_randomx_validation_latency_seconds',
    domain: 'randomx',
    type: 'histogram',
    unit: 'seconds',
    labels: ['result', 'region'],
    description: 'RandomX validation latency without worker/request high-cardinality labels.',
    alert: {
      warning: 'p95 >1s in 10m',
      critical: 'p95 >3s in 10m or validation error spike',
      action: 'Inspect validator capacity and gateway health; do not bypass validation.',
    },
    public: false,
  },
  {
    name: 'miningplatform_randomx_validation_errors_total',
    domain: 'randomx',
    type: 'counter',
    unit: 'count',
    labels: ['result', 'region'],
    description: 'RandomX validation failures by safe, allowlisted result class.',
    alert: {
      warning: '>2x approved baseline in 10m',
      critical: 'Security/error result spike or sustained validation failure',
      action: 'Inspect job freshness, verifier health, and security event correlation.',
    },
    public: false,
  },
  {
    name: 'miningplatform_template_age_seconds',
    domain: 'randomx',
    type: 'gauge',
    unit: 'seconds',
    labels: ['algorithm', 'region', 'source'],
    description: 'Age of the latest mining template/job.',
    alert: {
      warning: '>60s',
      critical: '>120s',
      action: 'Mark mining degraded and inspect template/upstream source.',
    },
    public: false,
  },
  {
    name: 'miningplatform_stratum_share_rejection_rate',
    domain: 'randomx',
    type: 'gauge',
    unit: 'ratio',
    labels: ['algorithm', 'region'],
    description: 'Rejected share ratio in a bounded measurement window.',
    alert: {
      warning: '>2x 30-day baseline in 10m',
      critical: '>5% and >2x baseline in 10m',
      action: 'Inspect difficulty, job freshness, provider, and gateway health.',
    },
    public: false,
  },
  {
    name: 'miningplatform_wallet_balance_variance_atomic',
    domain: 'payout',
    type: 'gauge',
    unit: 'atomic',
    labels: ['wallet_class', ...commonLabels],
    description: 'Wallet/node balance variance against expected internal liability.',
    alert: {
      warning: 'Any non-zero pending review',
      critical: 'Any unexplained non-zero value',
      action: 'Pause payout and reconcile wallet, node, and ledger.',
    },
    public: false,
  },
] as const);

const definitionsByName = new Map(OBSERVABILITY_METRICS.map((metric) => [metric.name, metric]));

export function getMetricDefinition(name: string): MetricDefinition | undefined {
  return definitionsByName.get(name);
}

export function validateMetricLabels(
  name: string,
  labels: Readonly<Record<string, string>>,
): { valid: true } | { valid: false; reason: string } {
  const definition = getMetricDefinition(name);
  if (!definition) return { valid: false, reason: 'unknown-metric' };

  const expected = new Set(definition.labels);
  const actual = Object.keys(labels);
  if (actual.some((label) => !expected.has(label))) {
    return { valid: false, reason: 'unknown-label' };
  }
  if (actual.length !== expected.size || [...expected].some((label) => !(label in labels))) {
    return { valid: false, reason: 'missing-label' };
  }
  if (actual.some((label) => !labels[label] || labels[label]!.length > 64)) {
    return { valid: false, reason: 'invalid-label-value' };
  }
  return { valid: true };
}

export function listMetricsByDomain(domain: ObservabilityDomain): readonly MetricDefinition[] {
  return OBSERVABILITY_METRICS.filter((metric) => metric.domain === domain);
}
