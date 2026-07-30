[CHANGELOG.md](https://github.com/user-attachments/files/30540399/CHANGELOG.md)
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
