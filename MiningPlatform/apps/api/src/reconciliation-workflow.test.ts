/** MiningPlatform — Author: Abia Nugrahanto */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMakerCheckerExecutor,
  nextReconciliationStatus,
} from './modules/reconciliation/reconciliation-workflow.js';

test('reconciliation exception follows open, approval, and resolution states', () => {
  assert.equal(nextReconciliationStatus('OPEN', 'SUBMITTED'), 'PENDING_APPROVAL');
  assert.equal(nextReconciliationStatus('PENDING_APPROVAL', 'APPROVED'), 'APPROVED');
  assert.equal(nextReconciliationStatus('APPROVED', 'RESOLVED'), 'RESOLVED');
});

test('a rejected proposal can be revised and submitted again', () => {
  assert.equal(nextReconciliationStatus('PENDING_APPROVAL', 'REJECTED'), 'REJECTED');
  assert.equal(nextReconciliationStatus('REJECTED', 'SUBMITTED'), 'PENDING_APPROVAL');
});

test('terminal and out-of-order transitions are rejected', () => {
  assert.throws(() => nextReconciliationStatus('OPEN', 'APPROVED'), /Cannot apply APPROVED/);
  assert.throws(() => nextReconciliationStatus('RESOLVED', 'SUBMITTED'), /Cannot apply SUBMITTED/);
});

test('maker, checker, and executor duties remain separated', () => {
  assert.throws(
    () =>
      assertMakerCheckerExecutor({
        action: 'APPROVED',
        actorUserId: 'maker',
        openedByUserId: 'maker',
        submittedByUserId: 'maker',
      }),
    /maker cannot approve/,
  );
  assert.throws(
    () =>
      assertMakerCheckerExecutor({
        action: 'RESOLVED',
        actorUserId: 'checker',
        openedByUserId: 'maker',
        approvedByUserId: 'checker',
      }),
    /approver cannot execute/,
  );
  assert.doesNotThrow(() =>
    assertMakerCheckerExecutor({
      action: 'RESOLVED',
      actorUserId: 'executor',
      openedByUserId: 'maker',
      submittedByUserId: 'maker',
      approvedByUserId: 'checker',
    }),
  );
});
