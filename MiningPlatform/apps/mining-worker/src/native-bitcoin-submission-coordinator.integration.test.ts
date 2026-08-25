/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import type { NativeBitcoinBlockCandidate } from '@mining/bitcoin-template';
import type {
  BitcoinBlockProposalResult,
  BitcoinBlockSubmissionResult,
} from '@mining/blockchain-adapters';
import { NativeBitcoinEvidenceRepository } from './native-bitcoin-evidence.js';
import {
  NativeBitcoinSubmissionCoordinator,
  NativeBitcoinSubmissionUncertainError,
} from './native-bitcoin-submission-coordinator.js';
import { NativeBitcoinSubmissionRecoveryCoordinator } from './native-bitcoin-submission-recovery.js';

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function candidate(at = new Date()): NativeBitcoinBlockCandidate {
  return {
    jobId: `native-303-${hex(12)}`,
    templateSourceDigest: hex(32),
    coinbasePolicyDigest: hex(32),
    blockHash: hex(32),
    headerHex: hex(80),
    coinbaseTxid: hex(32),
    coinbaseWtxid: hex(32),
    rawBlock: hex(81),
    rawBlockDigest: hex(32),
    reconstructedAt: at,
  };
}

function validProposal(
  blockCandidate: NativeBitcoinBlockCandidate,
  observedAt: Date,
): BitcoinBlockProposalResult {
  return {
    status: 'VALID',
    reason: null,
    rawBlockDigest: blockCandidate.rawBlockDigest,
    sourceDigest: hex(32),
    observedAt,
  };
}

test('coordinator records intent before RPC, replays outcomes, and exposes ambiguity', async () => {
  const repository = new NativeBitcoinEvidenceRepository(30_000);
  const acceptedCandidate = candidate();
  const acceptedProposal = validProposal(acceptedCandidate, new Date());
  let proposalCalls = 0;
  let submissionCalls = 0;
  const acceptedCoordinator = new NativeBitcoinSubmissionCoordinator(
    {
      async validateBlockProposal(): Promise<BitcoinBlockProposalResult> {
        proposalCalls += 1;
        return acceptedProposal;
      },
      async submitBlock(): Promise<BitcoinBlockSubmissionResult> {
        submissionCalls += 1;
        assert.equal(
          await prisma.nativeBitcoinSubmissionIntent.count({
            where: {
              candidate: { blockHash: acceptedCandidate.blockHash },
              submission: null,
            },
          }),
          1,
          'durable intent must exist before submitblock is called',
        );
        return {
          status: 'ACCEPTED',
          reason: null,
          rawBlockDigest: acceptedCandidate.rawBlockDigest,
          workId: 'work-accepted-303',
          sourceDigest: hex(32),
          observedAt: new Date(acceptedProposal.observedAt.getTime() + 1_000),
        };
      },
    },
    repository,
  );
  const acceptedInput = {
    operationId: `accepted:${randomUUID()}`,
    chain: 'regtest' as const,
    candidate: acceptedCandidate,
    workId: 'work-accepted-303',
  };
  const accepted = await acceptedCoordinator.execute(acceptedInput);
  assert.equal(accepted.status, 'SUBMISSION_RECORDED');
  assert.equal(accepted.replayed, false);
  assert.equal(proposalCalls, 1);
  assert.equal(submissionCalls, 1);

  const acceptedReplay = await acceptedCoordinator.execute(acceptedInput);
  assert.equal(acceptedReplay.status, 'SUBMISSION_RECORDED');
  assert.equal(acceptedReplay.replayed, true);
  assert.equal(proposalCalls, 1);
  assert.equal(submissionCalls, 1, 'a durable outcome must suppress a second submitblock call');

  const rejectedCandidate = candidate();
  let rejectedSubmitCalls = 0;
  const rejectedCoordinator = new NativeBitcoinSubmissionCoordinator(
    {
      async validateBlockProposal(): Promise<BitcoinBlockProposalResult> {
        return {
          status: 'REJECTED',
          reason: 'bad-cb-height',
          rawBlockDigest: rejectedCandidate.rawBlockDigest,
          sourceDigest: hex(32),
          observedAt: new Date(),
        };
      },
      async submitBlock(): Promise<BitcoinBlockSubmissionResult> {
        rejectedSubmitCalls += 1;
        throw new Error('submitblock must not be called for a rejected proposal');
      },
    },
    repository,
  );
  const rejected = await rejectedCoordinator.execute({
    operationId: `rejected:${randomUUID()}`,
    chain: 'regtest',
    candidate: rejectedCandidate,
  });
  assert.equal(rejected.status, 'PROPOSAL_REJECTED');
  assert.equal(rejectedSubmitCalls, 0);
  assert.equal(
    await prisma.nativeBitcoinSubmissionIntent.count({
      where: { candidate: { blockHash: rejectedCandidate.blockHash } },
    }),
    0,
  );

  const uncertainCandidate = candidate();
  const uncertainProposal = validProposal(uncertainCandidate, new Date());
  let uncertainSubmitCalls = 0;
  const uncertainCoordinator = new NativeBitcoinSubmissionCoordinator(
    {
      async validateBlockProposal(): Promise<BitcoinBlockProposalResult> {
        return uncertainProposal;
      },
      async submitBlock(): Promise<BitcoinBlockSubmissionResult> {
        uncertainSubmitCalls += 1;
        throw new Error('simulated transport loss after dispatch');
      },
    },
    repository,
  );
  const uncertainInput = {
    operationId: `uncertain:${randomUUID()}`,
    chain: 'regtest' as const,
    candidate: uncertainCandidate,
  };
  let uncertainIntentId = '';
  await assert.rejects(uncertainCoordinator.execute(uncertainInput), (error: unknown) => {
    assert.ok(error instanceof NativeBitcoinSubmissionUncertainError);
    uncertainIntentId = error.submissionIntentId;
    return true;
  });
  assert.equal(uncertainSubmitCalls, 1);
  assert.ok(
    (await repository.listUnresolvedSubmissionIntents({ limit: 1_000 })).some(
      (intent) => intent.id === uncertainIntentId,
    ),
  );

  await assert.rejects(uncertainCoordinator.execute(uncertainInput), (error: unknown) => {
    assert.ok(error instanceof NativeBitcoinSubmissionUncertainError);
    assert.equal(error.submissionIntentId, uncertainIntentId);
    return true;
  });
  assert.equal(
    uncertainSubmitCalls,
    1,
    'an unresolved durable intent must stop automatic submitblock replay',
  );

  let missingObservationCalls = 0;
  const missingObservation = {
    status: 'NOT_FOUND' as const,
    blockHash: uncertainCandidate.blockHash,
    confirmations: 0,
    blockHeight: null,
    transactionCount: null,
    chainTipHash: hex(32),
    chainHeight: 400,
    sourceDigest: hex(32),
    observedAt: new Date(),
  };
  const missingRecovery = new NativeBitcoinSubmissionRecoveryCoordinator(
    {
      async observeSubmittedBlock() {
        missingObservationCalls += 1;
        return missingObservation;
      },
    },
    repository,
  );
  const missing = await missingRecovery.observe(uncertainIntentId);
  assert.equal(missing.status, 'STILL_UNRESOLVED');
  assert.equal(missing.replayed, false);
  assert.equal(missingObservationCalls, 1);
  const missingReplay = await missingRecovery.observe(uncertainIntentId);
  assert.equal(missingReplay.status, 'STILL_UNRESOLVED');
  assert.equal(missingReplay.replayed, true);
  assert.equal(missingObservationCalls, 2, 'not-found recovery may be observed again read-only');
  assert.equal(
    await prisma.nativeBitcoinSubmissionRecoveryObservation.count({
      where: { submissionIntentId: uncertainIntentId, status: 'NOT_FOUND' },
    }),
    1,
    'the same node-tip observation must remain idempotent',
  );
  assert.ok(
    (await repository.listUnresolvedSubmissionIntents({ limit: 1_000 })).some(
      (intent) => intent.id === uncertainIntentId,
    ),
    'not-found is evidence but must not authorize an automatic resubmission',
  );

  let activeObservationCalls = 0;
  const activeRecovery = new NativeBitcoinSubmissionRecoveryCoordinator(
    {
      async observeSubmittedBlock() {
        activeObservationCalls += 1;
        return {
          status: 'ACTIVE_CHAIN' as const,
          blockHash: uncertainCandidate.blockHash,
          confirmations: 2,
          blockHeight: 399,
          transactionCount: 1,
          chainTipHash: hex(32),
          chainHeight: 400,
          sourceDigest: hex(32),
          observedAt: new Date(),
        };
      },
    },
    repository,
  );
  const observed = await activeRecovery.observe(uncertainIntentId);
  assert.equal(observed.status, 'BLOCK_OBSERVED');
  assert.equal(observed.chainStatus, 'ACTIVE_CHAIN');
  assert.equal(activeObservationCalls, 1);
  assert.equal(
    (await repository.listUnresolvedSubmissionIntents({ limit: 1_000 })).some(
      (intent) => intent.id === uncertainIntentId,
    ),
    false,
  );
  const observedReplay = await activeRecovery.observe(uncertainIntentId);
  assert.equal(observedReplay.status, 'BLOCK_OBSERVED');
  assert.equal(observedReplay.replayed, true);
  assert.equal(activeObservationCalls, 1, 'terminal chain evidence must suppress repeat RPC calls');
  assert.equal(
    await prisma.nativeBitcoinSubmissionAttempt.count({
      where: { submissionIntentId: uncertainIntentId },
    }),
    0,
    'read-only recovery must not synthesize a submitblock outcome',
  );

  await assert.rejects(
    prisma.nativeBitcoinSubmissionRecoveryObservation.create({
      data: {
        idempotencyKey: `native-recovery-invalid:${randomUUID()}`,
        submissionIntentId: uncertainIntentId,
        status: 'ACTIVE_CHAIN',
        blockHash: uncertainCandidate.blockHash,
        confirmations: 3,
        blockHeight: 399,
        transactionCount: 1,
        chainTipHash: hex(32),
        chainHeight: 400,
        sourceDigest: hex(32),
        observedAt: new Date(),
      },
    }),
    /values_check/,
    'database confirmation arithmetic must reject forged active-chain evidence',
  );

  let outcomeRecoveryCalls = 0;
  const outcomeRecovery = new NativeBitcoinSubmissionRecoveryCoordinator(
    {
      async observeSubmittedBlock() {
        outcomeRecoveryCalls += 1;
        throw new Error('chain observation must not run after a durable submitblock outcome');
      },
    },
    repository,
  );
  if (accepted.status !== 'SUBMISSION_RECORDED') {
    throw new Error('accepted fixture did not produce durable submission evidence');
  }
  const outcome = await outcomeRecovery.observe(accepted.submissionIntentId);
  assert.equal(outcome.status, 'SUBMISSION_OUTCOME_RECORDED');
  assert.equal(outcomeRecoveryCalls, 0);

  if (observed.status !== 'BLOCK_OBSERVED') {
    throw new Error('active recovery fixture did not persist terminal evidence');
  }
  await assert.rejects(
    prisma.nativeBitcoinSubmissionRecoveryObservation.delete({
      where: { id: observed.observationEvidenceId },
    }),
    /append-only/,
  );
});
