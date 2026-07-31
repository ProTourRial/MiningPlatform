# Data Flow

Owner: Abia Nugrahanto  
Status: Accepted baseline

## Worker authentication

```text
Miner
  -> mining.subscribe
  -> mining.authorize(account.worker, secret)
  -> Stratum Authenticator
  -> PostgreSQL WorkerCredential lookup
  -> scrypt verify
  -> Redis rate-limit check
  -> AuditLog success/failure
  -> MinerSession authorized or rejected
```

Plaintext secret hanya berada pada request memory selama verifikasi dan tidak ditulis ke log, event, database, atau metrics.

## Share processing

```text
Miner submit
  -> protocol validation
  -> active job lookup
  -> duplicate reservation
  -> SHA-256d validation
  -> durable event/outbox
  -> upstream submit
  -> upstream decision
  -> mining projection
  -> hashrate bucket
  -> authorized WebSocket room
```

## Accounting boundary

```text
UPSTREAM_ACCEPTED share facts
  -> contribution aggregation
  -> upstream reconciliation
  -> reward allocation
  -> balanced journal posting
  -> balance projection
  -> payout eligibility
```

Tidak ada jalur langsung dari Stratum atau wallet ke user balance.
