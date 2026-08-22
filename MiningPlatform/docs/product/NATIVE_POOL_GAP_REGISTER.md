# MiningPlatform Native Pool Gap Register

- **Status:** Active engineering register
- **Date:** 2026-08-22
- **Authority:** [`../../PROJECT_VISION.md`](../../PROJECT_VISION.md)
- **Related:** [`PRODUCTION_GAP_REGISTER.md`](PRODUCTION_GAP_REGISTER.md),
  [`../adr/0015-randomx-validation-and-upstream-boundary.md`](../adr/0015-randomx-validation-and-upstream-boundary.md)

## Purpose

Dokumen ini mengubah sasaran “menjadi mining pool” menjadi gap dan acceptance evidence yang dapat
dibuktikan. Fondasi gateway upstream tetap berguna sebagai jalur transisi dan fallback, tetapi tidak
dianggap sebagai native pool Bitcoin.

Status implementasi harus dibaca dari exact branch. Daftar masukan owner direkalibrasi terhadap
source saat ini: PSBT builder, signer terisolasi, approval/reservation, dan Bitcoin RPC foundation
sudah tersedia, tetapi durable execution, real credentials, broadcast recovery, confirmation, dan
final reconciliation belum lengkap. Karena itu real funds tetap nonaktif.

## Priority register

| Priority | Gap                                                         | Dampak                                                        | Exit evidence minimum                                                                                                  |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| P0       | Bitcoin Core belum menjadi sumber native mining job         | Platform belum mengendalikan pekerjaan mining                 | Regtest `getblocktemplate` dengan freshness, node sync, capability, dan failover checks                                |
| P0       | Belum ada block-template dan coinbase builder               | Tidak dapat membuat job yang membayar reward pool             | Deterministic coinbase/merkle/header builder dengan exact value, script, witness commitment, dan byte fixtures         |
| P0       | Belum ada native block-candidate dan `submitblock` pipeline | Tidak dapat mengirim blok hasil miner                         | Valid candidate reconstruction, pre-submit validation, `submitblock`, duplicate/reject evidence, dan correlation trace |
| P0       | Reward utama masih `FOLLOW_UPSTREAM`                        | Pendapatan dan settlement bergantung pada upstream            | Native `PoolRound` dari block evidence sampai reward period tanpa laporan settlement upstream                          |
| P0       | Payout nyata belum menyelesaikan durable execution          | Saldo belum dapat dibayarkan dengan bukti end-to-end          | Reservation → approval → encrypted PSBT → isolated signer → broadcast → confirmation → reconciliation                  |
| P1       | Belum ada reward scheme native                              | Reward blok pool belum dapat dibagi                           | PPLNS dan/atau PROP specification, deterministic scoring, rounding, retry, reversal, dan invariant ledger              |
| P1       | Belum ada maturity, orphan, dan reorg lifecycle             | Reward dapat diakui terlalu awal atau salah                   | Immature/mature/orphan/reorg state machine driven by authoritative chain observations                                  |
| P1       | Stratum belum memiliki bukti kapasitas produksi             | Miner publik dapat mengalami reject, latency, atau disconnect | Load, stress, soak, latency percentile, backpressure, reconnect, dan capacity envelope                                 |
| P1       | Extranonce belum dikoordinasikan global                     | Multi-replica dapat menduplikasi ruang kerja                  | Durable globally unique allocation/lease with restart, partition, and expiry tests                                     |
| P1       | VarDiff produksi belum lengkap                              | Difficulty miner tidak optimal/stabil                         | Statistical retarget validation per device and algorithm with upstream/native floors                                   |
| P1       | PostgreSQL, Redis, dan node belum memiliki bukti HA         | Satu gangguan dapat menghentikan pool                         | Failover, backup/restore, PITR, measured RPO/RTO, and disaster-recovery evidence                                       |
| P1       | DDoS dan abuse protection Stratum belum lengkap             | Endpoint TCP publik rentan disalahgunakan                     | Connection/share limits, reputation/ban controls, SYN/edge protection, and attack tests                                |
| P2       | Belum ada pool reserve                                      | PPS/FPPS dapat menciptakan insolvency                         | Capital policy, reserve ledger, variance model, exposure limits, and stress tests                                      |
| P2       | Compliance/legal readiness belum selesai                    | Custody dan payout publik belum layak diaktifkan              | Jurisdictional legal, tax, privacy, KYC/AML, sanctions, terms, and custody decisions                                   |
| P2       | Pool-specific monitoring belum lengkap                      | Operator tidak melihat risiko pool secara utuh                | Pool luck, template age, node divergence, propagation, maturity, reserve, and liability SLOs                           |

## Native Bitcoin mining path

Alur gateway yang tersedia:

```text
Miner → MiningPlatform → Upstream pool → Bitcoin network
```

Alur native yang wajib dibuktikan:

```text
Bitcoin Core
  → getblocktemplate
  → deterministic coinbase transaction
  → merkle root and native mining job
  → miner submission and local share validation
  → block-candidate reconstruction
  → submitblock
  → confirmation, maturity, orphan, and reorg observation
```

Tidak satu pun blok, reward, atau saldo boleh dibuat hanya dari klaim aplikasi. Sumber kebenaran native
harus memiliki RPC response digest, node/tip identity, template time, block/header identity, dan chain
observation evidence.

## Accounting and reward gaps

Fondasi contribution, idempotency, fee snapshot, double-entry journal, reversal, dan reconciliation
sudah ada untuk `FOLLOW_UPSTREAM`. Native accounting masih memerlukan:

1. `PoolRound` yang terikat asset, network, algorithm, template lineage, previous block, dan status.
2. Immutable native share scoring yang tidak mencampur share upstream dan native.
3. Native block record dengan submitted/accepted/confirmed/immature/mature/orphan/reorg states.
4. Coinbase decomposition yang membuktikan subsidy + transaction fees + pool outputs.
5. PPLNS/PROP allocation dari immutable score window; PPS/FPPS dilarang sebelum reserve disetujui.
6. Reversal/correction journal untuk orphan dan reorg tanpa mengedit entry yang sudah posted.
7. Rekonsiliasi exact antara coinbase UTXO, wallet asset, user allocation, platform fee, clearing,
   network fee, reserve, dan liability.

## Fee-policy gaps

Fee awal tetap **0,5%**, diskon referral **0,375%**, dan referral commission **0,125% dari gross**.
Sebelum native settlement:

- environment variable dan field tampilan tidak boleh menjadi sumber perhitungan;
- resolver settlement harus memakai versioned policy yang efektif untuk asset, algorithm, network,
  campaign, referral, account tier, dan account scope;
- resolved policy dan rate harus disimpan sebagai immutable allocation snapshot;
- control plane membutuhkan maker-checker untuk draft, approve, activate, supersede, dan stop;
- historical settlement tidak boleh berubah ketika policy baru diaktifkan.

## Wallet and payout gaps

Source saat ini memiliki watch-only Bitcoin RPC/PSBT foundation, isolated transaction signer,
reservation, approval, encrypted-artifact primitive, dan disabled-by-default gates. Yang masih wajib:

- durable wallet-worker orchestration dan signer request evidence;
- explicit wallet-to-ledger binding, descriptor import/verification, dan hot/cold policy;
- UTXO inventory, lock recovery, coin selection, batching, and fee estimation policy;
- persisted encrypted unsigned/signed artifacts yang tidak dapat dibaca API;
- mempool preflight, broadcast recovery, RBF/replacement policy, confirmation/reorg watcher;
- exact wallet-to-ledger reconciliation and emergency-stop drills;
- real custody technology, credentials, approvers, limits, and external security approval.

## Infrastructure, security, and operations gaps

- Redundant Bitcoin nodes with divergence detection and controlled primary selection.
- Regional Stratum endpoints and TCP load balancing with session/job coordination.
- PostgreSQL/Redis HA, backup, PITR, restore, and disaster-recovery drills.
- Load, stress, soak, partition, latency, and chaos testing with published capacity limits.
- Managed secrets, external security audit, penetration test, and dependency/image provenance.
- Wallet-compromise, payout maker-checker, incident-response, and recovery procedures.
- Daily liability and wallet reconciliation with owner-visible exceptions.
- 24/7 SLO, alerts, routing, on-call ownership, and public incident communication policy.

## Native mining laboratory acceptance path

Tahap pertama menggunakan Bitcoin regtest dan dana disposable. Satu trace kanonis harus membuktikan:

```text
getblocktemplate
→ coinbase and native job
→ miner receives work
→ valid share and block candidate
→ submitblock accepted by Bitcoin Core
→ confirmations generated
→ maturity reached
→ native reward allocation
→ versioned platform fee
→ balanced immutable ledger
→ coinbase/wallet/liability reconciliation
```

Acceptance invariants:

- template/job/share/block correlation dapat ditelusuri end-to-end;
- retry tidak membuat duplicate block, round, allocation, journal, atau credit;
- setiap journal balance dan posted entry immutable;
- orphan/reorg membuat bukti dan reversal baru;
- reward tidak spendable sebelum maturity;
- source value sama dengan user allocation + platform/referral fee + clearing/reserve components;
- semua failure path fail closed dan tidak menciptakan payout;
- fresh dan representative upgrade migration, unit, integration, Docker E2E, dan failure-injection gates
  lulus sebelum scope berpindah dari regtest.

## Production prohibition

Kelulusan regtest tidak mengizinkan mainnet mining custody atau payout publik. Mainnet membutuhkan node,
capacity, signer/custody, HA, DDoS, legal/compliance, external audit, operational approver, dan controlled
funds evidence yang disetujui terpisah.
