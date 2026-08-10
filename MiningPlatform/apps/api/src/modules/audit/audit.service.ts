/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable } from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';

export type AuditCategory =
  | 'AUTH'
  | 'SECURITY'
  | 'ACCOUNT'
  | 'WORKER'
  | 'CREDENTIAL'
  | 'SYSTEM';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export interface AuditRecordInput {
  actorUserId?: string;
  category: AuditCategory;
  outcome?: AuditOutcome;
  action: string;
  resourceType: string;
  resourceId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
  metadata?: Prisma.InputJsonValue;
}

function buildMetadata(
  input: AuditRecordInput,
): Prisma.InputJsonObject {
  const audit: Prisma.InputJsonObject = {
    category: input.category,
    outcome: input.outcome ?? 'SUCCESS',
    ...(input.sessionId
      ? { sessionId: input.sessionId }
      : {}),
    ...(input.requestId
      ? { requestId: input.requestId }
      : {}),
  };

  if (input.metadata === undefined) {
    return {
      audit,
    };
  }

  return {
    audit,
    details: input.metadata,
  };
}

@Injectable()
export class AuditService {
  async record(input: AuditRecordInput) {
    return prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        metadata: buildMetadata(input),
      },
    });
  }

  async recordSafely(input: AuditRecordInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      console.error(
        'Audit write failed',
        error instanceof Error
          ? error.message
          : 'unknown error',
      );
    }
  }
}
