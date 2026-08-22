# MiningPlatform Production Gap Register

- Status: Active engineering register
- Authority: [`../../PROJECT_VISION.md`](../../PROJECT_VISION.md)
- Implementation policy: [`PRODUCT_CONSTITUTION.md`](PRODUCT_CONSTITUTION.md)
  Baseline audited: 2026-08-22 (`0.3.0-alpha.7` workspace)

## Purpose

Dokumen ini mengubah Project Vision menjadi daftar gap yang dapat ditutup dan diverifikasi. Sebuah item hanya boleh berstatus `COMPLETE` jika source, migration, automated test, operational evidence, dan documentation yang relevan tersedia. Model/interface/controller kosong tidak dihitung sebagai implementasi.

Status:

- `COMPLETE`: acceptance criteria dan evidence lulus.
- `IN_PROGRESS`: implementasi aktif tetapi gate belum lengkap.
- `FOUNDATION`: schema/interface atau sebagian alur tersedia; belum production-capable.
- `BLOCKED_EXTERNAL`: memerlukan provider, legal, infrastructure, credential, atau keputusan owner di luar source.
- `NOT_STARTED`: belum ada implementasi bermakna.

## Verified baseline

Pada audit lokal 2026-08-13:

- dependency install dari `pnpm-lock.yaml` berhasil untuk 27 workspace project;
- full TypeScript gate lulus: 38/38 Turbo tasks;
- full lint gate lulus: 26/26 packages;
- full unit/protocol/integration gate lulus: 38/38 tasks dengan concurrency lokal stabil;
- Reward Engine regression membuktikan 0,5% = 50 basis points;
- PostgreSQL disposable menerapkan 9/9 migrations dari database kosong;
- rehearsal upgrade alpha.2 ke alpha.3 lulus dengan default 2% menjadi 0,5%, fee custom tetap utuh, dan nominal allocation historis tidak berubah;
- API integration test registration, verification, login, refresh rotation, replay-family revocation, serta binding fee policy lulus 4/4;
- integration assertion membuktikan akun baru menyimpan default fee 0,5%;
- build produksi lulus 26/26 packages dan web menghasilkan 20 static routes;
- static release, managed-source manifest, dan release-manifest verification lulus sebelum regenerasi final;
- Docker validation resources dibersihkan setelah pengujian.

Pada validasi lanjutan alpha.4 tanggal 2026-08-16:

- Redis coordinator lintas-klien membuktikan circuit bersama dan satu half-open probe; suite Stratum lulus 13/13 tanpa skip melalui pipeline root;
- upstream resilience lulus 15/15 dan lima pengulangan stabil (75/75);
- lint 26/26, typecheck 38/38, test 38/38, build 26/26, serta 20 route Next.js lulus;
- clean Stratum image build dan production startup smoke lulus;
- Docker API/web/Nginx E2E lulus untuk readiness, versi alpha.4/schema 9, dan wallet disabled;
- semua kontainer, network, serta volume disposable dibersihkan setelah pengujian.

Pada validasi financial-truth alpha.5 tanggal 2026-08-16:

- 10/10 migration lulus dari database kosong dan rehearsal upgrade schema v9 ke v10 mempertahankan serta menormalisasi data reward/reconciliation legacy;
- reward-engine lulus 11/11 dan accounting conversion lulus 2/2;
- concurrency/duplicate-delivery test membuktikan satu contribution fact dan satu settlement posting;
- end-to-end internal trace membuktikan fee 50 bps, jurnal decimal+atomic berimbang, immutable facts, equal-and-opposite reversal, saldo liability kembali nol, dan payout tetap nol;
- targeted typecheck untuk accounting-worker, mining-worker, API, dan operator scripts lulus;
- local root gates pass for alpha.5: lint 27/27, typecheck 41/41, tests 41/41, production build 27/27, 21 Next.js routes, Compose/static checks, and managed/release manifest verification; repository CI remains mandatory after publication.

Pada validasi reconciliation/referral alpha.6 tanggal 2026-08-21:

- schema v11/v12 menambahkan imported reconciliation evidence yang immutable, correction request dua-owner, replacement version, referral program/code/attribution, exact 5.000/3.750/1.250 PPM allocation, dan auto-withdrawal preference default OFF;
- accounting/reconciliation integration membuktikan journal balance, posted immutability, reversal entry baru, retry tanpa double-credit, allocation uniqueness, transactional rollback, serta source = user allocation + fee + clearing;
- fresh dan alpha.5 upgrade rehearsal, full local gates, Docker E2E, manifest verification, security diff scan, dan Draft PR exact-commit CI lulus.

Pada validasi payout-control alpha.7 tanggal 2026-08-22 yang sedang difinalkan:

- schema v13 dan rehearsal alpha.6 upgrade lulus dengan backfill payout address/payout representatif;
- 16 security tests, 4 Bitcoin address tests, targeted API/web typecheck, dan payout-control PostgreSQL integration lulus tanpa warning;
- step-up tersimpan hanya sebagai hash, terikat session/scope, sekali pakai, dan menolak reuse TOTP counter lintas enrollment/login/disable/step-up;
- enabled-factor re-enrollment ditolak, recovery code dikonsumsi atomik, API-key payout read memiliki scope eksplisit, preference write interactive-only, dan refresh browser single-flight;
- address checksum/network, masked read, cooldown, replacement, one-active-address, immutability, audit, registration-only route gate, serta zero payout creation terbukti;
- full monorepo, Docker E2E, manifest, security diff, dan exact-commit repository CI tetap wajib sebelum alpha.7 diterima.

Validasi tersebut membuktikan baseline source dapat dibangun secara tipe dan fungsi yang diuji. Validasi tersebut **tidak** membuktikan provider compatibility, production load, custody, payout, conversion, legal compliance, atau kesiapan dana nyata.

## Current capability map

| Domain                    | Status      | Evidence sekarang                                                                                                                                            | Gap penentu produksi                                                                       |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Project authority         | COMPLETE    | Root `PROJECT_VISION.md`, Product Constitution, roadmap precedence                                                                                           | Jaga sinkron melalui change control                                                        |
| Fee default 0,5%          | COMPLETE    | Versioned policy, 50 bps default, resolver/snapshot tests, fresh/upgrade migration, API binding, UI disclosure                                               | Durable allocation persistence dilanjutkan sebagai bagian workflow settlement P0.3         |
| Mining protocol           | FOUNDATION  | Configure/subscribe/authorize/notify/submit, SHA-256d, job registry, simulator tests                                                                         | Selected real-provider fixtures dan soak evidence                                          |
| Multi-upstream            | FOUNDATION  | Priority/weight registry, failover, bounded queue, Redis distributed circuit/probe coordination, ADR-0010 multiplexing boundary                              | Provider-safe shared multiplexing implementation, regional routing, provider validation    |
| VarDiff                   | FOUNDATION  | Conservative algorithm tersedia dan default off                                                                                                              | Statistical/provider validation dan production policy                                      |
| Worker identity           | FOUNDATION  | Worker CRUD, scrypt credential, rotation/revocation, PostgreSQL authenticator                                                                                | Multi-replica Redis integration, tenant/load/security evidence                             |
| Monitoring                | FOUNDATION  | Hashrate windows, projection, REST snapshot, authenticated WebSocket                                                                                         | Device ingestion depth, incident lifecycle, production scale/SLO                           |
| Identity & sessions       | FOUNDATION  | Registration, email tokens, password reset, JWT, atomic refresh rotation/single-flight, replay revocation, TOTP global counter/re-enrollment guard, API keys | Passkey/OAuth decision, general step-up framework, edge/distributed abuse controls         |
| Internal RBAC             | FOUNDATION  | USER/ADMIN/OWNER dan TOTP untuk admin routes                                                                                                                 | SUPPORT/OPERATOR/FINANCE/TREASURY/SECURITY/COMPLIANCE serta separation of duties           |
| Event Plane               | FOUNDATION  | PostgreSQL outbox, Redis Stream transport, retry/dead letter, idempotency contracts                                                                          | Docker multi-replica/partition/recovery/lag tests dan operational ownership                |
| Reward Engine             | IN_PROGRESS | Durable accepted-share facts, deterministic atomic allocation, fee snapshot, settlement state transitions, concurrency evidence                              | Provider settlement fixtures, multi-replica recovery, operational scale evidence           |
| Ledger                    | IN_PROGRESS | Transactional posting, decimal+atomic balance checks, immutable lifecycle, reversal, user projection/API, concurrency evidence                               | Operational reporting, provider evidence, load/partition evidence                          |
| Reconciliation            | IN_PROGRESS | OWNER+TOTP import, checksum/source identity, zero-tolerance exceptions, two-owner correction/replacement, audit trace                                        | Provider adapters/reports, multi-replica recovery, load evidence, operational ownership    |
| Payout address            | FOUNDATION  | Asset/network/route catalog, Bitcoin checksum validation, replay-safe step-up, scoped masked reads, cooldown, one-active rule, audit, UI/API                 | Ownership verification/allowlist policy, risk review, production operations evidence       |
| Payout                    | IN_PROGRESS | Atomic eligibility/reservation, idempotent request, selected destination, separated approval/rejection, reversal, evidence state machine, emergency gates    | Isolated signing, broadcast, confirmation/reorg, final reconciliation, operations evidence |
| Blockchain adapter        | FOUNDATION  | Offline Bitcoin address validation; funds methods fail closed                                                                                                | RPC/node health, balance, fee, signing boundary, broadcast, confirmation, reorg handling   |
| Wallet worker             | NOT_STARTED | Process heartbeat only                                                                                                                                       | Isolated signer boundary, queue, approval verification, reconciliation, emergency stop     |
| Conversion                | NOT_STARTED | Vision/schema direction only                                                                                                                                 | Catalog, quotes, batching, execution, slippage, provider adapters, reconciliation          |
| Referral                  | IN_PROGRESS | Versioned program/code, sticky attribution, exact PPM allocation/journal, MP05 donation liability                                                            | Abuse monitoring, beneficiary payout, reporting, provider/scale evidence                   |
| Simulator                 | NOT_STARTED | UI/vision only                                                                                                                                               | Shared calculation engine, data snapshots, assumptions, API, disclaimers                   |
| Transparency              | FOUNDATION  | Scaffold endpoint/page                                                                                                                                       | Fee/reward/payout/network/incident read models with privacy controls                       |
| Notification              | FOUNDATION  | Inbox and encrypted channel registry                                                                                                                         | Verification and delivery for email/Telegram/Discord/webhook/push                          |
| Owner operations          | FOUNDATION  | User/worker/session/upstream counts, status changes, audit                                                                                                   | Liability, treasury, payout/conversion queues, reconciliation, risk, incident controls     |
| Public Developer API      | FOUNDATION  | Versioned REST and scoped API keys                                                                                                                           | Signed requests, IP allowlist, idempotency coverage, webhooks, SDK, developer portal       |
| Observability             | FOUNDATION  | Health, Prometheus, Grafana provisioning, alert rules, structured logs                                                                                       | Traces, error tracking, SLOs, Alertmanager routing, on-call, incident timeline             |
| Desktop/mobile/enterprise | NOT_STARTED | Product vision                                                                                                                                               | Implement only after core financial and security gates                                     |
| Own pool                  | NOT_STARTED | Pool Adapter direction                                                                                                                                       | Evaluate after production gateway, hashrate, capital, node ops, and economics              |

## Critical path to first production milestone

### P0.1 — Release integrity and policy baseline

Status: `COMPLETE`

Required:

1. Keep Project Vision as the highest documentation layer.
2. Introduce versioned fee policy with effective time, scope, immutable settlement snapshot, and default 0,5%.
3. Migrate existing alpha accounts safely without rewriting settled history.
4. Add database bounds and policy-reference invariants.
5. Regenerate managed-source and release integrity manifests after source stabilizes.
6. Establish the next release/version rather than silently mutating historical `alpha.2` artifacts.

Exit evidence:

- fresh and upgrade migration tests;
- registration and settlement policy-resolution tests;
- historical settlement reproduction test;
- public configuration and UI disclosure test;
- release manifest verification.

Evidence accepted locally on 2026-08-13; see [`../releases/v0.3.0-alpha.3-validation.md`](../releases/v0.3.0-alpha.3-validation.md). Repository CI remains an additional gate and does not change the product's alpha/no-real-funds boundary.

### P0.2 — Mining truth against real upstreams

Status: `IN_PROGRESS`

Required:

1. Select at least one production upstream provider and one fallback.
2. Capture redacted protocol fixtures and expected hashes/decisions.
3. Validate TLS, auth, extension negotiation, error behavior, extranonce, job lifecycle, and submit correlation.
4. Prove reconnect/failover without disconnecting compatible miners.
5. Validate VarDiff statistically against provider constraints.
6. Add distributed health and decide shared-upstream multiplexing architecture. `IMPLEMENTED/DECIDED` in ADR-0010; provider-safe multiplexing implementation remains pending.
7. Run connection, submission, load, soak, latency, and failure tests.

External dependency: provider accounts/endpoints and permission to run controlled tests.

### P0.3 — Financial truth

Status: `IN_PROGRESS`

Required:

1. Persist immutable contribution facts from durable accepted upstream work.
2. Implement reward-period state machine and upstream settlement import.
3. Resolve versioned fee policy and store its immutable snapshot per allocation.
4. Implement transactional journal posting with idempotency and outbox.
5. Build balance projection exclusively from posted journal lines.
6. Implement reversals; prohibit edit/delete of posted facts.
7. Implement upstream reconciliation and explicit exception lifecycle.
8. Expose authenticated reward, ledger, balance, and audit-trace read APIs.

Exit evidence: concurrency, duplicate-delivery, rounding, reversal, partial failure, and end-to-end trace tests from share to reconciled balance.

Alpha.6 progress:

- items 1–8 are implemented for the internal `FOLLOW_UPSTREAM` path through schema v12, including transactional outbox, atomic accounting, authenticated user reads, and two-owner correction/replacement evidence;
- selected-provider evidence, multi-replica event recovery, load/soak, and operational reporting remain required before `COMPLETE`;
- payout eligibility is not derived from this alpha and `PAYOUTS_ENABLED=false` remains mandatory.

### P0.4 — Controlled funds

Status: `IN_PROGRESS`

Required sequence:

1. Asset/Network/PayoutRoute catalog.
2. Payout-address validation, step-up authentication, cooldown, and allowlist.
3. Payout simulation with balance reservation and idempotent state machine.
4. Manual pilot with isolated signer and multiple approvals.
5. Wallet/blockchain reconciliation, confirmation, reorg, fee, retry, and emergency procedures.
6. Risk/compliance decision and approval before real funds.
7. Auto payout only after manual controlled payout evidence is accepted.

Hard rule: `PAYOUTS_ENABLED=false` remains the default until all P0.3 and P0.4 gates are explicitly approved.

Alpha.7 progress:

- items 1 and 2 have an auditable foundation: versioned Asset/Network/PayoutRoute, offline Bitcoin checksum/network validation, session/scope-bound password+TOTP step-up, TOTP replay rejection, cooldown, one active address per route, masked reads, audit, UI/API, and database immutability/gating;
- checksum validation is explicitly not treated as proof of private-key ownership;
- the default BTC route is registration-only and the database rejects payout creation through it;
- items 3–7 remain unimplemented; alpha.7 contains no eligibility, reservation, signer, broadcast, confirmation, or real-funds path.

Current unreleased progress:

- item 3 now has an auditable implementation: user-owned destination selection, serializable eligibility, posted-liability locking, balanced reservation journals, global hot-wallet reservation accounting, exact idempotency, cancellation/rejection reversal, and database-enforced evidence/state transitions;
- the manual-review path now requires an append-only administrator decision, prevents requester self-approval, and permits only one final decision per payout;
- historical alpha.7 payout rows are preserved as execution version 1 during upgrade; no existing payout is rewritten into the new executor;
- items 4–7 are not complete: the isolated signer, Bitcoin RPC broadcast, confirmation/reorg handling, final reconciliation, external custody/risk approval, and real-funds operational evidence remain mandatory;
- request, signing, and broadcast gates are independently fail-closed, with `PAYOUTS_ENABLED=false` still the default.

### P0.5 — Production operations

Status: `FOUNDATION`

Required:

- managed secrets, public TLS, DDoS/edge protection, distributed rate limiting, IP reputation;
- backup/restore and disaster-recovery drills with measured RPO/RTO;
- logs, metrics, traces, error tracking, SLO/alerts, Alertmanager routing, on-call and incident command;
- dependency/security scanning, contract tests, migration guards, canary and rollback;
- privacy, terms, support, incident communication, data retention, and jurisdiction/compliance review;
- independent security assessment before custody or real payouts.

## Post-production investment order

After P0 gates pass:

1. conversion and pricing;
2. referral settlement and anti-abuse;
3. auto payout and multi-network/multi-chain;
4. public API/SDK/webhooks;
5. desktop supervisor and mobile monitoring;
6. enterprise/farm organization model;
7. intelligent routing and mining intelligence;
8. news/support/community with trust & safety;
9. selected own-pool infrastructure.

## External decisions required later

These decisions cannot be safely invented by source code alone:

- legal entity, operating jurisdictions, terms/privacy, custody/conversion licensing analysis;
- upstream providers and commercial terms;
- email, notification, pricing, conversion/liquidity, sanctions/KYC, and blockchain-node providers;
- treasury capital, wallet topology, signer technology, approval holders, and insurance/security review;
- production domains, certificates, cloud/region topology, DDoS provider, SLO, support, and on-call ownership;
- go/no-go approval for controlled real funds.

Until those decisions exist, engineering should provide secure adapters, simulations, failure paths, and disabled-by-default controls without pretending external readiness.

## Completion rule

The first production milestone is complete only when this chain is demonstrated with real controlled inputs and an auditable trace:

```text
Account → Worker → Session → Job → Share → Upstream Acceptance
→ Contribution → Settled Reward → Fee Policy → Posted Ledger
→ Reconciled Balance → Reserved Payout → Signed Transaction
→ Broadcast → Blockchain Confirmation → Reconciliation
```

Every arrow must have deterministic tests, correlation IDs, retry/idempotency behavior, monitoring, and an operator runbook.
