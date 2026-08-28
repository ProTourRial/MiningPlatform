/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBitcoinBlockTemplate } from '@mining/blockchain-adapters';
import { calculateHeaderHash, type BitcoinShareSubmission } from '@mining/mining-core';
import {
  buildFullNativeCoinbase,
  buildNativeBitcoinJob,
  buildNativeCoinbaseMerkleBranches,
  buildStrippedNativeCoinbase,
  reconstructNativeBitcoinBlockCandidate,
} from './index.js';

const OBSERVED_AT = new Date('2026-08-24T01:00:00.000Z');
const REGTEST_TARGET = `7fffff${'00'.repeat(29)}`;
const WITNESS_COMMITMENT = `6a24aa21a9ed${'11'.repeat(32)}`;
const REGTEST_PAYOUT = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn';

function templateFixture(overrides: Record<string, unknown> = {}) {
  return {
    version: 0x20000000,
    rules: ['segwit'],
    vbavailable: {},
    vbrequired: 0,
    previousblockhash: '22'.repeat(32),
    transactions: [],
    coinbaseaux: { flags: '062f503253482f' },
    coinbasevalue: 5_000_000_000,
    capabilities: ['proposal'],
    longpollid: 'native-template-101',
    target: REGTEST_TARGET,
    mintime: 1_787_529_599,
    mutable: ['time', 'transactions', 'prevblock'],
    noncerange: '00000000ffffffff',
    sigoplimit: 80_000,
    sizelimit: 4_000_000,
    weightlimit: 4_000_000,
    curtime: 1_787_529_600,
    bits: '207fffff',
    height: 101,
    workid: 'work-101',
    default_witness_commitment: WITNESS_COMMITMENT,
    ...overrides,
  };
}

function nativeBundle() {
  const template = normalizeBitcoinBlockTemplate(templateFixture(), OBSERVED_AT);
  return buildNativeBitcoinJob({
    template,
    payoutAddress: REGTEST_PAYOUT,
    payoutNetwork: 'regtest',
    extranonce1: '01020304',
    extranonce2Size: 4,
    assignedDifficulty: '1',
  });
}

function solve(bundle: ReturnType<typeof nativeBundle>): BitcoinShareSubmission {
  for (let nonce = 0; nonce <= 0xffffffff; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName: 'native.worker',
      jobId: bundle.job.id,
      extranonce2: '00000001',
      networkTime: bundle.job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt: new Date(OBSERVED_AT),
    };
    if (calculateHeaderHash(bundle.job, submission).numericValue <= bundle.target) {
      return submission;
    }
  }
  throw new Error('Unable to solve the deterministic regtest fixture');
}

test('builds deterministic BIP34 coinbase halves with exact owner payout', () => {
  const bundle = nativeBundle();
  const stripped = buildStrippedNativeCoinbase(bundle.coinbase, '00000001');
  const full = buildFullNativeCoinbase(bundle.coinbase, '00000001');

  assert.match(bundle.job.id, /^native-101-[0-9a-f]{24}$/);
  assert.equal(stripped.toString('hex').startsWith('0200000001'), true);
  assert.equal(full.toString('hex').startsWith('02000000000101'), true);
  assert.equal(bundle.coinbase.coinbase1.slice(84, 88), '0165');
  assert.equal(bundle.coinbase.payoutAddress, REGTEST_PAYOUT);
  assert.match(bundle.coinbase.payoutScriptPubKey, /^76a914[0-9a-f]{40}88ac$/);
  assert.match(bundle.coinbase.policyDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(stripped.toString('hex'), full.toString('hex'));
});

test('builds coinbase merkle branches from display-order transaction ids', () => {
  const first = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(
    '',
  );
  const second = Array.from({ length: 32 }, (_, index) =>
    (index + 32).toString(16).padStart(2, '0'),
  ).join('');
  const branches = buildNativeCoinbaseMerkleBranches([first, second]);

  assert.equal(branches.length, 2);
  assert.equal(
    branches[0],
    Array.from({ length: 32 }, (_, index) => (31 - index).toString(16).padStart(2, '0')).join(''),
  );
  assert.match(branches[1] ?? '', /^[0-9a-f]{64}$/);
  assert.deepEqual(buildNativeCoinbaseMerkleBranches([]), []);
  assert.throws(() => buildNativeCoinbaseMerkleBranches([first, first]), /must be unique/);
});

test('reconstructs a network-target block candidate with full witness coinbase', () => {
  const bundle = nativeBundle();
  const submission = solve(bundle);
  const candidate = reconstructNativeBitcoinBlockCandidate(bundle, submission, OBSERVED_AT);
  const fullCoinbase = buildFullNativeCoinbase(bundle.coinbase, submission.extranonce2);

  assert.equal(candidate.headerHex.length, 160);
  assert.equal(candidate.rawBlock.slice(160, 162), '01');
  assert.equal(candidate.rawBlock.slice(162), fullCoinbase.toString('hex'));
  assert.notEqual(candidate.coinbaseTxid, candidate.coinbaseWtxid);
  assert.equal(candidate.blockHash, calculateHeaderHash(bundle.job, submission).displayHash);
  assert.match(candidate.rawBlockDigest, /^[0-9a-f]{64}$/);
});

test('applies required GBT version bits and binds full witness coinbase evidence', () => {
  const requiredTemplate = normalizeBitcoinBlockTemplate(
    templateFixture({ vbrequired: 1 }),
    OBSERVED_AT,
  );
  const bundle = buildNativeBitcoinJob({
    template: requiredTemplate,
    payoutAddress: REGTEST_PAYOUT,
    payoutNetwork: 'regtest',
    extranonce1: '01020304',
    extranonce2Size: 4,
    assignedDifficulty: '1',
  });
  assert.equal(bundle.job.version, '20000001');

  const submission = solve(bundle);
  const mutated = {
    ...bundle,
    coinbase: { ...bundle.coinbase, fullCoinbase2: `00${bundle.coinbase.fullCoinbase2}` },
  };
  assert.throws(
    () => reconstructNativeBitcoinBlockCandidate(mutated, submission, OBSERVED_AT),
    /job evidence digest/,
  );
});

test('fails closed for wrong-network payout and stale or mutated job evidence', () => {
  const template = normalizeBitcoinBlockTemplate(templateFixture(), OBSERVED_AT);
  assert.throws(
    () =>
      buildNativeBitcoinJob({
        template,
        payoutAddress: '1P6FZk2jiRuFkP8m4RuAVi9QVYWvhDCtrA',
        payoutNetwork: 'regtest',
        extranonce1: '01020304',
        extranonce2Size: 4,
        assignedDifficulty: '1',
      }),
    /Invalid regtest Bitcoin address/,
  );

  const bundle = nativeBundle();
  const submission = solve(bundle);
  assert.throws(
    () =>
      reconstructNativeBitcoinBlockCandidate(
        bundle,
        submission,
        new Date(bundle.job.expiresAt.getTime() + 1),
      ),
    /expired/,
  );
  const mutated = { ...bundle, transactionData: ['00'] };
  assert.throws(
    () => reconstructNativeBitcoinBlockCandidate(mutated, submission, OBSERVED_AT),
    /transaction evidence digest/,
  );

  const constrainedTemplate = normalizeBitcoinBlockTemplate(
    templateFixture({ sizelimit: 100 }),
    OBSERVED_AT,
  );
  const constrainedBundle = buildNativeBitcoinJob({
    template: constrainedTemplate,
    payoutAddress: REGTEST_PAYOUT,
    payoutNetwork: 'regtest',
    extranonce1: '01020304',
    extranonce2Size: 4,
    assignedDifficulty: '1',
  });
  assert.throws(
    () =>
      reconstructNativeBitcoinBlockCandidate(
        constrainedBundle,
        solve(constrainedBundle),
        OBSERVED_AT,
      ),
    /size limit/,
  );
});
