# ADR-0011: Atomic Financial Truth and Immutable Settlement Ledger

- Status: Accepted
- Date: 2026-08-16
- Owner: Abia Nugrahanto
- Authority: [`../../PROJECT_VISION.md`](../../PROJECT_VISION.md)

## Context

MiningPlatform must derive every user balance from accepted upstream work, an imported provider settlement, the effective fee policy, and a balanced ledger. Decimal display values alone are not sufficient: retries, duplicate delivery, rounding, and reversals must preserve exact smallest-unit totals without editing history.

## Decision

1. Only `UPSTREAM_ACCEPTED` shares produce accounting contribution events. The mining projection writes those events through the PostgreSQL transactional outbox after the share decision is durable.
2. `ContributionFact` is immutable. Its only permitted update is a one-time assignment to a reward period.
3. Settlement amounts and journal lines store exact atomic-unit integers alongside decimal presentation values.
4. Gross reward and provider costs use deterministic largest-remainder allocation. The platform fee is calculated per account from gross allocation and rounds down in the user's favour.
5. The initial platform policy remains 50 basis points (0.5%) and its complete versioned snapshot is frozen into every reward allocation.
6. Settlement import requires an active verified OWNER with TOTP, an explicit source reference, a SHA-256 source checksum, an idempotency key, and explicit confirmation.
7. Alpha.5 accepts only zero reconciliation tolerance. Any variance becomes an exception and cannot create allocations or journals.
8. Journals are created as `PENDING`, checked for decimal and atomic balance, then posted transactionally with outbox events. Posted facts and lines cannot be edited or deleted.
9. Corrections use an equal-and-opposite reversal journal. The original entry remains queryable with `REVERSED` status.
10. User balance is a projection of user liability lines from `POSTED` and `REVERSED` economic journals. No mutable balance field is authoritative.
11. Payouts remain disabled. This decision establishes internal financial truth only; it does not authorize custody, signing, broadcast, or real funds.

## Consequences

- Duplicate and concurrent delivery can be retried safely under serializable transactions.
- Provider evidence, allocation policy, contribution digest, journal correlation, and audit records form a traceable chain.
- A reconciliation exception remains non-spendable and must not be repaired with direct database edits.
- Operational exception approval/resolution remains an explicit follow-up gate before P0.3 can be marked complete.
