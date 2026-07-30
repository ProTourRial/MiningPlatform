# Changelog

## 0.1.1 - 2026-07-30

### Added

- ADR-0001 as the official core mining architecture baseline.
- v0.2.0 Definition of Done for the end-to-end Stratum and monitoring pipeline.
- Internal event bus contract with at-least-once delivery rules.
- Transactional outbox requirement for durable event publication.
- Shared idempotency contract and in-memory test implementation.
- Generic finite state machine transition guard.
- Repository and domain service separation rules.
- PostgreSQL and TimescaleDB-compatible time-series retention strategy.
- Central scheduler responsibility document.
- Expanded mining and monitoring event catalog.

### Changed

- Renumbered the existing ADR documents after inserting the architecture baseline.
- Revised the roadmap into v0.2.0 through v1.0.0 release stages.
- Clarified that reward, ledger settlement, wallet RPC, and real payout are outside v0.2.0.
- Clarified that wallet services never mutate user balances directly.

## 0.2.0-alpha.1 - 2026-07-30

### Added

- Bitcoin mining core package for coinbase, merkle root, 80-byte header, double SHA-256, compact target, share target, and achieved difficulty.
- Share validation for unauthorized, unknown job, stale, duplicate, malformed, invalid time, invalid version, and low difficulty submissions.
- Stratum request parsing for configure, subscribe, authorize, and submit.
- Development Stratum session, worker authentication, job notification, submission rate limit, and JSONL event trace.
- Redis Stream event publisher and consumer group transport.
- Prisma mining models for miner sessions, difficulty assignments, upstream sessions, Stratum jobs, share fingerprints, detailed share states, outbox events, and idempotency records.
- Baseline PostgreSQL migration and optional development miner seed.
- Mining worker projection for session, job, accepted share, rejected share, fingerprint, worker state, and five-minute hashrate snapshot.
- NestJS WebSocket gateway for worker, share, and hashrate events.
- Next.js realtime development panel.
- End-to-end Stratum smoke client.
- Predicate-based Stratum smoke client inbox that safely handles interleaved responses and notifications.

### Security

- Development Stratum mode is rejected under production runtime.
- Development monitoring snapshot endpoint is hidden under production runtime.
- Payout and wallet functions remain disabled.

### Known gaps

- Upstream Stratum relay and submission results are not implemented.
- Transactional outbox, pending message recovery, and dead-letter handling are not implemented.
- Full integration, container, load, and production security tests are not complete.
