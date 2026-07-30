# Domain State Machines

Enums describe state. Transition guards control lifecycle.

## Share

```text
RECEIVED
  ↓
VALIDATING
  ├── LOCAL_REJECTED
  └── LOCAL_ACCEPTED
          ↓
     UPSTREAM_PENDING
       ├── UPSTREAM_ACCEPTED
       ├── UPSTREAM_REJECTED
       └── UPSTREAM_TIMEOUT
```

Terminal states:

- `LOCAL_REJECTED`
- `UPSTREAM_ACCEPTED`
- `UPSTREAM_REJECTED`

`UPSTREAM_TIMEOUT` may transition back to `UPSTREAM_PENDING` through a controlled retry.

## Miner Session

```text
CONNECTING
  ↓
SUBSCRIBED
  ↓
AUTHORIZED
  ├── ACTIVE
  ├── DEGRADED
  └── DISCONNECTED
```

A session cannot submit a share before `AUTHORIZED`.

## Reward Period

```text
OPEN
  ↓
CLOSING
  ↓
CALCULATING
  ↓
RECONCILING
  ├── RECONCILED
  └── FAILED

RECONCILED
  ↓
POSTING
  ↓
CLOSED
```

## Payout

```text
QUEUED
  ↓
REVIEW
  ↓
APPROVED
  ↓
BATCHED
  ↓
SIGNING
  ↓
SIGNED
  ↓
BROADCAST
  ↓
CONFIRMING
  ├── COMPLETED
  ├── REPLACED
  └── FAILED
```

## Wallet Transaction

```text
DRAFT
  ↓
FUNDED
  ↓
APPROVAL_PENDING
  ↓
APPROVED
  ↓
SIGNED
  ↓
BROADCAST
  ↓
CONFIRMING
  ├── CONFIRMED
  ├── REPLACED
  └── FAILED
```

## Implementation Rule

Each state machine defines:

- allowed source states;
- target state;
- required actor or service;
- required invariants;
- emitted event;
- audit action;
- retry behavior.

Repositories may persist an approved transition. They may not decide whether the transition is valid.
