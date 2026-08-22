/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { validateBitcoinAddress, type BitcoinNetwork } from './bitcoin-address.js';

export * from './bitcoin-address.js';

export type PayoutRequest = {
  idempotencyKey: string;
  address: string;
  amountAtomic: bigint;
};

export type BroadcastResult = {
  transactionId: string;
  networkFeeAtomic: bigint;
};

export interface BlockchainAdapter {
  readonly asset: string;
  validateAddress(address: string): Promise<boolean>;
  getConfirmedBalanceAtomic(): Promise<bigint>;
  broadcastBatch(requests: readonly PayoutRequest[]): Promise<BroadcastResult>;
  getConfirmations(transactionId: string): Promise<number>;
}

export class BitcoinRpcAdapter implements BlockchainAdapter {
  readonly asset = 'BTC';

  constructor(private readonly network: BitcoinNetwork = 'mainnet') {}

  async validateAddress(address: string): Promise<boolean> {
    return validateBitcoinAddress(address, this.network).valid;
  }

  async getConfirmedBalanceAtomic(): Promise<bigint> {
    throw new Error('Bitcoin RPC adapter is not implemented');
  }

  async broadcastBatch(_requests: readonly PayoutRequest[]): Promise<BroadcastResult> {
    throw new Error('Bitcoin RPC adapter is not implemented');
  }

  async getConfirmations(_transactionId: string): Promise<number> {
    throw new Error('Bitcoin RPC adapter is not implemented');
  }
}
