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
import { NativeBitcoinEvidenceRepository } from './native-bitcoin-evidence.js';

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function candidate(at: Date): NativeBitcoinBlockCandidate {
  return {
    jobId: `native-202-${hex(12)}`,
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

test('native Bitcoin evidence is idempotent, append-only, and proposal-gated', async () => {
  const repository = new NativeBitcoinEvidenceRepository(30_000);
  const observedAt = new Date();
  const blockCandidate = candidate(observedAt);
  const candidateKey = `native-candidate:${randomUUID()}`;
  const storedCandidate = await repository.recordCandidate({
    idempotencyKey: candidateKey,
    chain: 'regtest',
    candidate: blockCandidate,
  });
  assert.equal(
    (
      await repository.recordCandidate({
        idempotencyKey: candidateKey,
        chain: 'regtest',
        candidate: blockCandidate,
      })
    ).id,
    storedCandidate.id,
  );
  await assert.rejects(
    repository.recordCandidate({
      idempotencyKey: candidateKey,
      chain: 'regtest',
      candidate: { ...blockCandidate, blockHash: hex(32) },
    }),
    /idempotency conflict/,
  );

  const concurrentCandidate = candidate(new Date());
  const concurrentKey = `native-candidate:${randomUUID()}`;
  const concurrentResults = await Promise.all(
    Array.from({ length: 16 }, () =>
      repository.recordCandidate({
        idempotencyKey: concurrentKey,
        chain: 'regtest',
        candidate: concurrentCandidate,
      }),
    ),
  );
  assert.equal(new Set(concurrentResults.map((result) => result.id)).size, 1);
  assert.equal(
    await prisma.nativeBitcoinCandidate.count({ where: { idempotencyKey: concurrentKey } }),
    1,
  );

  const proposalKey = `native-proposal:${randomUUID()}`;
  const storedProposal = await repository.recordProposal({
    idempotencyKey: proposalKey,
    candidateId: storedCandidate.id,
    proposal: {
      status: 'VALID',
      reason: null,
      rawBlockDigest: blockCandidate.rawBlockDigest,
      sourceDigest: hex(32),
      observedAt,
    },
  });
  assert.equal(
    (
      await repository.recordProposal({
        idempotencyKey: proposalKey,
        candidateId: storedCandidate.id,
        proposal: {
          status: 'VALID',
          reason: null,
          rawBlockDigest: blockCandidate.rawBlockDigest,
          sourceDigest: storedProposal.sourceDigest,
          observedAt,
        },
      })
    ).id,
    storedProposal.id,
  );

  const submissionKey = `native-submission:${randomUUID()}`;
  const submission = {
    status: 'ACCEPTED' as const,
    reason: null,
    rawBlockDigest: blockCandidate.rawBlockDigest,
    workId: 'regtest-work-202',
    observedAt: new Date(observedAt.getTime() + 1_000),
    sourceDigest: hex(32),
  };
  const storedSubmission = await repository.recordSubmission({
    idempotencyKey: submissionKey,
    candidateId: storedCandidate.id,
    proposalEvidenceId: storedProposal.id,
    submission,
  });
  assert.equal(
    (
      await repository.recordSubmission({
        idempotencyKey: submissionKey,
        candidateId: storedCandidate.id,
        proposalEvidenceId: storedProposal.id,
        submission,
      })
    ).id,
    storedSubmission.id,
  );
  assert.equal(
    await prisma.nativeBitcoinSubmissionAttempt.count({
      where: { idempotencyKey: submissionKey },
    }),
    1,
  );

  await assert.rejects(
    prisma.nativeBitcoinCandidate.update({
      where: { id: storedCandidate.id },
      data: { jobId: `native-203-${hex(12)}` },
    }),
    /append-only/,
  );
  await assert.rejects(
    prisma.nativeBitcoinProposalEvidence.delete({ where: { id: storedProposal.id } }),
    /append-only/,
  );
  await assert.rejects(
    prisma.nativeBitcoinSubmissionAttempt.update({
      where: { id: storedSubmission.id },
      data: { reason: 'mutation' },
    }),
    /append-only/,
  );
  await assert.rejects(
    prisma.nativeBitcoinProposalEvidence.create({
      data: {
        idempotencyKey: `native-proposal:${randomUUID()}`,
        candidateId: storedCandidate.id,
        status: 'REJECTED',
        reason: 'digest mismatch fixture',
        rawBlockDigest: hex(32),
        sourceDigest: hex(32),
        observedAt,
        validUntil: new Date(observedAt.getTime() + 30_000),
      },
    }),
    /must match its candidate digest/,
  );
  await assert.rejects(
    prisma.nativeBitcoinSubmissionAttempt.create({
      data: {
        idempotencyKey: `native-submission:${randomUUID()}`,
        candidateId: storedCandidate.id,
        proposalEvidenceId: storedProposal.id,
        status: 'DUPLICATE',
        reason: 'duplicate',
        rawBlockDigest: blockCandidate.rawBlockDigest,
        workId: null,
        sourceDigest: hex(32),
        observedAt: new Date(storedProposal.validUntil.getTime() + 1),
      },
    }),
    /fresh matching valid proposal evidence/,
  );

  const rejectedCandidate = candidate(new Date());
  const storedRejectedCandidate = await repository.recordCandidate({
    idempotencyKey: `native-candidate:${randomUUID()}`,
    chain: 'regtest',
    candidate: rejectedCandidate,
  });
  const rejectedProposal = await repository.recordProposal({
    idempotencyKey: `native-proposal:${randomUUID()}`,
    candidateId: storedRejectedCandidate.id,
    proposal: {
      status: 'REJECTED',
      reason: 'bad-cb-height',
      rawBlockDigest: rejectedCandidate.rawBlockDigest,
      sourceDigest: hex(32),
      observedAt: rejectedCandidate.reconstructedAt,
    },
  });
  await assert.rejects(
    repository.recordSubmission({
      idempotencyKey: `native-submission:${randomUUID()}`,
      candidateId: storedRejectedCandidate.id,
      proposalEvidenceId: rejectedProposal.id,
      submission: {
        status: 'REJECTED',
        reason: 'bad-cb-height',
        rawBlockDigest: rejectedCandidate.rawBlockDigest,
        workId: null,
        observedAt: new Date(rejectedCandidate.reconstructedAt.getTime() + 1_000),
        sourceDigest: hex(32),
      },
    }),
    /fresh matching valid proposal/,
  );
});
