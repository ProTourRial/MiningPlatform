/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type TransitionMap<TState extends string> = Readonly<Record<TState, readonly TState[]>>;

export class FiniteStateMachine<TState extends string> {
  constructor(private readonly transitions: TransitionMap<TState>) {}

  canTransition(from: TState, to: TState): boolean {
    return this.transitions[from].includes(to);
  }

  transition(from: TState, to: TState): TState {
    if (!this.canTransition(from, to)) {
      throw new Error(`Illegal state transition: ${from} -> ${to}`);
    }
    return to;
  }
}

export * from './financial-state-machines.js';
