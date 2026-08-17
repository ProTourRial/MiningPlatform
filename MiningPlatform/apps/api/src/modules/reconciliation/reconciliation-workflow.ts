/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type ReconciliationWorkflowStatus =
  | 'OPEN'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED';

export type ReconciliationWorkflowAction = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RESOLVED';

export class ReconciliationWorkflowError extends Error {}

const allowedFrom: Record<ReconciliationWorkflowAction, readonly ReconciliationWorkflowStatus[]> = {
  SUBMITTED: ['OPEN', 'REJECTED'],
  APPROVED: ['PENDING_APPROVAL'],
  REJECTED: ['PENDING_APPROVAL'],
  RESOLVED: ['APPROVED'],
};

export function nextReconciliationStatus(
  current: ReconciliationWorkflowStatus,
  action: ReconciliationWorkflowAction,
): ReconciliationWorkflowStatus {
  if (!allowedFrom[action].includes(current)) {
    throw new ReconciliationWorkflowError(`Cannot apply ${action} while exception is ${current}`);
  }
  if (action === 'SUBMITTED') return 'PENDING_APPROVAL';
  if (action === 'APPROVED') return 'APPROVED';
  if (action === 'REJECTED') return 'REJECTED';
  return 'RESOLVED';
}

export function assertMakerCheckerExecutor(input: {
  action: ReconciliationWorkflowAction;
  actorUserId: string;
  openedByUserId: string;
  submittedByUserId?: string | null;
  approvedByUserId?: string | null;
}): void {
  if (
    input.action === 'APPROVED' &&
    (input.actorUserId === input.openedByUserId || input.actorUserId === input.submittedByUserId)
  ) {
    throw new ReconciliationWorkflowError('The maker cannot approve this reconciliation exception');
  }
  if (input.action === 'RESOLVED' && input.actorUserId === input.approvedByUserId) {
    throw new ReconciliationWorkflowError(
      'The approver cannot execute the reconciliation resolution',
    );
  }
}
