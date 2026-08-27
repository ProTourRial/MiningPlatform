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
   algorithm-discriminated job and share evidence. The versioned evidence-only event now retains asset,
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
   row, and rejects a share fingerprint already bound to different evidence.
10. Mining-worker owns `mining.randomx.share.accepted.v1` through a dedicated consumer, not the Bitcoin
    projection switch. The consumer requires the exact bounded payload, producer name, mining-account
    aggregate, upstream-decision time, and `randomx-share:<fingerprint>` idempotency key. It then takes
    a PostgreSQL transaction advisory lock and completes event idempotency plus immutable evidence in
    one transaction. The fingerprint binds algorithm, job blob, target, height, upstream job/client
    identity, and submitted proof; the source digest separately binds pool/session evidence. No
    miner-facing producer exists in this checkpoint.
11. A side-effect-free factory is the canonical producer-side representation of that event. It invokes
    the accounting projector again, requires a bounded CryptoNote blob and uint64 height, normalizes
    every payload/envelope field, and returns a frozen object. It does not publish.
12. Schema v19 and the dormant RandomX gateway resolve the worker and mining account from the
    authenticated connection, correlate that principal to an enabled RandomX asset and the adapter's
    configured upstream pool, and recheck the same authorization after hashing and inside the intent
    transaction. The gateway retrieves the still-active job at authoritative database time, derives
    accepted difficulty from its target, and persists bounded job evidence plus a locally validated
    share-submission intent before RPC. Callers cannot provide account, asset, pool, difficulty, job
    blob, seed, target, height, or session evidence.
13. Schema v20 adds one unique upstream-dispatch fingerprint over the exact pool, session/client, job
    identity, blob, seed, target, height, nonce, and result. It deliberately excludes local worker
    attribution, request correlation, and receipt timestamp so the same wire proof cannot be submitted
    under a second worker and a decided retry can be replayed after live-job eviction. Existing v19
    rows are backfilled with their already unique share fingerprint; historical rows remain immutable.
    New decisions use the versioned `randomx-upstream-share-decision-v2` digest domain because their
    canonical proof identity is the dispatch fingerprint; historical v1 decision digests are not
    recomputed.
14. The adapter returns isolated job snapshots and requires the expected active session plus the full
    immutable job fingerprint immediately before the socket write. Concurrent starts share one login,
    a valid job notification arriving beside the login response is deferred until authorization,
    replaced-socket callbacks are ignored, and disconnect clears all session/job state. Only an
    explicit upstream JSON-RPC error is terminal rejection. Timeout, lost transport, malformed or
    ambiguous response, or post-RPC persistence failure leaves the durable intent unresolved and
    blocks automatic resubmission. An acceptance writes its immutable decision and the canonical event
    to the transactional outbox atomically; rejection writes no accepted event.
15. Database triggers bind job/account/asset/pool/time evidence, require exact decision-to-event envelope
    and payload correlation, reject evidence mutation, and protect a correlated outbox envelope while
    allowing delivery status updates. Retention excludes accepted RandomX outbox evidence. These records
    remain evidence only and cannot create a contribution, reward, journal, balance, or payout.

## Consequences

- Bitcoin and RandomX transports can evolve independently without optional-field ambiguity.
- A sidecar outage reduces availability but cannot produce accepted, credited, or paid work.
- RandomX requires additional deployment capacity and health monitoring before production activation.
- Schema v20 and its fresh/representative-upgrade rehearsals establish immutable pre-RPC intent,
  authoritative dispatch identity, upstream-decision, and transactional-outbox boundaries required
  before miner-facing RandomX traffic can be considered.
- Accounting evidence now has deterministic projection, canonical event construction, append-only
  persistence, strict internal event consumption, and dormant durable submission/outbox orchestration.
  Miner-facing production, unresolved-intent operator recovery, contribution-fact creation,
  reward-period assignment, settlement reconciliation, and ledger effects remain intentionally absent.
- Provider fixtures must be redacted and versioned; production credentials and raw authorization
  messages must never appear in logs, events, or test artifacts.

## Production activation gates

- Pin and verify the RandomX sidecar image or build provenance.
- Exercise known-answer RandomX vectors against the deployed sidecar.
- Add authenticated miner-facing CryptoNote transport with connection, line, rate, and share limits.
- Transform or allocate miner work so replicas and workers cannot receive overlapping 32-bit RandomX
  nonce space for the same upstream blob; prove uniqueness across reconnect, restart, and failover.
- Enforce bounded clock skew and monitor database, gateway, sidecar, and upstream time domains before
  accepting timestamp evidence.
- Add the authenticated miner-facing producer and prove that only its accepted local-plus-upstream
  decisions reach the strict event consumer without bypassing the projector or database constraints.
- Add an authenticated, bounded miner-facing transport that invokes the dormant gateway without
  bypassing its pre-RPC intent or transactional outbox.
- Add operator-owned unresolved-intent recovery, including explicit classification of known local
  non-dispatch versus ambiguous write/response outcomes; never infer rejection or automatically
  resubmit without durable evidence and an approved policy.
- Prove duplicate/retry safety from accepted share through contribution and reward allocation.
- Reconcile the upstream RandomX settlement source exactly before any user balance is credited.
- Run failure-injection E2E for sidecar outage, wrong seed, stale job, upstream rejection, reconnect,
  and duplicate submission.

## References

- <https://github.com/tevador/RandomX>
- <https://github.com/tevador/randomx-service>
- <https://github.com/xmrig/xmrig-proxy/blob/master/doc/STRATUM.md>
- <https://github.com/xmrig/xmrig/blob/master/src/base/net/stratum/Job.cpp>
