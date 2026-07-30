/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { DomainEvent } from '@mining/event-bus/core';

export interface MiningEventStore {
  append(event: DomainEvent): Promise<void>;
}
