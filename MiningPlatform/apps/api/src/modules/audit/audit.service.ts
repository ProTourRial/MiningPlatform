/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable } from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';

export interface AuditRecordInput {
  actorUserId?: string;
  category:
    | 'AUTH'
    | 'SECURITY'
    | 'ACCOUNT'
    | 'WORKER'
    | 'CREDENTIAL'
    | 'SYSTEM';
  outcome?: 'SUCCESS' | 'FAILURE';
  action: string;
  resourceType: string;
  resourceId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  async record(input: AuditRecordInput) {
    return prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        category: input.category,
        outcome: input.outcome ?? 'SUCCESS',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        sessionId: input.sessionId,
        requestId: input.requestId,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        metadata: input.metadata,
      },
    });
  }

  async recordSafely(input: AuditRecordInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      console.error('Audit write failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
}
