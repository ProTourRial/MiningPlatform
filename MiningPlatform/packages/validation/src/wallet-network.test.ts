/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateBep20Address,
  validateWalletDestination,
} from './wallet-network.js';

const btcAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const bep20Address = '0x52908400098527886E0F7030069857D2E4169EE7';

test('accepts valid Bitcoin mainnet destination and keeps payout gated', () => {
  const result = validateWalletDestination({
    accountId: 'acct-001',
    asset: 'BTC',
    network: 'BTC',
    address: btcAddress,
  });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.normalizedAddress, btcAddress);
    assert.equal(result.checksumValidated, true);
    assert.equal(result.ownershipConfirmed, false);
    assert.equal(result.payoutCapable, false);
  }
});

test('rejects Bitcoin testnet address on mainnet route', () => {
  const result = validateWalletDestination({
    accountId: 'acct-002',
    asset: 'BTC',
    network: 'BTC',
    address: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'BTC_NETWORK_MISMATCH');
});

test('accepts a valid checksummed BEP20 destination', () => {
  const address = validateBep20Address(bep20Address);
  assert.equal(address.valid, true);
  if (address.valid) {
    assert.equal(address.normalizedAddress, bep20Address);
  }

  const result = validateWalletDestination({
    accountId: 'acct-003',
    asset: 'USDT',
    network: 'BEP20',
    address: bep20Address,
  });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.network, 'BEP20');
    assert.equal(result.asset, 'USDT');
    assert.equal(result.payoutCapable, false);
  }
});

test('rejects non-checksummed EVM address for a payout destination', () => {
  const result = validateWalletDestination({
    accountId: 'acct-004',
    asset: 'BTC',
    network: 'BEP20',
    address: bep20Address.toLowerCase(),
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'EVM_CHECKSUM_MISMATCH');
});

test('rejects a Bitcoin address on the BEP20 route', () => {
  const result = validateWalletDestination({
    accountId: 'acct-005',
    asset: 'BTC',
    network: 'BEP20',
    address: btcAddress,
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'INVALID_EVM_ADDRESS');
});

test('rejects non-BTC assets on the Bitcoin route', () => {
  const result = validateWalletDestination({
    accountId: 'acct-006',
    asset: 'USDT',
    network: 'BTC',
    address: btcAddress,
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'UNSUPPORTED_ASSET_NETWORK');
});

test('rejects malformed input before any network validation', () => {
  const result = validateWalletDestination({
    asset: 'BTC',
    network: 'BTC',
    address: btcAddress,
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'INVALID_INPUT');
});
