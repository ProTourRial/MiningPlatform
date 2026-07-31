# Domain Architecture MiningPlatform

Owner: Abia Nugrahanto  
Status: Accepted baseline  
Version: 0.2.0-alpha.6

## Tujuan

Dokumen ini menetapkan pemisahan domain resmi agar mining intake, website, accounting, event delivery, monitoring, dan operasi tidak saling mengubah data secara langsung.

## Plane

```text
MiningPlatform
├── Control Plane
│   ├── Identity and Access
│   ├── User and Company
│   ├── Worker Management
│   ├── API Keys
│   └── Owner Operations
├── Mining Plane
│   ├── Stratum Sessions
│   ├── Worker Authentication
│   ├── Share Validation
│   ├── Job Lifecycle
│   ├── Upstream Pool Gateway
│   └── Hardware Identity
├── Accounting Plane
│   ├── Contribution
│   ├── Reward Period
│   ├── Settlement
│   ├── Double-Entry Ledger
│   ├── Wallet Orchestration
│   └── Payout
├── Event Plane
│   ├── Domain Event Contracts
│   ├── Transactional Outbox
│   ├── Redis Stream Transport
│   ├── Idempotency
│   └── Retry and Dead Letter
├── Monitoring Plane
│   ├── Hashrate Projection
│   ├── Worker State
│   ├── Device Telemetry
│   ├── Analytics
│   └── Transparency Read Models
└── Operations Plane
    ├── Scheduler
    ├── Health and Metrics
    ├── Audit and Security Events
    ├── Backup and Restore
    └── Maintenance Controls
```

## Aturan ketergantungan

1. Control Plane tidak memvalidasi share dan tidak menghitung reward.
2. Mining Plane tidak mengubah saldo pengguna.
3. Accounting Plane hanya menerima fakta mining yang sudah durable dan tervalidasi.
4. Wallet tidak pernah mengubah saldo secara langsung; saldo berasal dari ledger.
5. Event Plane membawa fakta lintas domain dengan delivery `at-least-once`; consumer wajib idempotent.
6. Monitoring Plane membangun read model dan tidak menjadi sumber kebenaran reward.
7. Operations Plane boleh menghentikan proses, tetapi tidak boleh mengedit fakta historis.

## Source of truth

| Data | Source of truth |
|---|---|
| User, worker, credential | PostgreSQL Control Plane |
| Session, job, share | PostgreSQL Mining Plane |
| Event yang belum dipublikasikan | PostgreSQL Outbox |
| Delivery event | Redis Streams |
| Reward dan kewajiban | PostgreSQL Accounting Plane |
| Saldo | Double-entry ledger projection |
| Realtime dashboard | Redis/read model; bukan ledger |
| Device telemetry | PostgreSQL time-series/read model |

## Deployment saat ini

Logical plane tidak berarti satu microservice per context. Pada alpha.5, beberapa bounded context masih berada dalam deployment yang sama. Pemisahan fisik dilakukan setelah throughput, security isolation, atau ownership membutuhkannya.
