/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  bitcoinToAtomic,
  validateBitcoinAddress,
  type BitcoinJsonRpcClient,
} from '@mining/blockchain-adapters';
import {
  canonicalJson,
  digestSigningManifest,
  sha256Hex,
  validateSigningManifest,
  type SignerRequestV1,
  type SignerResponseV1,
} from '@mining/signer-protocol';

type SignerRpc = Pick<BitcoinJsonRpcClient, 'call'>;
type RpcFactory = (walletName: string) => SignerRpc;

type DecodedSignerPsbt = {
  fee?: number;
  tx: {
    vout: Array<{
      value: number;
      scriptPubKey: { address?: string; addresses?: string[] };
    }>;
  };
};

export class TransactionSignerService {
  constructor(
    private readonly keyAllowlist: ReadonlyMap<string, string>,
    private readonly rpcFactory: RpcFactory,
  ) {}

  async sign(request: SignerRequestV1, now = new Date()): Promise<SignerResponseV1> {
    validateSigningManifest(request.manifest, now);
    if (request.manifestDigest !== digestSigningManifest(request.manifest)) {
      throw new Error('Signing manifest digest does not match the manifest');
    }
    if (request.manifest.psbtDigest !== sha256Hex(request.psbt)) {
      throw new Error('PSBT digest does not match the signing manifest');
    }
    if (request.psbt.length === 0 || request.psbt.length > 500_000) {
      throw new Error('PSBT payload is invalid');
    }
    const walletName = this.keyAllowlist.get(request.manifest.keyReference);
    if (!walletName) throw new Error('Signer key reference is not allowlisted');
    if (!validateBitcoinAddress(request.manifest.destination, request.manifest.network).valid) {
      throw new Error('Signing manifest Bitcoin destination is invalid');
    }

    const rpc = this.rpcFactory(walletName);
    const decoded = await rpc.call<DecodedSignerPsbt>('decodepsbt', [request.psbt]);
    if (sha256Hex(canonicalJson(decoded.tx)) !== request.manifest.unsignedTransactionDigest) {
      throw new Error('Unsigned transaction digest does not match the decoded PSBT');
    }
    if (bitcoinToAtomic(decoded.fee ?? 0) !== BigInt(request.manifest.actualNetworkFeeAtomic)) {
      throw new Error('Decoded PSBT fee does not match the signing manifest');
    }

    let destinationOutputs = 0;
    for (const output of decoded.tx.vout) {
      const addresses = output.scriptPubKey.address
        ? [output.scriptPubKey.address]
        : output.scriptPubKey.addresses ?? [];
      if (addresses.includes(request.manifest.destination)) {
        destinationOutputs += 1;
        if (bitcoinToAtomic(output.value) !== BigInt(request.manifest.destinationAmountAtomic)) {
          throw new Error('Decoded PSBT destination amount does not match the manifest');
        }
        continue;
      }
      if (addresses.length !== 1)
        throw new Error('PSBT contains an unrecognized non-address output');
      const addressInfo = await rpc.call<{ ismine?: boolean }>('getaddressinfo', [addresses[0]]);
      if (!addressInfo.ismine)
        throw new Error('PSBT contains a non-destination output not owned by signer wallet');
    }
    if (destinationOutputs !== 1)
      throw new Error('PSBT must contain exactly one payout destination output');

    const signed = await rpc.call<{ psbt: string; complete: boolean }>('walletprocesspsbt', [
      request.psbt,
      true,
      'ALL',
      true,
    ]);
    if (!signed.psbt || signed.psbt.length > 500_000) {
      throw new Error('Bitcoin signer returned an invalid signed PSBT');
    }
    return {
      requestId: request.manifest.requestId,
      manifestDigest: request.manifestDigest,
      signedPsbt: signed.psbt,
      signedPsbtDigest: sha256Hex(signed.psbt),
      complete: signed.complete,
    };
  }
}
