/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { prisma } from '@mining/database';
import {
  CurrentPrincipal,
  Scopes,
  type AuthPrincipal,
} from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type {
  AuditCategory,
  AuditOutcome,
} from './audit.service.js';

const AUDIT_CATEGORIES = new Set<AuditCategory>([
  'AUTH',
  'SECURITY',
  'ACCOUNT',
  'WORKER',
  'CREDENTIAL',
  'SYSTEM',
]);

const AUDIT_OUTCOMES = new Set<AuditOutcome>([
  'SUCCESS',
  'FAILURE',
]);

function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function storedCategory(
  metadata: unknown,
): AuditCategory | undefined {
  const root = asRecord(metadata);
  const audit = asRecord(root?.audit);
  const value = audit?.category;

  return typeof value === 'string'
    && AUDIT_CATEGORIES.has(value as AuditCategory)
    ? value as AuditCategory
    : undefined;
}

function storedOutcome(
  metadata: unknown,
): AuditOutcome | undefined {
  const root = asRecord(metadata);
  const audit = asRecord(root?.audit);
  const value = audit?.outcome;

  return typeof value === 'string'
    && AUDIT_OUTCOMES.has(value as AuditOutcome)
    ? value as AuditOutcome
    : undefined;
}

function publicMetadata(metadata: unknown): unknown {
  const root = asRecord(metadata);

  if (
    root
    && 'audit' in root
    && 'details' in root
  ) {
    return root.details;
  }

  if (root && 'audit' in root) {
    return undefined;
  }

  return metadata;
}

function deriveCategory(
  action: string,
  resourceType: string,
): AuditCategory {
  const normalized = `${action} ${resourceType}`.toUpperCase();

  if (normalized.includes('CREDENTIAL')) {
    return 'CREDENTIAL';
  }

  if (normalized.includes('WORKER')) {
    return 'WORKER';
  }

  if (
    normalized.includes('TOTP')
    || normalized.includes('SECURITY')
    || normalized.includes('REUSE')
  ) {
    return 'SECURITY';
  }

  if (
    normalized.includes('LOGIN')
    || normalized.includes('LOGOUT')
    || normalized.includes('PASSWORD')
    || normalized.includes('EMAIL')
    || normalized.includes('TOKEN')
    || normalized.includes('SESSION')
    || normalized.includes('AUTH')
  ) {
    return 'AUTH';
  }

  if (
    normalized.includes('USER')
    || normalized.includes('PROFILE')
    || normalized.includes('ACCOUNT')
  ) {
    return 'ACCOUNT';
  }

  return 'SYSTEM';
}

function deriveOutcome(action: string): AuditOutcome {
  const normalized = action.toUpperCase();

  return [
    'FAILED',
    'FAILURE',
    'REJECTED',
    'DENIED',
    'ERROR',
    'REUSE',
  ].some((marker) => normalized.includes(marker))
    ? 'FAILURE'
    : 'SUCCESS';
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller({ path: 'audit', version: '1' })
@UseGuards(AuthGuard)
export class AuditController {
  @Get()
  @Scopes('audit:read')
  async list(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = Math.min(
      Math.max(Number(limitRaw ?? 50) || 50, 1),
      200,
    );

    const entries = await prisma.auditLog.findMany({
      where: {
        actorUserId: principal.userId,
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        metadata: true,
        occurredAt: true,
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      category:
        storedCategory(entry.metadata)
        ?? deriveCategory(
          entry.action,
          entry.resourceType,
        ),
      outcome:
        storedOutcome(entry.metadata)
        ?? deriveOutcome(entry.action),
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: publicMetadata(entry.metadata),
      occurredAt: entry.occurredAt,
    }));
  }
}
