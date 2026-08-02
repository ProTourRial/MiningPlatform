# Bounded Contexts

Owner: Abia Nugrahanto  
Status: Accepted baseline  
Version: 0.3.0-alpha.1

| Context | Tanggung jawab | Tidak boleh melakukan | Deployment saat ini |
|---|---|---|---|
| Identity and Access | akun, session web, 2FA, RBAC | memvalidasi share | `api` (future implementation) |
| Worker Management | worker CRUD, credential lifecycle, ownership | menerima `mining.submit` | `api` dan CLI sementara |
| Mining Sessions | koneksi Stratum dan session state | menghitung saldo | `stratum-server` |
| Share Processing | validasi SHA-256d, duplicate, stale, state share | posting ledger | `stratum-server`, `mining-worker` |
| Upstream Pool Management | koneksi, job, submit, keputusan upstream | membuat reward final | `stratum-server` |
| Hardware Management | profil CPU/GPU/FPGA/ASIC/hybrid dan capability | menentukan algoritma hanya dari hardware | `miner-detection`, monitoring |
| Monitoring | worker state, hashrate, telemetry, alert | menjadi sumber reward | `mining-worker`, `api` |
| Reward Accounting | contribution, period, reconciliation, allocation | broadcast transaksi | future `reward-engine` |
| Ledger | journal seimbang dan balance projection | menerima mutasi langsung dari wallet | `ledger`, future worker |
| Wallet and Payout | policy, PSBT, signing, broadcast, confirmations | mengedit user balance | `wallet-worker` scaffold |
| Notifications | email/Telegram/Discord/webhook delivery | mengambil keputusan domain | future notification service |
| Transparency | statistik publik agregat dan tertunda | membuka data privat | `api`, `web` |
| Owner Operations | maintenance, emergency stop, approvals, audit | menghapus fakta historis | future owner module |

## Shared kernel

Shared kernel dibatasi pada:

- event envelope dan event names;
- identifier dan primitive value types;
- validation schema yang stabil;
- security hashing helpers;
- state-machine contract;
- idempotency contract.

Business rule reward, share, wallet, atau RBAC tidak boleh ditempatkan di `shared`.
