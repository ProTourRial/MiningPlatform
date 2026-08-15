# Financial Truth Runbook

Status: alpha.5 internal accounting only. Payouts and real-funds operations remain disabled.

## Preconditions

- Database schema version 10 is deployed.
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

Alpha.5 requires `toleranceAtomic=0`. An exception has no operator override path in this release. Correct provider evidence and a reviewed exception-resolution workflow are required before that gate can close.

## Reversal

```powershell
$env:SETTLEMENT_OPERATOR_TOTP='<current six-digit code>'
pnpm journal:reverse --journal-entry-id=<posted-journal-id> --operator-email=<owner-email> --reason='<at least 10 characters>' --confirm=reverse:<posted-journal-id>
Remove-Item Env:SETTLEMENT_OPERATOR_TOTP
```

The command creates a balanced equal-and-opposite journal, marks the original as `REVERSED`, writes an audit record, and emits an outbox event. It never modifies journal lines.

## Verification

```powershell
pnpm verify:migration:v030-alpha5:fresh
pnpm verify:migration:v030-alpha5:upgrade
pnpm test:integration:accounting
```

Authenticated users may inspect their data through:

- `GET /api/v1/rewards`
- `GET /api/v1/rewards/periods/:rewardPeriodId`
- `GET /api/v1/ledger/balances`
- `GET /api/v1/ledger/entries`

Required API-key scopes are `rewards:read` and `ledger:read`.
