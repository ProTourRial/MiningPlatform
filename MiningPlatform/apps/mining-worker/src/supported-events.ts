/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { MiningEvents } from '@mining/shared';

export const SUPPORTED_MINING_EVENT_VERSION = 1;

export const supportedMiningProjectionEvents = new Set<string>([
  MiningEvents.sessionConnected,
  MiningEvents.sessionSubscribed,
  MiningEvents.sessionAuthorized,
  MiningEvents.sessionDisconnected,
  MiningEvents.workerDeviceDetected,
  MiningEvents.upstreamPoolSelected,
  MiningEvents.upstreamFailoverStarted,
  MiningEvents.upstreamFailoverCompleted,
  MiningEvents.upstreamFailoverFailed,
  MiningEvents.upstreamHealthChanged,
  MiningEvents.workerDifficultyChanged,
  MiningEvents.jobReceived,
  MiningEvents.shareLocalAccepted,
  MiningEvents.shareLocalRejected,
  MiningEvents.shareUpstreamPending,
  MiningEvents.shareUpstreamAccepted,
  MiningEvents.shareUpstreamRejected,
]);

export const supportedMiningEvents = new Set<string>([
  ...supportedMiningProjectionEvents,
  MiningEvents.randomXShareAccepted,
]);

export function assertSupportedMiningEvent(eventName: string, eventVersion: number): void {
  if (!supportedMiningProjectionEvents.has(eventName)) {
    throw new Error(`Unsupported mining event: ${eventName}`);
  }
  if (eventVersion !== SUPPORTED_MINING_EVENT_VERSION) {
    throw new Error(`Unsupported event version ${eventVersion} for ${eventName}`);
  }
}
