# Block Lifecycle Policy

**Status:** Policy and fixture contract; Bitcoin node adapter remains gated.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/block-lifecycle-policy`

## 1. State model

| State | Meaning | Reward/liability effect | Allowed next states |
|---|---|---|---|
| `CANDIDATE` | Pool has candidate evidence but no accepted chain inclusion | No user reward; track candidate metadata | `SUBMITTED` |
| `SUBMITTED` | Candidate submitted to node/upstream | No mature allocation; track submit result | `CONFIRMED`, `ORPHANED`, `REORGED` |
| `CONFIRMED` | Block is on the selected chain tip or approved ancestor | Coinbase remains immature until depth policy | `ORPHANED`, `REORGED` |
| `ORPHANED` | Candidate lost before approved maturity | No new reward; reverse any provisional allocation | Terminal |
| `REORGED` | Previously accepted block is displaced by a chain reorganization | Freeze affected liabilities and post compensating reversal | Terminal pending operator case closure |
| `MATURE` | Policy-specific derived eligibility state | Coinbase/reward may become allocatable | `ALLOCATED` |
| `ALLOCATED` | Contribution window has been settled | User liability and fee lines posted | `RECONCILED` |
| `RECONCILED` | Source and internal records agree | Closed for normal processing | Terminal |

`MATURE` and later reward states are represented by the reward state machine; they are not alternative shortcuts around block confirmation.

## 2. Confirmation and maturity policy

Confirmation depth is an unresolved product/treasury decision. The implementation must read a versioned policy containing asset, network, confirmation depth, maturity depth, effective time, and approver. A block cannot become reward-eligible merely because a transaction ID or block hash exists.

| Gate | Required evidence |
|---|---|
| Candidate | Template/job ID, coinbase intent, contribution window, candidate ID |
| Submitted | Node/provider response, submit timestamp, source endpoint, idempotency key |
| Confirmed | Block hash, height, chain tip evidence, node quorum/result |
| Mature | Current height minus block height meets approved depth |
| Allocated | Deterministic contribution window, reward scheme ID, fee policy ID, allocation digest |
| Reconciled | Coinbase/source amount, ledger, beneficiary fee, and payout liability agree |

## 3. Orphan and reorg handling

An orphan or reorg is not a delete operation. The system freezes the affected block, contribution window, reward allocations, fee lines, reservations, and payouts that depend on it. Any posted amount is corrected with an immutable compensating entry linked to the original entry and incident/audit ID.

No retry may create a second block reward. Reprocessing the same block evidence must be idempotent by block hash, chain identity, and lifecycle transition key. A reorg crossing a payout reservation must trigger payout pause for the affected liability scope until reconciliation closes.

## 4. Coinbase UTXO reconciliation

The reconciliation source must include block hash, height, coinbase transaction ID, expected subsidy, transaction-fee component if applicable, maturity status, node/provider source, and observed amount. The internal reward allocation plus fees and reserve movements must reconcile to the approved source amount under the selected reward scheme.

A non-zero difference is an incident. Operators may not edit ledger rows, manually mark a block mature, or suppress the variance alert. The runbook must record investigation, decision, compensating entry, and reviewer sign-off.

## 5. Acceptance criteria

1. Every lifecycle transition is legal, idempotent, and auditable.
2. Reward allocation is impossible before approved confirmation and maturity gates.
3. Orphan/reorg produces a compensating path rather than mutation or silent deletion.
4. Duplicate node responses, retries, and replayed block events do not double-credit reward or fee beneficiary.
5. Coinbase source reconciliation covers subsidy, transaction fees, maturity, and network identity.
6. Synthetic fixtures cover candidate, submit failure, confirm, maturity, orphan, reorg, duplicate replay, and reconciliation mismatch.
7. Operators can pause affected payout scope and resume only after evidence-based reconciliation.
