# Idempotency Standard

## Objective

The platform assumes that network calls, broker deliveries, database transactions, and scheduled jobs can be retried. A repeated request must not create duplicate shares, rewards, journal entries, payouts, broadcasts, or notifications.

## Shared Contract

```ts
export interface IdempotencyService {
  acquire(input: AcquireIdempotencyInput): Promise<AcquireResult>;
  complete(input: CompleteIdempotencyInput): Promise<void>;
  release(input: ReleaseIdempotencyInput): Promise<void>;
  expire(input: ExpireIdempotencyInput): Promise<void>;
}
```

## Record Fields

```text
key
scope
owner
status
requestHash
resultReference
expiresAt
createdAt
updatedAt
completedAt
```

Status values:

```text
ACQUIRED
COMPLETED
RELEASED
EXPIRED
FAILED
```

## Storage

- PostgreSQL stores durable idempotency records for financial and mining facts.
- Redis may provide a short-lived acquisition lock.
- Redis alone is not sufficient for reward, ledger, payout, or wallet operations.

## Key Strategy

| Operation | Suggested key |
|---|---|
| Share submit | `share:{workerId}:{jobId}:{extranonce2}:{ntime}:{nonce}:{versionBits}` |
| Share event consumer | `event:{consumer}:{eventId}` |
| Hashrate bucket | `hashrate:{workerId}:{windowStart}:{windowSeconds}` |
| Reward settlement | `reward:{rewardPeriodId}:{strategyVersion}` |
| Ledger posting | `journal:{sourceType}:{sourceId}:{postingType}` |
| Payout item | `payout:{payoutId}` |
| Wallet broadcast | `broadcast:{walletTransactionId}:{rawTxHash}` |
| Scheduled job | `schedule:{jobName}:{scheduledAt}` |
| Notification | `notification:{channel}:{template}:{subjectId}:{eventId}` |

## Rules

- The same key and request hash return the original result.
- The same key with a different request hash is rejected as a conflict.
- `COMPLETED` records are immutable.
- Financial idempotency records do not expire automatically.
- Locks have a bounded TTL and ownership token.
- Releasing a lock does not delete the durable operation record.
