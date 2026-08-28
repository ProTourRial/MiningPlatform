# Reward Scheme Decision Pack

**Status:** Proposal pending Product/Finance/Treasury approval.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/reward-scheme-decision`

## 1. Decision summary

Rekomendasi awal untuk native pool adalah **PPLNS**, dengan payout tetap gated sampai block lifecycle, accepted-share evidence, ledger invariants, reserve controls, dan reconciliation terbukti. PPLNS membatasi kewajiban operator karena reward mengikuti block yang benar-benar ditemukan dan kontribusi pada window yang disetujui. Rekomendasi ini bukan approval final dan tidak mengaktifkan reward engine.

## 2. Comparison

| Scheme | Operator liability                                                | User variance                                | Reserve need | Implementation risk                                           | Initial posture            |
| ------ | ----------------------------------------------------------------- | -------------------------------------------- | ------------ | ------------------------------------------------------------- | -------------------------- |
| PPLNS  | Lower; tied to pool blocks and contribution window                | Higher, especially at low pool luck/hashrate | Moderate     | Moderate; window and contribution integrity required          | **Recommended first**      |
| PROP   | Lower; distributes each found block proportionally                | High for small/short-lived participation     | Moderate     | Moderate; round boundaries and join/leave gaming              | Alternative after baseline |
| PPS    | High; operator pays expected value independent of found blocks    | Low for user                                 | High         | High; requires reserve, variance, fraud and hashrate controls | Not initial                |
| FPPS   | High; includes transaction fee expectation in addition to subsidy | Low for user                                 | Very high    | High; fee estimation, mempool, variance, reserve              | Not initial                |

## 3. PPLNS contract

For an approved block, the allocation window is defined by an immutable `windowId`, contribution cutoff, eligible share evidence, difficulty normalization, and fee policy ID. Shares that are invalid, stale, duplicate, replayed, or outside the approved window are excluded with a reason code. The allocation must be deterministic and replay-safe.

The operator must not allocate a reward before the block is in the approved lifecycle state and maturity policy is satisfied. A reorg/orphan event produces a compensating reversal or liability adjustment through the ledger contract; it never edits a posted allocation.

## 4. Liability and reserve model

| Liability                | Trigger                                       | Reserve treatment                           | Alert                |
| ------------------------ | --------------------------------------------- | ------------------------------------------- | -------------------- |
| Immature coinbase        | Candidate/confirmed block before maturity     | Not user-withdrawable; tracked separately   | Block maturity lag   |
| Mature reward allocation | Approved mature block and contribution window | User liability increases                    | Allocation mismatch  |
| Payout reservation       | Eligible user amount reserved                 | Reserve/liquidity decreases or is earmarked | Reservation conflict |
| Fee beneficiary          | Approved fee/referral settlement              | Separate payable line                       | Beneficiary mismatch |
| Reorg reversal           | Confirmed block later orphaned/reorged        | Freeze affected scope and post reversal     | Non-zero variance    |

Reserve policy must define a hard maximum payout exposure, a minimum operating buffer, and emergency pause conditions. A reserve shortfall cannot be hidden by lowering user balances or changing historical policy.

## 5. Attack surface and mitigations

| Risk                             | Mitigation                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| Share replay or duplicate credit | Contribution ID plus idempotency key and immutable accepted-share evidence |
| Window hopping                   | Fixed cutoff and membership rules recorded per block/window                |
| Hashrate spoofing                | Accepted share validation and worker identity controls                     |
| Pool luck variance               | PPLNS disclosure, reserve limits, and transparent block history            |
| Reorg/orphan exposure            | Block state machine, maturity depth, reversal, and reconciliation          |
| Referral/fee double allocation   | Single settlement key and fee conservation invariant                       |

## 6. Rollout gates

PPLNS may move from proposal to implementation only when Product, Finance/Treasury, Engineering, Security, and Operations approve the decision and the following evidence exists:

1. Deterministic allocation fixtures cover normal, empty-window, duplicate, stale, orphan/reorg, rounding, and policy-transition cases.
2. Ledger entries balance and are immutable after posting; reversals use compensating entries.
3. Block maturity and coinbase liability are reconciled against node source data.
4. Reserve limits, payout pause, and operator approval are tested with synthetic data.
5. Observability includes allocation failure, liability variance, reconciliation delta, and payout reservation signals.
6. Legal/compliance review accepts the reward and custody disclosures for the selected operating jurisdiction.

## 7. Pending approval

The following values remain unresolved: PPLNS window size, minimum payout per asset/network, maturity depth, reserve limit, treatment of transaction fees, and SLA. These values must be recorded in the product governance decision log before implementation.
