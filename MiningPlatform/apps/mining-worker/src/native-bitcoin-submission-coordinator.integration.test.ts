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
});
