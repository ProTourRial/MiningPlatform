# Batas MVP dan v0.2.0

## Baseline Platform

- Mining Pool Management Platform.
- BTC dengan algoritma SHA-256 pada fase pertama.
- Upstream pool gateway.
- Hardware universal: CPU, GPU, FPGA, ASIC, hybrid, other, dan unknown; validator aktif tetap BTC/SHA-256.
- Dashboard dan monitoring berdasarkan data mining nyata.
- Double-entry ledger sebagai satu-satunya sumber saldo pengguna.
- Tidak menjual hashrate atau kontrak cloud mining.

## Termasuk dalam v0.2.0

- Worker identity dan production credential foundation.
- Miner session dan Stratum job.
- `mining.configure`, `mining.subscribe`, `mining.authorize`, dan `mining.submit`.
- Relay `mining.set_difficulty`, `mining.set_extranonce`, dan `mining.notify` dari upstream.
- Local SHA-256 share validation.
- Duplicate, stale, malformed, unauthorized, dan low-difficulty detection.
- Share finite state machine.
- Event bus internal dan transactional outbox.
- Idempotency service bersama.
- Share persistence dan upstream result tracking.
- Redis realtime aggregation.
- Worker state dan hashrate windows.
- WebSocket dashboard update.
- PostgreSQL time partitioning dan retention jobs.
- End-to-end Stratum test miner.

## Tidak Termasuk dalam v0.2.0

- Final reward settlement.
- Spendable user balance.
- Ledger posting untuk reward nyata.
- Production Bitcoin wallet RPC.
- UTXO selection, PSBT, signing, atau broadcast.
- Payout Bitcoin nyata.
- Penjualan hashrate.
- Deposit pengguna.
- Exchange atau swap aset.
- Guaranteed FPPS.
- Browser mining.
- Multi-asset aktif.
- Native block-template generation.
- Coinbase transaction construction.
- Independent block propagation.
- Klaim pool luck atau blocks found milik platform.
