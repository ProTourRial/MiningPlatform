/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { UpstreamSessionState } from './types.js';

const transitions: Record<UpstreamSessionState, readonly UpstreamSessionState[]> = {
  DISCONNECTED: ['CONNECTING', 'RECONNECTING', 'STOPPED'],
  CONNECTING: ['SUBSCRIBING', 'RECONNECTING', 'DISCONNECTED', 'STOPPED'],
  SUBSCRIBING: ['SUBSCRIBED', 'RECONNECTING', 'DISCONNECTED', 'STOPPED'],
  SUBSCRIBED: ['AUTHORIZING', 'RECONNECTING', 'DISCONNECTED', 'STOPPED'],
  AUTHORIZING: ['ACTIVE', 'RECONNECTING', 'DISCONNECTED', 'STOPPED'],
  ACTIVE: ['RECONNECTING', 'DISCONNECTED', 'STOPPED'],
  RECONNECTING: ['CONNECTING', 'DISCONNECTED', 'STOPPED'],
  STOPPED: [],
};

export function transitionUpstreamState(
  current: UpstreamSessionState,
  next: UpstreamSessionState,
): UpstreamSessionState {
  if (!transitions[current].includes(next)) {
    throw new Error(`Illegal upstream session transition: ${current} -> ${next}`);
  }
  return next;
}
