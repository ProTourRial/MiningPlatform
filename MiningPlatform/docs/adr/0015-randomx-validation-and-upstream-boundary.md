# ADR-0015: RandomX Validation, Upstream, and Accounting Boundary

- **Status:** Accepted
- **Date:** 2026-08-22
- **Owner:** Abia Nugrahanto

## Context

The original mining path is intentionally Bitcoin-specific. Its Stratum V1 messages, job fields,
header proof, and persisted share evidence cannot truthfully represent a CryptoNote RandomX job.
Treating RandomX as another Bitcoin difficulty mode would lose the seed hash and proof semantics and
could allow contributions to enter accounting without independent RandomX verification.

RandomX also requires a native implementation and a large managed dataset. Reimplementing the hash
in application JavaScript is outside the platform's security and correctness boundary.

## Decision

1. RandomX hashing is delegated to the official `tevador/randomx-service` boundary. MiningPlatform
   sends a bounded hashing blob and the exact 32-byte seed hash, requires an exact 32-byte result, and
   fails closed when the service is unavailable, times out, rejects the seed, or returns malformed
   data.
2. The local validator applies the four-byte CryptoNote nonce at byte offset 39 for `rx/0`, parses
   XMRig's four-byte compact or eight-byte little-endian targets, recomputes the hash independently,
   compares the submitted result in constant time, and tests the final little-endian 64-bit hash word
   using a strict less-than target comparison.
3. RandomX upstream uses a separate CryptoNote JSON-RPC adapter. It implements `login`, seeded `job`
   notifications, and session-bound `submit`; it does not reuse Bitcoin `mining.subscribe`, extranonce,
   coinbase, or header fields.
4. Upstream jobs without `seed_hash`, a supported target, a bounded blob, or a valid lifetime are
   rejected before they can reach a miner-facing runtime. Session replacement clears every retained
   job so proofs cannot cross an upstream authorization boundary.
5. Runtime activation remains disabled until the mining event contract and database schema store
   algorithm-discriminated job and share evidence. A RandomX contribution must retain asset,
   algorithm, upstream pool/session, job, seed hash, target, nonce, submitted result, computed result,
   assigned work, decision timestamps, and correlation identifiers.
6. Accounting may consume only a locally verified and upstream-accepted RandomX contribution. Reward
   periods remain asset and upstream-pool scoped, and no BTC fee, wallet, payout route, or settlement
   policy may be inferred for a RandomX asset.
7. A pure accounting projector independently checks the accepted validation state, exact submitted and
   computed hash, parsed target, positive 12-decimal difficulty, job/submission/time ordering, upstream
   decision, and bounded identifiers. Its deterministic digest binds the algorithm, account, asset,
   pool/session/job, seed, target, nonce, results, timestamps, and correlation. The projector cannot
   persist a fact, allocate a reward, post a journal, or create a balance.
8. Schema v18 provides an append-only persistence boundary for accepted-share evidence produced by the
   projector. Database constraints bind each row to matching account, asset, and upstream-pool records,
   require a RandomX asset, preserve source and share-fingerprint uniqueness, and reject updates or
   deletes. This evidence table is not a contribution fact and cannot allocate a reward, post a journal,
   or create a balance.
9. The mining-worker persistence repository accepts projection input rather than caller-constructed
   evidence, invokes the projector itself, collapses concurrent identical source-digest retries to one
   row, and rejects a share fingerprint already bound to different evidence. It is a dormant boundary;
   no miner-facing or event-consumer runtime invokes it in this checkpoint.

## Consequences

- Bitcoin and RandomX transports can evolve independently without optional-field ambiguity.
- A sidecar outage reduces availability but cannot produce accepted, credited, or paid work.
- RandomX requires additional deployment capacity and health monitoring before production activation.
- Schema v18 and its fresh/representative-upgrade rehearsals establish the immutable evidence storage
  boundary required before miner-facing RandomX traffic can be considered.
- Accounting evidence now has deterministic projection and append-only persistence boundaries, but
  runtime ingestion, contribution-fact creation, reward-period assignment, settlement reconciliation,
  and ledger effects remain intentionally absent.
- Provider fixtures must be redacted and versioned; production credentials and raw authorization
  messages must never appear in logs, events, or test artifacts.

## Production activation gates

- Pin and verify the RandomX sidecar image or build provenance.
- Exercise known-answer RandomX vectors against the deployed sidecar.
- Add authenticated miner-facing CryptoNote transport with connection, line, rate, and share limits.
- Connect authenticated miner traffic to the retry-safe schema-v18 repository without bypassing the
  projector or database correlation constraints.
- Prove duplicate/retry safety from accepted share through contribution and reward allocation.
- Reconcile the upstream RandomX settlement source exactly before any user balance is credited.
- Run failure-injection E2E for sidecar outage, wrong seed, stale job, upstream rejection, reconnect,
  and duplicate submission.

## References

- <https://github.com/tevador/RandomX>
- <https://github.com/tevador/randomx-service>
- <https://github.com/xmrig/xmrig-proxy/blob/master/doc/STRATUM.md>
- <https://github.com/xmrig/xmrig/blob/master/src/base/net/stratum/Job.cpp>
