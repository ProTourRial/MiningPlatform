# ADR-0007: Production Miner Identity

Status: Accepted  
Date: 2026-07-31  
Owner: Abia Nugrahanto

## Context

Password development berbasis environment tidak dapat digunakan untuk miner produksi. Worker membutuhkan credential yang dapat dibuat, dirotasi, dicabut, dikunci, dan diaudit tanpa menyimpan plaintext.

## Decision

- Identitas Stratum memakai format `miningAccount.worker`.
- Secret worker disimpan sebagai versioned scrypt hash pada `WorkerCredential`.
- Secret hanya ditampilkan sekali saat pembuatan atau rotasi.
- Production authenticator membaca PostgreSQL, memeriksa status user/account/worker/credential, dan memakai Redis rate limit.
- Authentication success dan failure ditulis ke audit log tanpa raw IP atau plaintext secret.
- `STRATUM_AUTH_DRIVER=development` ditolak di production.

## Consequences

- Credential legacy `Worker.passwordHash` tidak digunakan oleh production authenticator dan akan dihapus melalui migration terpisah setelah Control Plane tersedia.
- Multi-replica rate limit bergantung pada Redis.
- Worker credential management sementara tersedia melalui CLI sampai API production dibuat.
