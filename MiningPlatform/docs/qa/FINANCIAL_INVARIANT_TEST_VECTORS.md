# Financial Invariant Test Vectors

- **Status:** Documentation-only fixtures and expected results
- **Branch:** `feat/financial-invariant-test-vectors`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Journal, reward allocation, reversal, retry, rollback, reconciliation, dan payout reservation
- **Out of scope:** Implementasi backend, schema, migration, RandomX, `upstream-stratum`, dan `CHANGELOG.md`

> Semua amount di fixture menggunakan **atomic units**. Angka hanya untuk deterministic test; bukan saldo produksi atau wallet address nyata.

## 1. Shared fixture conventions

```json
{
  "asset": "BTC",
  "decimals": 8,
  "accountId": "acct-test-001",
  "miningAccountId": "mine-test-001",
  "rewardPeriodId": "period-test-001",
  "correlationId": "corr-test-001",
  "requestId": "req-test-001",
  "policyVersion": "fee-policy-v1",
  "idempotencyKey": "idem-test-001"
}
```

Expected invariants:

- Journal selalu balance: total debit = total credit per asset/currency.
- Posted entry immutable; koreksi hanya reversal/adjustment dengan reference.
- Replay command/event yang identik tidak menambah side effect.
- One reward source/period/account allocation memiliki unique identity.
- Payout reservation tidak boleh melebihi available reconciled balance dan tidak boleh dibuat dua kali untuk intent yang sama.
- Rollback aplikasi tidak menghapus durable financial facts atau mengulang side effect.

## 2. Vector summary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FV-01 | Balanced journal | Accepted; debits equal credits | P0 |
| FV-02 | Unbalanced journal | Rejected atomically; no partial lines | P0 |
| FV-03 | Immutable posted entry | Update/delete rejected; original unchanged | P0 |
| FV-04 | Reversal | Equal-and-opposite adjustment accepted and traceable | P0 |
| FV-05 | Retry without double-credit | Same command returns original result; one allocation | P0 |
| FV-06 | Single reward allocation | Duplicate source delivery cannot create second allocation | P0 |
| FV-07 | Application rollback | Durable records remain once; replay resumes safely | P0 |
| FV-08 | Reconciliation source | Matching source closes period; mismatch creates exception | P0 |
| FV-09 | Payout reservation | Atomic hold succeeds once and cannot exceed balance | P0 |

## 3. FV-01 — Balanced journal

### Input

```json
{
  "journalId": "journal-fv-01",
  "status": "POSTED",
  "currency": "BTC",
  "lines": [
    { "lineId": "line-01", "account": "USER_REWARD_PAYABLE", "side": "DEBIT", "amountAtomic": "1000000" },
    { "lineId": "line-02", "account": "UPSTREAM_CLEARING", "side": "CREDIT", "amountAtomic": "995000" },
    { "lineId": "line-03", "account": "PLATFORM_FEE_REVENUE", "side": "CREDIT", "amountAtomic": "5000" }
  ],
  "sourceEventId": "settlement-fv-01"
}
```

### Expected

| Assertion | Expected |
|---|---|
| Accepted | Yes |
| Total debit | `1000000` |
| Total credit | `1000000` |
| Journal state | `POSTED` |
| Balance projection | Updated from journal, not direct mutation |
| Audit | `journalId`, source event, policy version, correlation ID stored |

## 4. FV-02 — Unbalanced journal rejection

### Input

```json
{
  "journalId": "journal-fv-02",
  "status": "POSTED",
  "currency": "BTC",
  "lines": [
    { "lineId": "line-01", "account": "USER_REWARD_PAYABLE", "side": "DEBIT", "amountAtomic": "1000000" },
    { "lineId": "line-02", "account": "UPSTREAM_CLEARING", "side": "CREDIT", "amountAtomic": "994999" }
  ],
  "sourceEventId": "settlement-fv-02"
}
```

### Expected

- Reject with stable `UNBALANCED_JOURNAL`/equivalent error.
- Transaction rolls back atomically; neither line is visible as posted.
- Balance projection and user liability do not change.
- Audit records rejection, source event, calculated debit/credit totals, and request ID.
- Retry is safe after correcting source input; a malformed journal cannot be “rounded” silently.

## 5. FV-03 — Immutable posted entry

### Given

`journal-fv-03` is `POSTED` with total debit and credit `1000000`.

### Attempts

```json
{
  "journalId": "journal-fv-03",
  "operation": "UPDATE",
  "patch": { "amountAtomic": "900000" },
  "reason": "operator correction"
}
```

### Expected

| Assertion | Expected |
|---|---|
| Update posted line | Rejected with `POSTED_ENTRY_IMMUTABLE` |
| Delete posted line | Rejected with same invariant |
| Original journal | Remains byte/field-equivalent |
| Correction path | Requires reversal/adjustment with original reference |
| Audit | Rejected attempt is recorded; no financial side effect |

## 6. FV-04 — Reversal

### Original journal

```json
{
  "journalId": "journal-fv-04-original",
  "status": "POSTED",
  "currency": "BTC",
  "netAmountAtomic": "996250",
  "sourceEventId": "allocation-fv-04"
}
```

### Reversal command

```json
{
  "commandId": "reversal-fv-04",
  "originalJournalId": "journal-fv-04-original",
  "reason": "UPSTREAM_REORG",
  "idempotencyKey": "idem-reversal-fv-04",
  "correlationId": "corr-fv-04"
}
```

### Expected

- Create a new `REVERSAL`/`ADJUSTMENT` journal with equal-and-opposite lines totaling `996250`.
- Original journal remains `POSTED` and linked to reversal.
- Net effect across original + reversal is zero for the corrected amount.
- Replaying the same reversal command returns the original reversal result; no second reversal.
- Reward/payout eligibility is recalculated from the corrected projection.
- Audit includes original ID, reversal ID, reason, actor, policy/source event, and correlation ID.

## 7. FV-05 — Retry without double-credit

### Command

```json
{
  "command": "POST_REWARD_ALLOCATION",
  "commandId": "cmd-fv-05",
  "idempotencyKey": "idem-fv-05",
  "accountId": "acct-test-001",
  "rewardPeriodId": "period-test-001",
  "amountAtomic": "996250",
  "asset": "BTC"
}
```

Send the exact command three times, including a simulated client timeout after the first server commit.

### Expected

| Check | Expected |
|---|---|
| First response | `201`/`202` with allocation ID and transition ID |
| Repeated exact command | Same allocation/transition result with `idempotentReplay=true` |
| Different payload with same key | `409 IDEMPOTENCY_CONFLICT`; no new side effect |
| Journal count | One allocation journal for this command |
| User liability | Increased exactly once by expected amount |
| Audit | First execution plus replay metadata, no duplicate financial event |

## 8. FV-06 — Single reward allocation

### Source fixture

```json
{
  "sourceSettlementId": "settlement-fv-06",
  "sourceChecksum": "sha256:fv-06",
  "rewardPeriodId": "period-test-001",
  "accountId": "acct-test-001",
  "grossAtomic": "1000000",
  "platformFeeAtomic": "5000",
  "referralCommissionAtomic": "1250",
  "userAllocationAtomic": "993750",
  "referralCodeSnapshot": "MP05",
  "beneficiaryType": "SITE_DONATION_WALLET"
}
```

### Expected

- First import creates exactly one allocation for the unique source/account/period identity.
- The 0.50% standard fee or approved referral calculation is taken from the versioned policy; MP05 beneficiary is donation liability, not user balance.
- Duplicate delivery with same source ID/checksum is acknowledged as duplicate/no-op.
- Same source ID with a different checksum creates a reconciliation exception, not a second allocation.
- Total posted financial lines balance and allocation is traceable to source checksum.

## 9. FV-07 — Application rollback

### Scenario

1. Consumer writes durable outbox/ledger result.
2. Process crashes before acknowledgement.
3. Deployment rolls back to previous compatible image.
4. Consumer restarts and sees the pending event.

### Expected

- Existing journal/allocation remains exactly once.
- Consumer replay checks event ID/idempotency and does not double-credit.
- If event was not committed, retry may commit once.
- If outcome is unknown, state enters recoverable/reconciliation path; no blind second payout.
- Rollback does not alter posted journal, payout reservation, source checksum, or audit history.
- Post-rollback report includes event backlog, processed IDs, ledger trial balance, and unresolved exceptions.

## 10. FV-08 — Reconciliation source

### Matching input

```json
{
  "source": {
    "provider": "upstream-fixture",
    "period": "period-test-001",
    "checksum": "sha256:recon-match",
    "grossAtomic": "1000000",
    "feeAtomic": "5000",
    "userLiabilityAtomic": "995000"
  },
  "internal": {
    "period": "period-test-001",
    "sourceChecksum": "sha256:recon-match",
    "grossAtomic": "1000000",
    "feeAtomic": "5000",
    "userLiabilityAtomic": "995000"
  }
}
```

Expected: reconciliation status `MATCHED`/`CLOSED`, no payout pause, evidence stores both source and internal checksums.

### Mismatch input

Change internal `userLiabilityAtomic` to `994999` or source checksum to `sha256:other`.

Expected:

- Status `MISMATCH`/`EXCEPTION`.
- Affected asset/period/payout scope is held according to policy.
- No manual rounding or forced close.
- Exception contains difference, source/internal refs, owner, severity, created time, and deadline.
- Resolution requires approved correction/reversal; original source and journal remain immutable.

## 11. FV-09 — Payout reservation

### Eligible input

```json
{
  "accountId": "acct-test-001",
  "asset": "BTC",
  "availableReconciledAtomic": "250000",
  "minimumPayoutAtomic": "100000",
  "requestedAtomic": "125000",
  "destinationId": "destination-fv-09",
  "destinationState": "ACTIVE",
  "routeState": "ACTIVE",
  "idempotencyKey": "idem-payout-fv-09"
}
```

### Expected

- Reservation succeeds once for `125000`.
- Available spendable projection becomes `125000`; held amount becomes `125000` according to projection policy.
- A concurrent or replayed request with the same key returns the same reservation.
- A second request that would exceed available reconciled balance is rejected atomically with `INSUFFICIENT_RECONCILED_BALANCE`.
- Pending/immature/unreconciled balance cannot be reserved.
- Inactive destination, wrong network, cooldown, withdrawal lock, payout pause, or failed risk check rejects without changing balance.
- Reservation has expiry, state transition, audit ID, and release/recovery path.
- Reservation release returns funds exactly once; completed payout consumes the reservation exactly once.

## 12. Test execution record

| Field | Value |
|---|---|
| Test run ID | `TBD` |
| Environment | `TBD` |
| Source commit | `TBD` |
| Database/provider fixture version | `TBD` |
| Executed by | `TBD` |
| Executed at UTC | `TBD` |
| Result | `NOT_RUN` |
| Linked evidence | `TBD` |

## 13. Acceptance criteria

- [ ] Semua vector memiliki deterministic input, expected status, amount, state, dan audit outcome.
- [ ] Atomic rollback dibuktikan untuk reject dan dependency failure.
- [ ] Duplicate command/event tests membuktikan no double-credit/double-reservation.
- [ ] Posted entry immutability dan reversal traceability dibuktikan.
- [ ] Reward allocation identity dan source checksum mismatch dibuktikan.
- [ ] Reconciliation mismatch menahan affected scope dan tidak memaksa close.
- [ ] Payout reservation tidak melewati available reconciled balance serta menghormati destination/network/lock/pause.
- [ ] Fixture tidak memakai production secret, full wallet address, atau dana nyata.
- [ ] Implementasi yang memenuhi vectors menautkan test evidence dan commit source pada PR.

No implementation change is authorized by this documentation-only branch.
