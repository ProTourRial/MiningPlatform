# MiningPlatform

## ADR 0014: Controlled payout execution and isolated signing

**Status:** Accepted for implementation
**Date:** 2026-08-22
**Owner:** Abia Nugrahanto

## Context

The payout-address foundation proves destination ownership controls, but it does not move funds. A real payout must preserve the financial invariants already established by the reward ledger while network calls, worker deliveries, and operator actions can be retried or fail midway.

## Decision

1. The posted journal is the only source of user balance. A payout request never derives spendable balance from a wallet RPC response.
2. Eligibility and reservation happen in one serializable database transaction. The transaction locks the user's available liability account, recalculates the posted balance, creates exactly one payout for the idempotency key, and posts a balanced reservation journal:
   - debit the user's available reward liability;
   - credit the user's payout-reserved liability.
3. `amountAtomic` is the amount delivered to the destination. `networkFeeAtomic` is the user's configured network-fee contribution. The reservation total is their sum.
4. A cancellation or a proven pre-broadcast failure releases a reservation only by creating an equal-and-opposite reversal journal. Posted lines are never edited or deleted.
5. A payout that may have been broadcast is never automatically released. It stays in reconciliation until node evidence proves the transaction state.
6. Approval records are append-only. The requesting user cannot approve their own payout. Manual-review routes require an authorized `ADMIN` or `OWNER` decision before signing.
7. The API may request, inspect, or approve a payout, but it cannot access a private key, call a signing RPC, receive a signed raw transaction, or broadcast.
8. The wallet worker prepares deterministic signing manifests. A separately deployed signer receives only an approved manifest through an authenticated service boundary. Signer credentials and wallet unlock material exist only in the signer process.
9. Broadcast attempts, chain observations, and reconciliation runs are append-only evidence. Every provider call has a stable idempotency key, request digest, and result digest.
10. Confirmation completes a payout only when the configured route confirmation depth is reached and reconciliation proves:

`reserved user liability = destination amount + network fee = wallet asset decrease`

11. Reorg or dropped-transaction evidence reopens confirmation/reconciliation. It never recreates a payout or silently credits the user.
12. Activation is split into independent fail-closed gates:

- `PAYOUT_REQUESTS_ENABLED` permits eligibility and reservation;
- `PAYOUT_SIGNING_ENABLED` permits approved signing manifests to leave the wallet worker;
- `PAYOUT_BROADCAST_ENABLED` permits signed transactions to be broadcast;
- `PAYOUTS_ENABLED` is the final owner kill switch and must also be true for any real-funds action.

13. Auto withdrawal remains OFF by default. ON is only a preference; scheduling additionally requires all gates, an active verified destination, route limits, sufficient available balance, wallet health, and approval policy.

## State mapping

| Payout state | Required evidence                                        |
| ------------ | -------------------------------------------------------- |
| `QUEUED`     | eligibility snapshot and active balance reservation      |
| `REVIEW`     | reservation plus manual approval requirement             |
| `APPROVED`   | append-only approval by a different authorized actor     |
| `SIGNING`    | immutable signing manifest and isolated signer request   |
| `BROADCAST`  | successful broadcast attempt with transaction id         |
| `CONFIRMING` | chain observation from the configured node               |
| `COMPLETED`  | required confirmations and matched payout reconciliation |
| `FAILED`     | stable failure code and safe reservation disposition     |
| `CANCELLED`  | no possible broadcast and reservation reversal posted    |

Transitions skip neither evidence nor state. `FAILED` is not sufficient evidence to release funds after an uncertain broadcast.

## Consequences

- Production payout needs PostgreSQL, the wallet worker, an isolated signer deployment, and a chain node; a frontend-only Vercel deployment cannot execute funds.
- Deployment without signer or node credentials remains useful for user review, but all real-funds gates stay false.
- Provider certification, controlled pilot evidence, custody approval, and legal/risk approval remain operational release gates even when the code and automated tests pass.
