# MiningPlatform Roadmap

Author: Abia Nugrahanto

## Release sequence

```text
v0.2.0  Core Mining and Upstream Foundation
    ↓
v0.3.0  Identity & Access
    ↓
v0.3.1  Monitoring and Notification Foundation
    ↓
v0.4.0  Accounting, Ledger, and Settlement
    ↓
v0.5.0  Wallet and Secure Payout
    ↓
v0.6.0  Transparency and Owner Operations
    ↓
v1.0.0  Production-Ready Upstream Gateway
```

## Current checkpoint: v0.3.0 — Identity & Access

Implemented foundation:

- user registration and email verification;
- login/logout and short-lived JWT access tokens;
- rotating refresh-token sessions;
- session device inventory and revoke one/all;
- forgot/reset/change password;
- TOTP and one-time backup codes;
- permission-based RBAC and ownership enforcement;
- user profile and settings;
- worker CRUD, status, statistics, and universal hardware declaration;
- worker credential lifecycle;
- API key lifecycle management;
- user audit log;
- production dashboard read model;
- authentication rate limiting;
- schema version 7 and migration verification scripts.

Release blockers:

- production email delivery adapter;
- generated Prisma Client and fresh/upgrade migration verification;
- PostgreSQL/Redis integration tests;
- Docker/Nginx verification;
- API-key authentication guard;
- owner operations UI;
- load and security tests.

## v0.3.1 — Monitoring and Notifications

- authenticated WebSocket tenant isolation for production workers;
- monitoring-agent enrollment;
- telemetry ingestion and retention;
- worker alerts and incidents;
- email/Telegram/Discord/webhook provider adapters;
- notification preference and retry lifecycle;
- operational dashboards and alert rules.

## v0.4.0 — Accounting, Ledger, and Settlement

- upstream reconciliation;
- contribution aggregation;
- FOLLOW_UPSTREAM reward period lifecycle;
- automatic balanced journal posting;
- reward liability and platform fee accounts;
- balance projection;
- reconciliation reports and controlled adjustments.

## v0.5.0 — Wallet and Secure Payout

- Bitcoin node and watch-only wallet adapter;
- UTXO inventory, locking, coin selection, fee estimation;
- payout batching and idempotency;
- PSBT and approval workflow;
- hot/cold wallet policy;
- broadcast, RBF, confirmation, and ledger settlement.

## v0.6.0 — Transparency and Owner Operations

- public delayed statistics;
- Owner user/worker/pool operations;
- maintenance and emergency controls;
- wallet approval;
- immutable security event review;
- backup/restore and disaster recovery workflows.

## v1.0.0 — Production Ready

- captured provider fixtures;
- capacity, load, soak, stress, and chaos tests;
- security assessment;
- multi-replica durability;
- observability and on-call runbooks;
- disaster recovery exercise;
- operational approval for real funds.
