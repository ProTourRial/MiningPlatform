# Financial Truth Runbook

Status: alpha.6 internal accounting and reconciliation only. Payouts and real-funds operations remain disabled.

## Preconditions

- Database schema version 12 is deployed.
- `accounting-worker` and `outbox-worker` are healthy.
- The upstream pool and BTC asset exist in the database.
- The operator is an active, verified `OWNER` with TOTP enabled.
- `AUTH_ENCRYPTION_KEY` is loaded from the deployment secret store.

## Settlement input

Use an immutable JSON export from the selected provider:

```json
{
  "importIdempotencyKey": "provider:statement:2026-08-16T01:00Z",
  "sourceReference": "provider-statement-12345",
  "asset": "BTC",
  "upstreamPoolKey": "primary-btc",
  "periodStart": "2026-08-16T00:00:00.000Z",
  "periodEnd": "2026-08-16T01:00:00.000Z",
  "grossAtomic": "100000",
  "upstreamFeeAtomic": "1000",
  "networkFeeAtomic": "0",
  "receivedAtomic": "99000",
  "toleranceAtomic": "0"
}
```

Keep the source file unchanged after import. MiningPlatform stores its SHA-256 checksum.

## Import

```powershell
$env:SETTLEMENT_OPERATOR_TOTP='<current six-digit code>'
pnpm settlement:import --file=<absolute-json-path> --operator-email=<owner-email> --confirm=import:<sourceReference>
Remove-Item Env:SETTLEMENT_OPERATOR_TOTP
```

Expected outcomes:

- `MATCHED`: the outbox publishes `reward.settlement.imported.v1`; accounting may proceed.
- `EXCEPTION`: no allocation or journal is posted. Preserve the source and investigate the variance.
- duplicate: the existing reconciliation is returned only if source reference and checksum match.
- idempotency conflict: stop and investigate; never change the database directly.

Alpha.6 requires `toleranceAtomic=0`. An exception remains non-posting until corrected evidence is requested by one verified OWNER and approved by a different verified OWNER. Approval resolves the original immutable exception, creates a new exact `MATCHED` reconciliation, and emits the settlement event once.

## Reversal

```powershell
$env:SETTLEMENT_OPERATOR_TOTP='<current six-digit code>'
pnpm journal:reverse --journal-entry-id=<posted-journal-id> --operator-email=<owner-email> --reason='<at least 10 characters>' --confirm=reverse:<posted-journal-id>
Remove-Item Env:SETTLEMENT_OPERATOR_TOTP
```

The command creates a balanced equal-and-opposite journal, marks the original as `REVERSED`, writes an audit record, and emits an outbox event. It never modifies journal lines.

## Verification

The accounting reconciliation identity is evaluated in atomic units:

`received source = sum(user net allocations) + sum(charged platform fees) + clearing residual`

For referral allocations, also verify:

`charged platform fee = referral beneficiary commission + retained platform revenue`

The authoritative rates are 5,000 PPM standard, 3,750 PPM with a valid referral, and 1,250 PPM referral commission. `MP05` must credit the site-donation referral liability; it must not create a payout or invent a wallet address.

The clearing residual must be zero after a fully allocated matched period. Provider and network
costs are reconciled separately by `upstream gross = upstream fee + network fee + received source`.
Every posted or reversed journal must balance per asset in both decimal and atomic representations.

```powershell
pnpm verify:migration:v030-alpha6:fresh
pnpm verify:migration:v030-alpha6:upgrade
pnpm test:integration:accounting
pnpm test:integration:reconciliation
```

Authenticated users may inspect their data through:

- `GET /api/v1/rewards`
- `GET /api/v1/rewards/periods/:rewardPeriodId`
- `GET /api/v1/ledger/balances`
- `GET /api/v1/ledger/entries`

Required API-key scopes are `rewards:read` and `ledger:read`.

## Auto withdrawal preference

- `GET /api/v1/payouts/preferences` returns the preference and its current blockers.
- `PATCH /api/v1/payouts/preferences/:miningAccountId` with `{ "enabled": true|false }` changes only the authenticated user's account.
- The database default is `OFF`.
- `ON` is not an execution authorization. The scheduler must still require `PAYOUTS_ENABLED=true`, an active verified destination, minimum payout, available reserved balance, wallet health, idempotency, and all operational approval gates.
