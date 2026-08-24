# ADR-0016: Bitcoin Core Native Template and Trusted Job Boundary

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owner:** Abia Nugrahanto

## Context

MiningPlatform can validate Bitcoin Stratum V1 shares relayed from an upstream pool, but an upstream
job does not contain sufficient trusted evidence to reconstruct and submit a native block. A native
pool must obtain the full transaction set and consensus limits from an authoritative Bitcoin Core
node, build its own coinbase, retain the full template privately, and send miners only the minimal
Stratum job fields.

The existing Bitcoin JSON-RPC transport was designed for wallet responses and enforced a fixed 2 MiB
response ceiling. A realistic `getblocktemplate` response can contain the byte-for-byte transaction
set, so native mining needs a separately configured bounded response limit without weakening wallet
defaults.

## Decision

1. Native mining uses a dedicated `BitcoinNativeMiningRpcAdapter`; wallet preparation and signing
   remain separate boundaries.
2. Before requesting work, the adapter verifies the exact expected chain, rejects initial block
   download, requires header/block parity, requires an active network, enforces a minimum Bitcoin Core
   version, and fails closed on node warnings.
3. Every template request explicitly declares `segwit` support and the `longpoll`, `coinbasevalue`,
   `proposal`, and `workid` capabilities.
4. The response normalizer strictly validates hashes, raw transaction hex, backward-only dependency
   indexes, fee/sigop/weight fields, coinbase value, block limits, version bits, nonce range, template
   time, compact `bits` against the full target, and the default witness commitment shape.
5. A canonical SHA-256 digest binds the exact validated response. Observation and expiry timestamps
   are retained separately so a stale template cannot silently become current.
6. The full transaction bytes stay in a trusted template store. Miner-facing events and Stratum
   notifications receive only coinbase fragments, merkle branches, header fields, and job identity.
7. Wallet RPC keeps the 2 MiB default response limit. A mining-node client may explicitly raise the
   bound, with a hard maximum of 32 MiB; the initial laboratory uses 16 MiB.
8. Coinbase construction and candidate reconstruction live in a separate offline package. Coinbase
   txid/merkle calculations use stripped serialization, while the raw candidate retains the complete
   witness serialization and Core-provided default witness commitment.
9. This checkpoint does not activate a runtime, perform proposal validation, submit blocks, or create
   rewards. Those steps require separate implementation and evidence.

## Consequences

- Chain mismatch, node sync transitions, warnings, or malformed templates stop new native work.
- Template polling may pause briefly when headers lead fully validated blocks; this is intentional.
- The trusted job store must be capacity-bounded and must invalidate descendants when the chain tip
  changes.
- A block candidate must correlate to the exact private template digest and transaction set before
  proposal validation or `submitblock`.
- Candidate reconstruction must re-check template/job/transaction digests, nTime, the network target,
  and exact template size/weight bounds before any RPC submission is permitted.
- Bitcoin Core version upgrades require fixture and live-regtest compatibility evidence.

## Current implementation evidence

- `@mining/bitcoin-template` deterministically builds BIP34 coinbase fragments, converts a validated
  network-bound payout address to its output script, and commits the exact coinbase policy to a
  digest.
- Stripped coinbase serialization supplies the txid merkle root; full witness serialization supplies
  the byte-for-byte transaction placed in a candidate block.
- The offline builder emits a minimal `BitcoinMiningJob`, retains the complete transaction set in the
  trusted bundle, and reconstructs only candidates that meet the template target and block limits.
- Proposal mode returns explicit valid/rejected evidence. `submitblock` requires a fresh matching
  valid-proposal digest and normalizes accepted, duplicate, inconclusive, and rejected outcomes
  without treating a non-null response as success.
- Unit fixtures prove deterministic construction and fail-closed network, expiry, evidence-mutation,
  size, target, proposal, and submission behavior. No live Bitcoin Core evidence is claimed yet.

## Next acceptance gates

- Pin a Bitcoin Core image/version and add a disposable regtest-only Compose profile.
- Prove live `getblocktemplate` readiness, long-poll replacement, malformed/stale rejection, and node
  restart behavior.
- Implement global extranonce allocation and private template retention across replicas.
- Expand byte fixtures with live Bitcoin Core regtest templates and compare reconstructed blocks
  against Core proposal validation.
- Wire the offline candidate to proposal and `submitblock` through a durable coordinator, then persist
  correlated accepted, duplicate, inconclusive, and rejected evidence.
- Keep mainnet and every reward/payout side effect disabled until the remaining native-pool gates pass.

## References

- <https://bitcoincore.org/en/doc/31.0.0/rpc/mining/getblocktemplate/>
- <https://bitcoincore.org/en/doc/31.0.0/rpc/mining/submitblock/>
- <https://github.com/bitcoin/bips/blob/master/bip-0022.mediawiki>
- <https://github.com/bitcoin/bips/blob/master/bip-0023.mediawiki>
- <https://github.com/bitcoin/bips/blob/master/bip-0145.mediawiki>
- <https://github.com/bitcoin/bitcoin/blob/master/test/functional/test_framework/blocktools.py>
