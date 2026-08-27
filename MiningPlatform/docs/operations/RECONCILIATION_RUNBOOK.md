# Reconciliation Operations Runbook

**Status:** P0 operational contract; no production data mutation.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/reconciliation-runbook`

## 1. Reconciliation scope

Reconciliation compares independent sources for each asset/network and accounting period:

```text
accepted contribution/reward allocation
+ approved fee and beneficiary lines
+ clearing/reservation movements
+ payout broadcast/confirmation source
+ coinbase or upstream source where applicable
= internal immutable ledger and liability projection
```

Each run has a `reconciliationRunId`, period, asset, network, source snapshots, policy IDs, operator, correlation ID, audit ID, checksum, and status. The run is repeatable and never overwrites a prior run.

## 2. Daily workflow

| Step | Action                                                      | Evidence                                      |
| ---: | ----------------------------------------------------------- | --------------------------------------------- |
|    1 | Freeze period input boundaries and collect source snapshots | Snapshot IDs, timestamps, checksums           |
|    2 | Recompute accepted contribution and reward allocation       | Allocation digest, reward scheme ID           |
|    3 | Recompute platform/referral fee and user net                | Fee policy ID, rounding result                |
|    4 | Compare reservations and payout states                      | Reservation IDs, state counts, amount totals  |
|    5 | Compare wallet/node/provider source                         | Source response, transaction/UTXO identifiers |
|    6 | Calculate variance by asset/network/source                  | Atomic deltas and threshold result            |
|    7 | Review exceptions and open incident if needed               | Incident ID and reason                        |
|    8 | Obtain independent sign-off                                 | Reviewer and timestamp                        |

## 3. Variance policy

| Condition                         | Action                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| Zero variance                     | Mark source pair reconciled and retain evidence               |
| Non-zero ledger trial balance     | Freeze affected posting and payout scope immediately          |
| Wallet/node variance              | Pause payout for affected wallet class and network            |
| Coinbase/source mismatch          | Freeze block/reward liability and investigate maturity/reorg  |
| Duplicate reservation or payout   | Freeze account/scope; inspect idempotency and provider status |
| Missing source snapshot           | Mark run incomplete; do not infer zero                        |
| Unexplained fee/beneficiary delta | Hold beneficiary settlement and open finance incident         |

A non-zero variance is never cleared by manually editing a ledger row, lowering a balance, deleting a source record, or suppressing an alert. Resolution requires a documented explanation, approved compensating entry/reversal if needed, repeat run, and reviewer sign-off.

## 4. Reconciliation source hierarchy

The source hierarchy must be declared per route before production:

1. Authoritative chain/node/provider response for confirmed transaction, block, UTXO, and confirmation facts.
2. Immutable internal journal and event evidence for liabilities and allocations.
3. Reservation and payout state projections for operational status.
4. Cached dashboards and aggregates only for display, never for financial close.

A lower-tier projection cannot override an authoritative source without an approved incident decision.

## 5. Incident procedure

When variance is non-zero, the operator records affected scope, last known good run, source snapshots, amount atomic, asset/network, possible block/reorg/payout cause, and immediate pause action. The incident commander prevents new payouts in the affected scope and assigns engineering, treasury, and security review as needed.

Investigation must distinguish data delay, provider ambiguity, reorg/orphan, duplicate retry, fee rounding, wallet compromise, and genuine ledger imbalance. The resolution must preserve original evidence and use an immutable compensating event rather than mutation.

## 6. Closeout criteria

A reconciliation incident may close only when the source snapshots are retained, variance is zero or explicitly approved as a bounded operational delay, compensating entries are linked, payout scope is re-enabled by an authorized owner, observability alerts are resolved, and an independent reviewer signs the closeout.
