/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  roles: readonly string[];
}

export interface RequestSecurityContext {
  ipHash?: string;
  userAgent?: string;
  userAgentHash?: string;
  countryCode?: string;
  city?: string;
  requestId?: string;
}
