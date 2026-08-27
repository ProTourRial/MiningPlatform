/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 *
 * Public receiving addresses only. Never place private keys, seed phrases,
 * signing credentials, or wallet RPC credentials in source control.
 */

export type SupportedPaymentAsset = 'USDT' | 'BTC' | 'ETH';

export interface PaymentReceiverAddress {
  asset: SupportedPaymentAsset;
  network: string;
  networkLabel: string;
  address: string;
  purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT';
}

export interface NativeMiningCoinbaseDestination {
  asset: 'BTC';
  network: 'mainnet';
  address: string;
  purpose: 'NATIVE_MINING_COINBASE_DEFAULT';
  enabledByDefault: false;
}

export const DEFAULT_PAYMENT_RECEIVER_ADDRESSES = Object.freeze<readonly PaymentReceiverAddress[]>([
  {
    asset: 'USDT',
    network: 'ERC20',
    networkLabel: 'Ethereum',
    address: '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'USDT',
    network: 'SOL',
    networkLabel: 'Solana',
    address: '7vjhb5NYBBXzd8eocm5Jg3KoqwTXrPs34ipFsyA8urX2',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'USDT',
    network: 'TRC20',
    networkLabel: 'Tron',
    address: 'THSeYj8TMxF14aQm5JFrvF3eP4q6f98rZg',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'BTC',
    network: 'BTC',
    networkLabel: 'Bitcoin',
    address: '1P6FZk2jiRuFkP8m4RuAVi9QVYWvhDCtrA',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'BTC',
    network: 'BEP20',
    networkLabel: 'BNB Smart Chain',
    address: '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'ETH',
    network: 'ARBITRUM_ONE',
    networkLabel: 'Arbitrum One',
    address: '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'ETH',
    network: 'BEP20',
    networkLabel: 'BNB Smart Chain',
    address: '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
  {
    asset: 'ETH',
    network: 'MORPH',
    networkLabel: 'Morph',
    address: '0xfc9284292aae1a49db0e8ff9f9075710559dc9cc',
    purpose: 'DONATION_AND_FUTURE_SITE_PAYMENT',
  },
]);

export const PAYMENT_RECEIVER_POLICY = Object.freeze({
  enabledByDefault: false,
  activationEnvironmentVariable: 'SUPPORT_PAYMENTS_ENABLED',
  userDepositsEnabled: false,
  automatedBalanceCreditEnabled: false,
  payoutsEnabled: false,
});

/**
 * Owner-confirmed mainnet destination for a future native Bitcoin coinbase output.
 * This public address is configuration evidence only: native mining remains disabled
 * until the regtest and production activation gates are complete.
 */
export const DEFAULT_NATIVE_MINING_COINBASE_DESTINATION =
  Object.freeze<NativeMiningCoinbaseDestination>({
    asset: 'BTC',
    network: 'mainnet',
    address: '1P6FZk2jiRuFkP8m4RuAVi9QVYWvhDCtrA',
    purpose: 'NATIVE_MINING_COINBASE_DEFAULT',
    enabledByDefault: false,
  });
