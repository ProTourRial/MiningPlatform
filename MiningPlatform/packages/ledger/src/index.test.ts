import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBalanced } from './index.js';

test('accepts balanced journal lines', () => {
  assert.doesNotThrow(() => assertBalanced([
    { accountCode: 'CLEARING', debit: 100n, credit: 0n },
    { accountCode: 'LIABILITY', debit: 0n, credit: 100n },
  ]));
});

test('rejects unbalanced journal lines', () => {
  assert.throws(() => assertBalanced([
    { accountCode: 'CLEARING', debit: 100n, credit: 0n },
    { accountCode: 'LIABILITY', debit: 0n, credit: 99n },
  ]));
});
