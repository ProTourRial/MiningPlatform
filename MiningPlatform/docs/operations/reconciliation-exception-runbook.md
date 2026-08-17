# Reconciliation Exception Runbook

Owner: Financial Operations  
Scope: Financial Truth P0.3  
Safety: This workflow does not enable payouts or create balances.

## Invariants

- The ledger is the only balance source.
- Every mutation requires an interactive ADMIN/OWNER session with TOTP enabled.
- API keys cannot execute financial operations.
- Every mutation requires `Idempotency-Key`; clients should also send `X-Correlation-Id`.
- Maker, checker, and executor are different duties. The opener/submitter cannot approve, and the approver cannot resolve.
- `LEDGER_ADJUSTMENT` requires an existing `POSTED` journal entry whose `referenceType` is `RECONCILIATION_EXCEPTION`, whose `referenceId` is the exception ID, and whose lines use the reconciliation asset.
- A resolution never edits a cached or projected balance.

## State flow

```text
OPEN -> PENDING_APPROVAL -> APPROVED -> RESOLVED
                           |
                           -> REJECTED -> PENDING_APPROVAL
```

Each write supplies `expectedVersion`. A stale version returns conflict and the operator must reload the exception before deciding whether to retry.

## API sequence

```text
POST /api/v1/reconciliation/{reconciliationId}/exceptions
POST /api/v1/reconciliation/exceptions/{exceptionId}/submit
POST /api/v1/reconciliation/exceptions/{exceptionId}/approve
POST /api/v1/reconciliation/exceptions/{exceptionId}/reject
POST /api/v1/reconciliation/exceptions/{exceptionId}/resolve
GET  /api/v1/reconciliation/exceptions/{exceptionId}
GET  /api/v1/reconciliation/exceptions?status=PENDING_APPROVAL
```

Reusing an idempotency key with the same actor and payload returns the original result with `replayed: true`. Reusing it with a different request returns conflict.

## Operator procedure

1. Open the exception from the provider reconciliation and attach a concise proposed resolution.
2. Submit after evidence is complete. Record the returned correlation ID in the incident or settlement report.
3. A separate checker verifies provider source reference, amounts, fee, asset, period, and evidence before approving or rejecting.
4. If a ledger adjustment is needed, post and independently verify the balanced journal before resolution. Never manufacture a journal merely to satisfy the workflow.
5. A separate executor confirms the approved external/internal action and resolves the exception.
6. Verify the exception action history, `AuditLog`, outbox delivery, upstream reconciliation status, and reward-period reconciliation status.

## Failure and retry

- Timeout/connection loss: retry the exact request with the same idempotency key.
- HTTP conflict with `replayed: false`: reload the exception; another replica/operator won the version race.
- Rejected proposal: revise the proposed resolution and submit using the current version and a new idempotency key.
- Outbox delivery failure: do not repeat the financial mutation. Recover the outbox event using its existing idempotency key.
- Database failover/serialization error: the API retries a bounded number of times; after exhaustion, retry the request unchanged.

## Evidence query

For each exception, preserve:

- reconciliation and provider source reference;
- all immutable exception actions and actors;
- correlation and idempotency keys;
- matching audit and outbox records;
- linked posted journal, if any;
- final operator report explaining why the ledger was or was not adjusted.

`PAYOUTS_ENABLED=false` remains mandatory throughout this phase.
