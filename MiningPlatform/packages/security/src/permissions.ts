/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const Permissions = {
  profileRead: 'profile.read',
  profileWrite: 'profile.write',
  sessionsRead: 'sessions.read',
  sessionsRevoke: 'sessions.revoke',
  workersRead: 'workers.read',
  workersWrite: 'workers.write',
  workersDelete: 'workers.delete',
  credentialsRead: 'credentials.read',
  credentialsWrite: 'credentials.write',
  credentialsRevoke: 'credentials.revoke',
  auditRead: 'audit.read',
  systemRead: 'system.read',
  apiKeysRead: 'api-keys.read',
  apiKeysWrite: 'api-keys.write',
  apiKeysRevoke: 'api-keys.revoke',
  ownerAll: '*',
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.includes('*') || granted.includes(required);
}
