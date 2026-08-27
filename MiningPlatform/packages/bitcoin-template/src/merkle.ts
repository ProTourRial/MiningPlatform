/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { bytesToHex, concatBytes, hexToBytes, reverseBytes, sha256d } from '@mining/mining-core';

function txidToInternal(txid: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error('Template txid must be 32-byte hex');
  return reverseBytes(hexToBytes(txid.toLowerCase()));
}

export function buildNativeCoinbaseMerkleBranches(
  transactionIds: readonly string[],
): readonly string[] {
  const normalized = transactionIds.map((txid) => txid.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Template transaction ids must be unique');
  }
  if (normalized.length === 0) return [];

  let layer: Array<Uint8Array | null> = [null, ...normalized.map(txidToInternal)];
  const branches: string[] = [];
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer.at(-1) ?? null);
    const coinbaseSibling = layer[1];
    if (coinbaseSibling === null || coinbaseSibling === undefined) {
      throw new Error('Coinbase merkle branch is incomplete');
    }
    branches.push(bytesToHex(coinbaseSibling));

    const next: Array<Uint8Array | null> = [null];
    for (let index = 2; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1];
      if (left === null || left === undefined || right === null || right === undefined) {
        throw new Error('Template merkle layer is incomplete');
      }
      next.push(sha256d(concatBytes(left, right)));
    }
    layer = next;
  }
  return branches;
}
