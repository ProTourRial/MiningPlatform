# Hardening v0.2.0-alpha.2

## Tujuan

Rilis ini memperbaiki risiko build, durability, tenant leakage, data retention, dan deployment yang ditemukan pada audit `v0.2.0-alpha.1`. Rilis ini tidak menambahkan upstream mining functionality.

## Keputusan utama

### Durable intake

Pada mode production, Stratum menyimpan domain event ke PostgreSQL `OutboxEvent` sebelum mengirim respons sukses kepada miner. Outbox worker memublikasikan event ke Redis Stream setelah commit database.

```text
validate share
  ↓
reserve fingerprint in Redis
  ↓
insert PostgreSQL outbox event
  ↓
return local accepted
  ↓
outbox worker publishes Redis event
```

Outbox memiliki status `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`, dan `DEAD_LETTER`. Claim lama dipulihkan berdasarkan lock timeout.

### Event recovery

Redis Stream consumer memakai consumer group, `XAUTOCLAIM`, delivery-attempt counter, maksimum retry, dead-letter stream, dan isolasi payload yang tidak dapat diparse. Satu event gagal tidak menghentikan consumer loop.

### Duplicate share

Redis `SET NX EX` menjadi reservation cepat lintas replica. PostgreSQL `ShareFingerprint.fingerprint` tetap menjadi unique constraint sebagai pertahanan durable pada projection.

### Idempotent projection

Mining projection memakai kontrak `TransactionalIdempotencyService`. Event `COMPLETED` dilewati. Konflik payload dan record aktif menghasilkan error agar event dapat dicoba ulang. Realtime event hanya dipublikasikan ketika projection benar-benar memproses event.

### Hashrate buckets

Accepted difficulty disimpan dalam bucket 60 detik. Snapshot rolling dibuat untuk 60, 300, 900, 3600, dan 86400 detik. Pendekatan ini menggantikan query seluruh share lima menit pada setiap submission.

### Historical integrity

User, mining account, dan worker memakai soft-delete. Relasi historis mining memakai `RESTRICT`, bukan cascade. Ledger dilindungi constraint dan deferred trigger pada PostgreSQL.

### Dashboard boundary

Dashboard dan WebSocket saat ini hanya untuk development. Production runtime menolak akses. Development client harus mengirim token dan hanya dapat bergabung ke room worker development yang dikonfigurasi.

### Deployment boundary

Base Docker Compose tidak membuka PostgreSQL, Redis, MinIO, Prometheus, atau Grafana ke host. Compose development membuka port hanya pada `127.0.0.1`. Setiap service menerima environment variable terbatas.

## Yang belum diselesaikan

- upstream fixture dan byte-order compatibility;
- upstream connector;
- production worker authentication;
- multi-job registry;
- transactional share row plus outbox dalam satu domain transaction;
- upstream acceptance lifecycle;
- integration dan load tests;
- reward settlement, wallet, dan payout.
