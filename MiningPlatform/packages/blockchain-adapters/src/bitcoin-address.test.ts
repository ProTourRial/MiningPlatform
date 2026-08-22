/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { BitcoinRpcAdapter, validateBitcoinAddress } from './index.js';

test('accepts checksum-valid Bitcoin mainnet Base58 addresses', () => {
  assert.deepEqual(validateBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), {
    valid: true,
    normalized: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    encoding: 'base58-p2pkh',
  });
  assert.equal(validateBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy').valid, true);
});

test('accepts BIP-350 v0 and v1 mainnet vectors with the required checksum encoding', () => {
  const v0 = validateBitcoinAddress('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4');
  assert.deepEqual(v0, {
    valid: true,
    normalized: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    encoding: 'bech32',
    witnessVersion: 0,
  });
  const v1 = validateBitcoinAddress(
    'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
  );
  assert.equal(v1.valid, true);
  if (v1.valid) {
    assert.equal(v1.encoding, 'bech32m');
    assert.equal(v1.witnessVersion, 1);
  }
});

test('rejects wrong-network, mixed-case, whitespace, and broken checksums', () => {
  assert.equal(
    validateBitcoinAddress('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7').valid,
    false,
  );
  assert.equal(
    validateBitcoinAddress(
      'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
      'testnet',
    ).valid,
    true,
  );
  assert.equal(validateBitcoinAddress('bc1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4').valid, false);
  assert.equal(validateBitcoinAddress(' 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').valid, false);
  assert.equal(validateBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb').valid, false);
  assert.equal(validateBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5').valid, false);
});

test('BitcoinRpcAdapter performs offline address validation without enabling funds operations', async () => {
  const adapter = new BitcoinRpcAdapter('mainnet');
  assert.equal(await adapter.validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), true);
  await assert.rejects(adapter.getConfirmedBalanceAtomic(), /not configured/);
  await assert.rejects(adapter.broadcastBatch([]), /isolated PSBT signer/);
});
