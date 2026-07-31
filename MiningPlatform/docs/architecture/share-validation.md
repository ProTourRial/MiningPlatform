# Bitcoin Share Validation

## Input

Validator menerima konteks session, worker yang telah diautentikasi, mining job aktif, dan parameter `mining.submit`.

```text
worker_name
job_id
extranonce2
ntime
nonce
version_bits optional
```

## Urutan Validasi

1. Cocokkan worker submit dengan worker yang terikat pada session.
2. Pastikan job dikenal dan belum kedaluwarsa.
3. Validasi panjang dan format hexadecimal.
4. Validasi version bits terhadap version rolling mask jika digunakan.
5. Pastikan `ntime` tidak lebih kecil dari job time dan tidak terlalu jauh di masa depan.
6. Buat fingerprint share dan reservasi duplicate key.
7. Bangun coinbase dari `coinbase1 + extranonce1 + extranonce2 + coinbase2`.
8. Hitung coinbase hash dan merkle root.
9. Bangun header Bitcoin 80 byte.
10. Hitung double SHA-256.
11. Bandingkan hash dengan target difficulty worker.
12. Bandingkan hash dengan network target untuk menandai block candidate.

## Fingerprint

```text
SHA256(
  worker_id :
  job_id :
  extranonce2 :
  ntime :
  nonce :
  version_bits
)
```

Fingerprint harus memiliki unique constraint pada database. Redis atau memory cache hanya menjadi lapisan cepat. Database tetap menjadi pengaman final terhadap duplikasi.

## State

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

Alpha.3 dan sesudahnya menjalankan state upstream melalui simulator/TCP adapter. Provider production, failover, dan session recovery masih memerlukan validasi lanjutan.
