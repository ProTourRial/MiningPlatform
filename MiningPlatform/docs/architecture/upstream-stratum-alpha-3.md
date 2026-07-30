# Upstream Stratum Architecture — Alpha 3

## Scope

Alpha 3 proves the protocol boundary without requiring PostgreSQL, Redis, or Docker. It provides:

- a newline-delimited Stratum V1 codec;
- an upstream TCP/TLS client;
- request-response correlation;
- subscribe and authorize lifecycle;
- difficulty, extranonce, and job notifications;
- job normalization;
- a multi-job registry;
- `clean_jobs` invalidation;
- local share validation;
- upstream share submission;
- accepted and rejected upstream decisions;
- a deterministic local upstream simulator.

It does not claim compatibility with every public pool.

## End-to-end flow

```text
Downstream miner
    ↓
MiningPlatform Stratum server
    ↓
Local worker authentication
    ↓
Upstream TCP/TLS connection
    ↓
mining.subscribe
    ↓
mining.authorize
    ↓
mining.set_difficulty
    ↓
mining.set_extranonce
    ↓
mining.notify
    ↓
Normalized job registry
    ↓
Downstream mining.submit
    ↓
Local SHA-256d validation
    ↓
UPSTREAM_PENDING
    ↓
Upstream mining.submit
    ↓
UPSTREAM_ACCEPTED / UPSTREAM_REJECTED
    ↓
Downstream response
```

The downstream server only returns `true` after the upstream simulator returns an accepted response.

## Byte-order contract

A normalized `BitcoinMiningJob` stores:

- `previousBlockHash` as the exact 32 bytes inserted into the serialized block header;
- Merkle branch elements as the exact digest bytes concatenated during Merkle calculation;
- version, time, nBits, and nonce as four-byte big-endian hexadecimal values that are serialized little-endian in the header.

Normalization happens once. Mining-core does not reverse normalized prevhash or Merkle branches a second time.

The public reference fixture verifies:

- the complete coinbase composition;
- the internal coinbase hash;
- the complete 80-byte header;
- the displayed double-SHA-256 header hash.

A captured fixture from the selected production pool is still required because Stratum V1 implementations may expose provider-specific conventions.

## Session state machine

```text
DISCONNECTED
    ↓
CONNECTING
    ↓
SUBSCRIBING
    ↓
SUBSCRIBED
    ↓
AUTHORIZING
    ↓
ACTIVE
```

Initial failures enter `RECONNECTING` with exponential backoff. A disconnect after the session becomes active currently closes the downstream miner connection. This intentionally avoids silently mining against an invalid job. Transparent active-session recovery remains future work.

## Job registry

Each upstream session owns a registry of jobs:

```text
ACTIVE
SUPERSEDED
EXPIRED
INVALIDATED
```

When a new notification has `clean_jobs=true`, all active prior jobs become `SUPERSEDED`. Notifications with `clean_jobs=false` can coexist until expiry or invalidation.

## Alpha connection model

Alpha 3 creates one upstream session per downstream miner session. This avoids extranonce partitioning during protocol verification.

It is not the final scaling model. A production proxy will need either:

- safe extranonce partitioning over shared upstream channels; or
- controlled upstream connection pools with explicit capacity limits.

## Failure policy

- Local-invalid shares are never submitted upstream.
- Upstream rejection is persisted as a separate lifecycle event.
- Upstream timeout or transport failure returns a safe generic rejection.
- A live upstream disconnect invalidates registered jobs and closes the downstream session.
- Unknown notifications are ignored; malformed protocol messages terminate the upstream socket.

## References

- Bitcoin Developer Reference, block header serialization and internal hash byte order: https://developer.bitcoin.org/reference/block_chain.html
- Public Stratum V1 request and notification examples: https://reference.cash/mining/stratum-protocol

These references define the fixture baseline; they do not replace provider-specific compatibility testing.
