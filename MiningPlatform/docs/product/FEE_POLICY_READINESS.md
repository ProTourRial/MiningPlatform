# Fee Policy Readiness

**Status:** Contract and fixture policy; no active fee-engine change.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/fee-policy-readiness`

## 1. Normative fee matrix

| Scenario | Platform fee | Referral beneficiary | User net | Required attribution |
|---|---:|---:|---:|---|
| No referral | 0.50% | 0.00% | 99.50% | Platform treasury/fee liability |
| Valid referral | 0.375% | 0.125% | 99.50% | Referrer account or approved beneficiary |
| Default code `MP05` | 0.375% | 0.125% | 99.50% | Site donation wallet, never user payout fallback |

The fee percentages are applied to the eligible gross amount according to the selected reward/payout unit. The sum of platform and beneficiary fees must equal 0.50%; rounding must not create or destroy value.

## 2. Effective-dated policy

A fee policy is identified by `policyId`, `effectiveFrom`, optional `effectiveTo`, asset, network, and scope. The policy used for a reward/payout calculation must be recorded with the resulting settlement. Historical records are never recalculated silently when a policy changes.

| Field | Requirement |
|---|---|
| `policyId` | Immutable, unique, auditable identifier |
| `effectiveFrom` | UTC timestamp; inclusive |
| `effectiveTo` | UTC timestamp; exclusive when present |
| `scope` | Asset/network, reward scheme, campaign, or account segment |
| `platformRateBps` | 50 bps for standard; 37.5 bps is represented in atomic-safe form for referral policy |
| `beneficiaryRateBps` | 0 standard; 12.5 bps for valid referral |
| `roundingMode` | Explicit deterministic mode, approved per asset/network |
| `status` | Draft, approved, active, disabled, superseded |

Because half-basis-point values cannot be represented as integer bps without loss, the implementation must use a fixed-point rate representation or an equivalent exact rational calculation. Never round the rate before multiplying the gross amount.

## 3. Calculation contract

For gross atomic amount `G`, platform fee `P`, beneficiary fee `B`, and user net `N`:

```text
P + B + N = G
N = G - P - B
P = round_exact(G × platform_rate)
B = round_exact(G × beneficiary_rate)
```

The residual from deterministic rounding must be assigned according to the approved asset/network rule and recorded in the settlement evidence. No fee line may be allocated twice, and a retry with the same settlement key must reproduce the same result.

## 4. Referral attribution

A referral code is resolved at the time the applicable contribution/reward is accepted. The resolved beneficiary, code, policy ID, and attribution decision are immutable for that settlement. `MP05` points to the approved site donation beneficiary and is not a fallback destination for any user's payout.

Referral abuse controls must support self-referral rejection, account/code ownership rules, duplicate attribution rejection, campaign expiry, beneficiary disablement, and clawback through an auditable reversal rather than an edit to a posted entry.

## 5. Required invariants

| Invariant | Rejection condition |
|---|---|
| Fee conservation | `platform + beneficiary + user_net != gross` |
| Single attribution | More than one beneficiary line for one settlement key |
| Effective policy | No approved policy matches calculation timestamp |
| Determinism | Same settlement key and policy produce different result |
| Immutability | Posted fee line is edited instead of reversed |
| Network scope | Policy asset/network does not match reward/payout route |
| Disable safety | Disabled beneficiary still receives new settlement |

## 6. Acceptance examples

| Gross atomic | Scenario | Platform | Beneficiary | User net | Expected |
|---:|---|---:|---:|---:|---|
| 100,000,000 | No referral | 500,000 | 0 | 99,500,000 | Pass |
| 100,000,000 | Valid referral | 375,000 | 125,000 | 99,500,000 | Pass |
| 1 | Any | 0 or policy-defined residual | 0 or policy-defined residual | Conservation-preserving | Pass only if exact residual rule is recorded |
| 100,000,000 | Duplicate retry | Same as original | Same as original | Same as original | No second allocation |

## 7. Approval and disable workflow

A fee policy is proposed by Product/Finance, reviewed by Engineering and Security, approved by the Finance/Treasury owner, and activated only at an effective timestamp. A policy or beneficiary can be disabled prospectively; already posted settlements remain auditable and require reversal/clawback policy rather than mutation.

## 8. Acceptance evidence

The implementation milestone is complete only when deterministic fixtures cover standard, referral, MP05, boundary rounding, policy transition, duplicate retry, beneficiary disablement, and clawback. Evidence must include policy ID, source contribution/reward ID, settlement key, gross, each fee line, net, rounding decision, beneficiary, and audit event.
