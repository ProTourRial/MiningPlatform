/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type PayoutState =
  | 'REQUESTED'
  | 'ELIGIBLE'
  | 'RESERVED'
  | 'APPROVED'
  | 'SIGNING'
  | 'BROADCAST'
  | 'CONFIRMING'
  | 'COMPLETED'
  | 'FAILED';

export type RewardState = 'IMMATURE' | 'MATURE' | 'ALLOCATED' | 'RECONCILED';

export type BlockState = 'CANDIDATE' | 'SUBMITTED' | 'CONFIRMED' | 'ORPHANED' | 'REORGED';

export type FinancialDomain = 'PAYOUT' | 'REWARD' | 'BLOCK';

export type PayoutEvent =
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_ELIGIBLE'
  | 'PAYOUT_RESERVED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_SIGNING_STARTED'
  | 'PAYOUT_BROADCAST'
  | 'PAYOUT_CONFIRMING'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_FAILED';

export type RewardEvent =
  | 'REWARD_IMMATURE'
  | 'REWARD_MATURED'
  | 'REWARD_ALLOCATED'
  | 'REWARD_RECONCILED';

export type BlockEvent = 'BLOCK_SUBMITTED' | 'BLOCK_CONFIRMED' | 'BLOCK_ORPHANED' | 'BLOCK_REORGED';

export type FinancialEvent = PayoutEvent | RewardEvent | BlockEvent;

export type TransitionTable<TState extends string, TEvent extends string> = Readonly<
  Record<TState, Readonly<Partial<Record<TState, TEvent>>>>
>;

export interface TransitionInput<TState extends string, TEvent extends string> {
  readonly entityId: string;
  readonly from: TState;
  readonly to: TState;
  readonly event: TEvent;
  readonly idempotencyKey: string;
}

export interface TransitionResult<TState extends string, TEvent extends string> {
  readonly status: 'APPLIED' | 'IDEMPOTENT_REPLAY';
  readonly domain: FinancialDomain;
  readonly entityId: string;
  readonly from: TState;
  readonly to: TState;
  readonly event: TEvent;
  readonly idempotencyKey: string;
}

export type FinancialTransitionErrorCode =
  | 'INVALID_INPUT'
  | 'ILLEGAL_TRANSITION'
  | 'EVENT_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT';

export class FinancialTransitionError extends Error {
  constructor(
    readonly code: FinancialTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FinancialTransitionError';
  }
}

/**
 * In-memory transition guard for deterministic unit/fixture tests.
 * Production callers must persist the idempotency decision and transition event
 * atomically with their durable state; this class does not replace that boundary.
 */
export class FinancialStateMachine<TState extends string, TEvent extends string> {
  private readonly appliedByKey = new Map<string, TransitionResult<TState, TEvent>>();

  constructor(
    readonly domain: FinancialDomain,
    private readonly transitions: TransitionTable<TState, TEvent>,
  ) {}

  canTransition(from: TState, to: TState): boolean {
    return this.transitions[from]?.[to] !== undefined;
  }

  expectedEvent(from: TState, to: TState): TEvent | undefined {
    return this.transitions[from]?.[to];
  }

  transition(input: TransitionInput<TState, TEvent>): TransitionResult<TState, TEvent> {
    if (!input.entityId || !input.idempotencyKey) {
      throw new FinancialTransitionError(
        'INVALID_INPUT',
        'entityId and idempotencyKey are required',
      );
    }

    const existing = this.appliedByKey.get(input.idempotencyKey);
    if (existing) {
      const sameIntent =
        existing.entityId === input.entityId &&
        existing.from === input.from &&
        existing.to === input.to &&
        existing.event === input.event;
      if (!sameIntent) {
        throw new FinancialTransitionError(
          'IDEMPOTENCY_CONFLICT',
          `Idempotency key already used for a different transition: ${input.idempotencyKey}`,
        );
      }
      return { ...existing, status: 'IDEMPOTENT_REPLAY' };
    }

    const expectedEvent = this.expectedEvent(input.from, input.to);
    if (!expectedEvent) {
      throw new FinancialTransitionError(
        'ILLEGAL_TRANSITION',
        `Illegal ${this.domain} transition: ${input.from} -> ${input.to}`,
      );
    }
    if (expectedEvent !== input.event) {
      throw new FinancialTransitionError(
        'EVENT_MISMATCH',
        `Expected ${expectedEvent} for ${input.from} -> ${input.to}, received ${input.event}`,
      );
    }

    const result: TransitionResult<TState, TEvent> = {
      status: 'APPLIED',
      domain: this.domain,
      entityId: input.entityId,
      from: input.from,
      to: input.to,
      event: input.event,
      idempotencyKey: input.idempotencyKey,
    };
    this.appliedByKey.set(input.idempotencyKey, result);
    return result;
  }
}

export const payoutTransitions: TransitionTable<PayoutState, PayoutEvent> = {
  REQUESTED: { ELIGIBLE: 'PAYOUT_ELIGIBLE' },
  ELIGIBLE: { RESERVED: 'PAYOUT_RESERVED' },
  RESERVED: { APPROVED: 'PAYOUT_APPROVED' },
  APPROVED: { SIGNING: 'PAYOUT_SIGNING_STARTED' },
  SIGNING: { BROADCAST: 'PAYOUT_BROADCAST', FAILED: 'PAYOUT_FAILED' },
  BROADCAST: { CONFIRMING: 'PAYOUT_CONFIRMING', FAILED: 'PAYOUT_FAILED' },
  CONFIRMING: { COMPLETED: 'PAYOUT_COMPLETED', FAILED: 'PAYOUT_FAILED' },
  COMPLETED: {},
  FAILED: {},
};

export const rewardTransitions: TransitionTable<RewardState, RewardEvent> = {
  IMMATURE: { MATURE: 'REWARD_MATURED' },
  MATURE: { ALLOCATED: 'REWARD_ALLOCATED' },
  ALLOCATED: { RECONCILED: 'REWARD_RECONCILED' },
  RECONCILED: {},
};

export const blockTransitions: TransitionTable<BlockState, BlockEvent> = {
  CANDIDATE: { SUBMITTED: 'BLOCK_SUBMITTED' },
  SUBMITTED: { CONFIRMED: 'BLOCK_CONFIRMED' },
  CONFIRMED: {
    ORPHANED: 'BLOCK_ORPHANED',
    REORGED: 'BLOCK_REORGED',
  },
  ORPHANED: {},
  REORGED: {},
};

export const payoutStateMachine = new FinancialStateMachine('PAYOUT', payoutTransitions);

export const rewardStateMachine = new FinancialStateMachine('REWARD', rewardTransitions);

export const blockStateMachine = new FinancialStateMachine('BLOCK', blockTransitions);
