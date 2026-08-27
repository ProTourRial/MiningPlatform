# Financial Test Fixtures

- **Status:** Documentation-only fixture catalog
- **Branch:** `feat/financial-fixtures`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Machine-readable fixtures:** [`fixtures/financial-readiness-fixtures.json`](./fixtures/financial-readiness-fixtures.json)
- **Scope:** Reward maturity, orphan/reorg, payout reservation, duplicate retry, failed broadcast, reconciliation mismatch, fee standard/referral, dan auto-withdrawal ON/OFF

> Fixtures ini tidak menjalankan transaksi nyata, tidak memakai wallet produksi, dan tidak mengaktifkan payout. Semua amount menggunakan atomic unit BTC untuk deterministic verification.

## 1. Test harness contract

Implementasi test yang mengonsumsi fixture harus:

1. membaca `fixtureVersion`, `sourceBaseline`, policy version, asset, network, dan decimals;
2. membuat isolated transaction/test context per case;
3. mengirim input persis seperti fixture, termasuk idempotency key dan source checksum;
4. membandingkan state, error code, amount, side effect count, audit event, dan payout gate dengan `expected`;
5. gagal jika ada side effect parsial, rounding tersembunyi, duplicate journal, atau destination fallback;
6. membersihkan test context tanpa mengubah data development/production.

Test runner tidak boleh memakai private key, full wallet address, live RPC, live upstream, atau production database.

## 2. Fixture inventory

| Case                             | Subject                    | Primary assertion                                     | Expected terminal/result          |
| -------------------------------- | -------------------------- | ----------------------------------------------------- | --------------------------------- |
| `FF-IMMATURE-001`                | Reward immature            | Confirmation belum cukup tidak menjadi spendable      | `IMMATURE`, no payout eligibility |
| `FF-MATURE-001`                  | Reward mature              | Maturity hanya membuka allocation step                | `MATURE`, not spendable yet       |
| `FF-ORPHAN-001`                  | Orphan block               | Block/reward ditahan atau direview, histori immutable | `ORPHANED_REORGED`                |
| `FF-REORG-001`                   | Reorg after allocation     | Reversal/adjustment, bukan edit journal               | reconciliation exception          |
| `FF-RESERVATION-001`             | Payout reservation success | Hold atomic dan satu kali                             | `RESERVED`                        |
| `FF-RESERVATION-CONFLICT-001`    | Reservation over balance   | Reject tanpa partial hold                             | `INSUFFICIENT_RECONCILED_BALANCE` |
| `FF-DUPLICATE-RETRY-001`         | Retry timeout              | Exact replay tidak double-credit                      | one allocation/credit             |
| `FF-BROADCAST-FAILURE-001`       | Broadcast ambiguous        | No blind retry; lookup/reconcile                      | recoverable pending               |
| `FF-RECON-MATCH-001`             | Matching source            | Period dapat ditutup                                  | `MATCHED`                         |
| `FF-RECON-MISMATCH-001`          | Source mismatch            | Exception dan payout pause                            | `MISMATCH`                        |
| `FF-FEE-STANDARD-001`            | Standard fee               | 0,50% platform fee                                    | 5,000 / 1,000,000                 |
| `FF-FEE-REFERRAL-MP05-001`       | Referral MP05              | 0,375% miner fee + 0,125% donation liability          | 996,250 user net                  |
| `FF-AUTOWITHDRAWAL-OFF-001`      | Auto-withdrawal OFF        | No scheduler payout                                   | `effective=false`                 |
| `FF-AUTOWITHDRAWAL-ON-GATED-001` | ON but gated               | Preference ≠ execution                                | `effective=false`                 |

## 3. Expected financial assertions

### Journal and allocation

For a gross reward of `1,000,000` atomic units:

- Standard fee: `5,000` atomic units (`0,50%`), user net `995,000`.
- Valid referral/MP05: miner fee `3,750` (`0,375%`), beneficiary/donation liability `1,250` (`0,125%`), user net `996,250`.
- The MP05 beneficiary is `SITE_DONATION_WALLET`; it is never a user payout fallback, deposit wallet, or pool treasury wallet.
- Debit and credit totals must balance for every posted journal.
- Pending, immature, orphaned, or unreconciled values must not enter spendable balance.

### Reservation

For available reconciled balance `250,000` and requested payout `125,000`:

- Exactly one active reservation is created.
- The remaining available amount is `125,000`, according to the projection policy.
- Same idempotency key returns the original result.
- A request exceeding available balance is rejected without a journal/reservation side effect.
- Wrong network, invalid destination, cooldown, withdrawal lock, or payout pause rejects before reservation.

## 4. State and error expectations

| Condition                                | Expected state/error                  | Financial side effect              |
| ---------------------------------------- | ------------------------------------- | ---------------------------------- |
| Confirmation below policy                | `PENDING_MATURITY` / `IMMATURE`       | None to spendable balance          |
| Orphan/reorg                             | `ORPHANED_REORGED` / `REORG_REVIEW`   | Reversal/exception only; no delete |
| Same retry key and payload               | Original result + replay indicator    | No second credit/reservation       |
| Same key, different payload              | `IDEMPOTENCY_CONFLICT`                | None                               |
| Broadcast timeout after submit           | Recoverable pending/reconciliation    | No blind second broadcast          |
| Source checksum mismatch                 | `MISMATCH` / reconciliation exception | No forced period close             |
| Reservation > available                  | `INSUFFICIENT_RECONCILED_BALANCE`     | No hold                            |
| Auto-withdrawal ON, executor/route gated | `effective=false` + blockers          | No scheduler payout                |

## 5. Case review record

| Field                  | Value              |
| ---------------------- | ------------------ |
| Fixture version        | `TBD`              |
| Test runner commit     | `TBD`              |
| Environment            | `TBD`              |
| Database/provider mode | `isolated fixture` |
| Executed by            | `TBD`              |
| Executed at UTC        | `TBD`              |
| Passed                 | `TBD`              |
| Failed                 | `TBD`              |
| Blocked                | `TBD`              |
| Evidence links         | `TBD`              |

## 6. Acceptance criteria

- [ ] JSON fixture valid dan dapat dibaca tanpa live dependency.
- [ ] Setiap case memiliki deterministic input dan expected result.
- [ ] Journal balance, immutability, reversal, idempotency, allocation uniqueness, reservation, dan reconciliation diverifikasi.
- [ ] Fee standard/referral dan MP05 donation liability diverifikasi dalam atomic units.
- [ ] Auto-withdrawal ON/OFF membedakan preference dari effective execution.
- [ ] Failed broadcast tidak melakukan blind retry atau duplicate transfer.
- [ ] Orphan/reorg tidak menghapus fakta historis.
- [ ] Fixture tidak memakai production secret, production database, atau live wallet.

No backend/accounting implementation change is authorized by this branch.
