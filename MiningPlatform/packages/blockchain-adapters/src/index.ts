/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { validateBitcoinAddress, type BitcoinNetwork } from './bitcoin-address.js';
import {
  BitcoinJsonRpcClient,
  BitcoinWatchOnlyRpcAdapter,
  type BitcoinRpcClientOptions,
} from './bitcoin-rpc.js';

export * from './bitcoin-address.js';
export * from './bitcoin-rpc.js';

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
  private readonly fundsAdapter: BitcoinWatchOnlyRpcAdapter | null;

  constructor(
    private readonly network: BitcoinNetwork = 'mainnet',
    rpcOptions?: BitcoinRpcClientOptions,
  ) {
    this.fundsAdapter = rpcOptions
      ? new BitcoinWatchOnlyRpcAdapter(network, new BitcoinJsonRpcClient(rpcOptions))
      : null;
  }

  async validateAddress(address: string): Promise<boolean> {
    return validateBitcoinAddress(address, this.network).valid;
  }

  async getConfirmedBalanceAtomic(): Promise<bigint> {
    if (!this.fundsAdapter) throw new Error('Bitcoin RPC funds adapter is not configured');
    return (await this.fundsAdapter.getWalletSnapshot()).confirmedBalanceAtomic;
  }

  async broadcastBatch(_requests: readonly PayoutRequest[]): Promise<BroadcastResult> {
    throw new Error('Direct batch signing is prohibited; use the isolated PSBT signer workflow');
  }

  async getConfirmations(_transactionId: string): Promise<number> {
    if (!this.fundsAdapter) throw new Error('Bitcoin RPC funds adapter is not configured');
    return (await this.fundsAdapter.getTransactionObservation(_transactionId)).confirmations;
  }
}
