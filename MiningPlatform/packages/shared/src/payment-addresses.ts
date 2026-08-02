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
