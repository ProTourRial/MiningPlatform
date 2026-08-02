/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ForbiddenException, Injectable } from '@nestjs/common';
import { prisma } from '@mining/database';
import { hasPermission, Permissions } from '@mining/security';

interface AuthorizationAssignmentRecord {
  role: {
    key: string;
    permissions: Array<{ permission: { key: string } }>;
  };
}

const USER_PERMISSIONS = [
  Permissions.profileRead,
  Permissions.profileWrite,
  Permissions.sessionsRead,
  Permissions.sessionsRevoke,
  Permissions.workersRead,
  Permissions.workersWrite,
  Permissions.workersDelete,
  Permissions.credentialsRead,
  Permissions.credentialsWrite,
  Permissions.credentialsRevoke,
  Permissions.auditRead,
  Permissions.systemRead,
  Permissions.apiKeysRead,
  Permissions.apiKeysWrite,
  Permissions.apiKeysRevoke,
] as const;

const PERMISSION_METADATA: Record<string, { resource: string; action: string; description: string }> = {
  'profile.read': { resource: 'profile', action: 'read', description: 'Read own profile.' },
  'profile.write': { resource: 'profile', action: 'write', description: 'Update own profile.' },
  'sessions.read': { resource: 'sessions', action: 'read', description: 'Read own sessions.' },
  'sessions.revoke': { resource: 'sessions', action: 'revoke', description: 'Revoke own sessions.' },
  'workers.read': { resource: 'workers', action: 'read', description: 'Read owned workers.' },
  'workers.write': { resource: 'workers', action: 'write', description: 'Create and update owned workers.' },
  'workers.delete': { resource: 'workers', action: 'delete', description: 'Soft-delete owned workers.' },
  'credentials.read': { resource: 'credentials', action: 'read', description: 'Read owned credentials.' },
  'credentials.write': { resource: 'credentials', action: 'write', description: 'Create and rotate credentials.' },
  'credentials.revoke': { resource: 'credentials', action: 'revoke', description: 'Revoke owned credentials.' },
  'audit.read': { resource: 'audit', action: 'read', description: 'Read own audit trail.' },
  'system.read': { resource: 'system', action: 'read', description: 'Read dashboard system summary.' },
  'api-keys.read': { resource: 'api-keys', action: 'read', description: 'Read own API keys.' },
  'api-keys.write': { resource: 'api-keys', action: 'write', description: 'Create own API keys.' },
  'api-keys.revoke': { resource: 'api-keys', action: 'revoke', description: 'Revoke own API keys.' },
  '*': { resource: '*', action: '*', description: 'All owner permissions.' },
};

@Injectable()
export class AuthorizationService {
  async ensureSystemDefinitions(): Promise<void> {
    const userRole = await prisma.role.upsert({
      where: { key: 'USER' },
      create: { id: 'role_user', key: 'USER', name: 'User', description: 'Standard mining platform user.' },
      update: { name: 'User', description: 'Standard mining platform user.' },
    });
    const ownerRole = await prisma.role.upsert({
      where: { key: 'OWNER' },
      create: { id: 'role_owner', key: 'OWNER', name: 'Owner', description: 'Privileged platform owner role.' },
      update: { name: 'Owner', description: 'Privileged platform owner role.' },
    });

    const permissions = await Promise.all(
      Object.entries(PERMISSION_METADATA).map(([key, value]) =>
        prisma.permission.upsert({
          where: { key },
          create: { key, ...value },
          update: value,
        }),
      ),
    );
    const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
    await prisma.rolePermission.createMany({
      data: USER_PERMISSIONS.map((key) => ({ roleId: userRole.id, permissionId: byKey.get(key)! })),
      skipDuplicates: true,
    });
    await prisma.rolePermission.createMany({
      data: [{ roleId: ownerRole.id, permissionId: byKey.get('*')! }],
      skipDuplicates: true,
    });
  }

  async assignDefaultRole(userId: string): Promise<void> {
    await this.ensureSystemDefinitions();
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'USER' } });
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
  }

  async getAuthorization(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const typedAssignments = assignments as AuthorizationAssignmentRecord[];
    const roles = typedAssignments.map((assignment) => assignment.role.key);
    const permissions = [...new Set(typedAssignments.flatMap((assignment) => assignment.role.permissions.map((entry) => entry.permission.key)))];
    return { roles, permissions };
  }

  async assertPermission(userId: string, required: string): Promise<void> {
    const { permissions } = await this.getAuthorization(userId);
    if (!hasPermission(permissions, required)) throw new ForbiddenException(`Permission required: ${required}`);
  }
}
