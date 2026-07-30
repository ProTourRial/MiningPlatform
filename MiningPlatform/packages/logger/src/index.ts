/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { pino } from 'pino';

export function createLogger(service: string) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['password', 'passwordHash', 'token', 'privateKey', 'seedPhrase', 'totpSecret'],
  });
}
