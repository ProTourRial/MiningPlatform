# Service Boundaries

Domain dipisahkan secara logis sejak awal. Deployment fisik tetap terbatas agar kompleksitas MVP terkendali.

| Deployment | Tanggung jawab |
|---|---|
| web | Landing, dashboard, transparency, owner UI privat |
| api | Auth, users, workers, ledger query, payout query, configuration |
| stratum-server | Miner TCP connection, protocol, auth, relay, share intake |
| mining-worker | Share processing, aggregation, reward period, reconciliation |
| wallet-worker | Payout preparation, signing integration, broadcast, confirmation |
| scheduler | Scheduled jobs dan retention |
| monitoring-agent | Telemetri perangkat melalui koneksi keluar |

Microservice tambahan dibuat setelah terdapat kebutuhan scaling, isolation, atau ownership yang terukur.
