# Worker Credential Management

Owner: Abia Nugrahanto  
Status: Alpha foundation

## Format worker

Miner menggunakan username:

```text
<mining-account-username>.<worker-name>
```

Password Stratum adalah worker credential secret, bukan password akun website.

## Create

```bash
pnpm worker:credential create demo.worker1
```

Dengan expiry:

```bash
pnpm worker:credential create demo.worker1 --expires-at=2027-01-01T00:00:00Z
```

Secret hanya muncul satu kali pada stdout. Simpan pada password manager atau konfigurasi miner yang aman.

## Rotate

```bash
pnpm worker:credential rotate demo.worker1
```

Rotation mencabut seluruh credential aktif lama dan membuat satu credential baru.

## Revoke

```bash
pnpm worker:credential revoke wc_exampleCredentialId
```

## Production configuration

```env
STRATUM_DEV_MODE=false
STRATUM_AUTH_DRIVER=postgres
STRATUM_AUTH_MAX_FAILURES=5
STRATUM_AUTH_WINDOW_MS=60000
STRATUM_AUTH_LOCK_MS=900000
EVENT_STORE_DRIVER=postgres
EVENT_BUS_DRIVER=redis
```

## Rules

- Jangan memakai password akun website sebagai secret worker.
- Jangan menyimpan secret di Git, log, ticket, atau event payload.
- Rotation setelah indikasi kebocoran harus disertai audit session aktif.
- Production multi-replica wajib menggunakan Redis rate limiter.
- `Worker.passwordHash` adalah field legacy dan bukan sumber autentikasi production alpha.5.
