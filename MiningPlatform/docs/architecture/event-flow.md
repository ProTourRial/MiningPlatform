# Event Flow

Owner: Abia Nugrahanto  
Status: Accepted baseline

```mermaid
sequenceDiagram
  participant M as Miner
  participant S as Stratum Server
  participant DB as PostgreSQL/Outbox
  participant U as Upstream
  participant R as Redis Stream
  participant P as Mining Projection
  participant W as WebSocket

  M->>S: mining.submit
  S->>S: validate + reserve duplicate
  S->>DB: persist local fact + outbox
  S->>U: mining.submit
  U-->>S: accepted/rejected
  S->>DB: persist upstream decision + outbox
  DB-->>R: outbox dispatcher
  R-->>P: at-least-once delivery
  P->>P: idempotency + state transition
  P->>DB: share/read-model update
  P-->>R: hashrate.updated
  R-->>W: authorized worker room
```

## Failure behavior

- Redis unavailable: outbox remains pending.
- Consumer crash before ACK: message enters pending list and is reclaimed.
- Duplicate event: idempotency returns completed result.
- Unsupported version: event is rejected and eventually dead-lettered.
- Upstream disconnect: affected jobs are invalidated; transparent recovery remains alpha.6 work.
