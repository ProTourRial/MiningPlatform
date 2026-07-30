import type { ShareState } from './types.js';

const transitions: Readonly<Record<ShareState, readonly ShareState[]>> = {
  RECEIVED: ['VALIDATING'],
  VALIDATING: ['LOCAL_ACCEPTED', 'LOCAL_REJECTED'],
  LOCAL_ACCEPTED: ['UPSTREAM_PENDING'],
  LOCAL_REJECTED: [],
  UPSTREAM_PENDING: ['UPSTREAM_ACCEPTED', 'UPSTREAM_REJECTED', 'UPSTREAM_TIMEOUT'],
  UPSTREAM_ACCEPTED: [],
  UPSTREAM_REJECTED: [],
  UPSTREAM_TIMEOUT: ['UPSTREAM_PENDING'],
};

export function transitionShareState(from: ShareState, to: ShareState): ShareState {
  if (!transitions[from].includes(to)) throw new Error(`Illegal share transition: ${from} -> ${to}`);
  return to;
}

export function canTransitionShareState(from: ShareState, to: ShareState): boolean {
  return transitions[from].includes(to);
}
