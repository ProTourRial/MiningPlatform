# Observability Readiness Contract

- **Status:** Documentation-only contract
- **Branch:** `feat/observability-readiness`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Correlation/request/audit identity, service and financial metrics, RandomX metric namespace, alerts, retention, operator dashboard, dan deployment smoke test
- **Out of scope:** Instrumentation implementation, schema, migration, RandomX code, upstream-stratum, accounting code, dan release metadata

> Observability bukan sekadar log. Setiap operasi penting harus dapat dicari lintas request, event, worker, ledger, payout, signer, node, incident, dan deployment tanpa memasukkan secret atau data pribadi berlebih.

## 1. Identity contract

### 1.1 Correlation ID

`correlationId` mengikat satu business workflow lintas service dan asynchronous boundaries. Contoh: satu payout menghubungkan eligibility, reservation, approval, signer, broadcast, confirmation, reconciliation, dan incident.

- Format: opaque UUID/ULID; server membuat jika caller tidak mengirim nilai yang valid.
- Propagasi: HTTP header `x-correlation-id`, event envelope, job metadata, structured log, audit event, dan provider reference mapping.
- Lifetime: sampai workflow terminal dan post-incident retention selesai.
- Tidak boleh mengandung email, address, token, atau informasi finansial langsung.

### 1.2 Request ID

`requestId` mengidentifikasi satu inbound HTTP/WebSocket/Stratum request attempt.

- Format: opaque UUID/ULID per request attempt.
- Response header: `x-request-id`.
- Jika caller mengirim ID invalid, server membuat ID baru dan mencatat `requestIdSource=generated`.
- Retry dari client memiliki request ID baru tetapi boleh mempertahankan correlation ID dan idempotency key.
- Error response wajib mengembalikan request ID yang sama dengan log.

### 1.3 Audit ID

`auditId` mengidentifikasi immutable security/financial audit record untuk state-changing action.

- Dibuat ketika event/audit record durable, bukan hanya ketika handler menerima request.
- Tidak boleh didaur ulang atau dihapus saat projection di-rebuild.
- Wallet/payout actions wajib memiliki audit ID sebelum response sukses.
- Operator dapat mencari audit ID berdasarkan correlation ID, request ID, actor, resource, incident ID, atau policy version.

### 1.4 Structured event context

Minimum context untuk log/event:

```json
{
  "timestamp": "2026-08-27T08:00:00.000Z",
  "level": "info",
  "service": "payout-orchestrator",
  "environment": "production",
  "release": "0.3.0",
  "region": "id-jakarta",
  "correlationId": "corr-uuid",
  "requestId": "req-uuid",
  "auditId": "audit-uuid",
  "entityType": "Payout",
  "entityId": "payout-uuid",
  "event": "PAYOUT_RESERVED",
  "state": "RESERVED",
  "durationMs": 42
}
```

Secret, private key, seed phrase, access/refresh token, worker password, full payout address, raw IP, dan raw provider credential dilarang masuk ke structured context.

## 2. Metric naming and labels

Metric menggunakan prefix `miningplatform_`, nama lowercase snake_case, dan label dengan cardinality terbatas. Jangan memakai user ID, payout ID, address, tx hash, atau request ID sebagai label metric; data tersebut tetap berada di log/trace/audit.

Required common labels: `environment`, `service`, `region`, `asset`, `network`, `algorithm`, `status` jika allowlisted. `worker_id` hanya boleh dipakai pada dashboard internal dengan cardinality budget yang disetujui; jangan digunakan pada public metrics.

## 3. Financial and pool metrics

### 3.1 Payout metrics

| Metric | Type | Required labels | Purpose |
|---|---|---|---|
| `miningplatform_payout_requests_total` | Counter | asset, network, result | Request volume and rejection rate |
| `miningplatform_payout_state_transitions_total` | Counter | asset, network, from_state, to_state | State machine health |
| `miningplatform_payout_queue_age_seconds` | Gauge/histogram | asset, network, state | Stuck queue detection |
| `miningplatform_payout_reservations_active` | Gauge | asset, network | Funds currently held |
| `miningplatform_payout_reservation_expiry_total` | Counter | asset, network, reason | Expiry/release behavior |
| `miningplatform_payout_approval_latency_seconds` | Histogram | asset, network | Maker-checker latency |
| `miningplatform_payout_signing_total` | Counter | asset, network, result | Signer activity/failure |
| `miningplatform_payout_broadcast_total` | Counter | asset, network, result | Broadcast result |
| `miningplatform_payout_confirmation_latency_seconds` | Histogram | asset, network | Chain finality latency |
| `miningplatform_payout_amount_atomic_total` | Counter | asset, network, state | Amount flow by state; never use float |
| `miningplatform_payout_exceptions_open` | Gauge | asset, network, reason | Open operational/financial exceptions |

### 3.2 Ledger and reward metrics

| Metric | Type | Alert meaning |
|---|---|---|
| `miningplatform_ledger_postings_total` | Counter | Posting throughput and result |
| `miningplatform_ledger_unbalanced_total` | Counter | Any non-zero value is critical |
| `miningplatform_ledger_trial_balance_atomic` | Gauge | Must remain zero by currency/asset |
| `miningplatform_ledger_reversal_total` | Counter | Monitor correction volume and reason |
| `miningplatform_ledger_projection_lag_seconds` | Gauge | Read model freshness |
| `miningplatform_reward_allocations_total` | Counter | Allocation result/state |
| `miningplatform_reward_settlement_variance_atomic` | Gauge | Upstream/internal variance |
| `miningplatform_referral_liability_atomic` | Gauge | Includes 0.125% beneficiary liability and MP05 donation liability |
| `miningplatform_user_liability_atomic` | Gauge | Reconcile to posted journal and source settlement |
| `miningplatform_reconciliation_mismatch_total` | Counter | Any unexplained mismatch requires incident |

No dashboard may hide a non-zero `ledger_unbalanced_total` or mismatch behind a green aggregate status.

### 3.3 Wallet and node metrics

| Metric | Type | Required labels |
|---|---|---|
| `miningplatform_wallet_balance_atomic` | Gauge | wallet class, asset, network; no address label |
| `miningplatform_wallet_reserve_ratio` | Gauge | asset, network |
| `miningplatform_wallet_signer_requests_total` | Counter | result, policy |
| `miningplatform_wallet_signer_denials_total` | Counter | reason |
| `miningplatform_wallet_key_rotation_total` | Counter | result |
| `miningplatform_node_tip_lag_blocks` | Gauge | node role, region |
| `miningplatform_node_tip_disagreement_total` | Counter | asset/network |
| `miningplatform_node_rpc_errors_total` | Counter | method, safe error class |
| `miningplatform_node_broadcast_total` | Counter | result |
| `miningplatform_node_confirmation_depth` | Gauge | asset/network |
| `miningplatform_node_reorgs_total` | Counter | asset/network |

Wallet metrics must not expose private-key identity, seed material, or full address. A signer failure metric is not permission to retry blindly.

### 3.4 Mining, gateway, and RandomX metric namespace

RandomX metrics are documented here for cross-service observability only. This branch does not alter `apps/randomx-gateway/**` or `packages/randomx/**`.

| Metric | Type | Required labels | Notes |
|---|---|---|---|
| `miningplatform_miner_connections_active` | Gauge | algorithm, region, transport | Active Stratum sessions |
| `miningplatform_share_submissions_total` | Counter | algorithm, result, region | accepted/rejected/stale/duplicate |
| `miningplatform_share_validation_latency_seconds` | Histogram | algorithm, result | Validator latency |
| `miningplatform_hashrate_calculated` | Gauge | algorithm, region, window | Share-derived, not decorative |
| `miningplatform_hashrate_reported` | Gauge | algorithm, region | Miner-reported value |
| `miningplatform_randomx_jobs_active` | Gauge | network/region | RandomX job lifecycle |
| `miningplatform_randomx_job_age_seconds` | Gauge | network/region | Template/job staleness |
| `miningplatform_randomx_hashrate_calculated` | Gauge | region, window | RandomX calculated hashrate |
| `miningplatform_randomx_share_submissions_total` | Counter | result, region | RandomX share outcomes |
| `miningplatform_randomx_verification_latency_seconds` | Histogram | result, region | Verification cost |
| `miningplatform_randomx_gateway_errors_total` | Counter | safe error class, region | Gateway failures |
| `miningplatform_randomx_upstream_reconnects_total` | Counter | region, reason | Upstream resilience |
| `miningplatform_randomx_template_age_seconds` | Gauge | region | Template freshness |
| `miningplatform_randomx_projection_lag_seconds` | Gauge | projection, region | Event/read model lag |

Algorithm-specific instrumentation must follow the same ID propagation and redaction rules. Do not introduce high-cardinality labels simply because the RandomX gateway has many workers.

## 4. Alert thresholds

Thresholds are initial internal defaults and require calibration from baseline data. They are not public SLA commitments until approved in the product readiness decision log.

| Alert | Initial threshold | Severity | Action |
|---|---:|---|---|
| Ledger unbalanced | Any non-zero for 1 evaluation | Sev-1 | Pause affected financial scope; page finance/security/IC |
| Reconciliation mismatch | Any unexplained non-zero | Sev-1 | Freeze affected asset/period/payout; open exception |
| Unknown payout state | Any item >15 minutes | Sev-1 | Pause payout executor; inspect state machine and provider |
| Payout queue age | >30 minutes normal; >2 hours critical | Sev-2/Sev-1 | Inspect provider, approval, signer, and node |
| Payout reservation near expiry | >5% in 15 minutes | Sev-2 | Review eligibility/reservation latency |
| Node tip lag | >3 blocks for 5 minutes | Sev-2 | Remove node from quorum; fail over if safe |
| Node disagreement | Any conflicting tip/hash | Sev-1 | Pause broadcast/confirmation decisions |
| Reorg detected | Any in confirmed payout/reward scope | Sev-1 | Start reorg runbook; freeze affected scope |
| Wallet balance variance | Any unexplained variance | Sev-1 | Pause payout; reconcile wallet/node/ledger |
| API 5xx | >2% for 5 minutes | Sev-2 | Page API owner; inspect dependency |
| Stratum connection failures | >5% for 10 minutes | Sev-2 | Check edge, provider, region, and gateway |
| Share reject/stale | >2× 30-day baseline for 10 minutes | Sev-2 | Check job/template/difficulty/provider |
| Event lag | >60 seconds warning; >5 minutes critical | Sev-2/Sev-1 | Inspect outbox/Redis/consumer health |
| RandomX job/template age | >60 seconds warning; >120 seconds critical | Sev-2 | Inspect gateway/template source; no code change from this branch |
| DB replication lag | >30 seconds warning; >5 minutes critical | Sev-2/Sev-1 | Protect writes; evaluate failover/RPO |
| Redis pending entries | >10,000 or growing 10 minutes | Sev-2 | Apply backpressure; preserve durable source |

Every alert needs an owner, runbook link, deduplication key, severity, for/resolve behavior, and a safe test procedure.

## 5. Log and trace retention

| Data | Hot retention | Archive/retention target | Redaction |
|---|---:|---:|---|
| API/access logs | 14 days | 90 days | No token, secret, full address, or raw IP unless separately approved |
| Stratum connection/share logs | 7 days | 30 days | Worker ID may be pseudonymous; no password |
| Application error logs | 30 days | 180 days | Stack traces sanitized for user-facing output |
| Audit events | 90 days queryable | Per legal/ledger retention policy | Immutable; sensitive metadata minimized |
| Ledger/reward/payout events | 180 days queryable | Per accounting/legal retention policy | Amounts allowed; private key/address secrets forbidden |
| Signer/KMS audit | 180 days queryable | Per security/legal retention policy | Key reference only; never key material |
| Deployment/CI logs | 30 days | 180 days | Secret scanning before archive |
| Metrics | 30 days high resolution | 13 months downsampled | No user/payout/request ID labels |
| Traces | 7 days sampled | 30 days error traces | Payload capture disabled for sensitive routes |

Retention is subject to legal review, data-subject rights, incident hold, and backup deletion policy. Log archival does not override deletion of prohibited secrets; if a secret is accidentally logged, rotate it and follow compromise procedure rather than relying on retention expiry.

## 6. Operator dashboard contract

The operator dashboard must have separate panels for service health, mining, event plane, financial truth, payout, wallet/node, security, and deployments. Every panel shows `last updated`, data source, environment, region, and freshness/lag.

### Required panels

1. **Global status:** active incidents, maintenance, service health, region availability, deployment version, and last successful smoke test.
2. **Mining plane:** connections, share outcomes, hashrate, reject/stale ratio, job/template age, upstream health, failover, and latency.
3. **Event plane:** outbox pending, Redis stream lag, consumer lag, retry/dead-letter counts, and projection freshness.
4. **Financial truth:** gross/settled/user liability/platform fee/referral liability, trial balance, reconciliation exceptions, and policy version.
5. **Payout control:** eligibility volume, reservations, approvals, signer state, broadcast/confirmation queue, queue age, and pause gate.
6. **Wallet and blockchain:** node quorum, tip/height, reorgs, wallet balance by asset/role, reserve ratio, RPC errors, and signer audit.
7. **Security:** authentication anomalies, rate limits, blocked IP/reputation signals, step-up failures, credential rotations, and audit search.
8. **Database/cache:** PostgreSQL latency/locks/replication/disk, Redis health/lag/memory, and backup freshness.
9. **Deployments:** commit/image, config fingerprint, migration version, health/readiness, smoke-test result, and rollback target.

Public transparency must use a separate privacy-reviewed read model. The operator dashboard is not a public API and must not be exposed through an unauthenticated route.

## 7. Deployment smoke test

Smoke tests are read-only or disposable-environment tests unless an explicit production-safe test route is approved.

### Pre-deploy

- [ ] Record commit, image digest, contract version, policy version, environment, and deploy operator.
- [ ] Confirm no unapproved migration, RandomX change, manifest mutation, or secret in artifact.
- [ ] Confirm backup freshness and restore point.
- [ ] Confirm current incident status and payout gate state.
- [ ] Confirm expected API/web compatibility matrix.

### Post-deploy checks

```text
GET /api/v1/health/live       → 200
GET /api/v1/health/ready      → 200 with dependencies within policy
GET /api/v1/version           → expected release/schema contract
GET /api/v1/metrics           → required metric families present
GET /api/v1/system/configuration → payout gate matches approved state
```

Then verify, in a disposable or approved test account:

- login and refresh session;
- read worker/monitoring endpoint;
- read ledger/reward status without mutation;
- read payout route/address status with masking;
- verify gated payout returns the normative error shape;
- verify correlation/request IDs in response, logs, and trace;
- verify no secret/full address appears in logs or metrics;
- verify event lag and dashboard freshness;
- verify alert rules are loaded and notification route works;
- verify rollback target is available.

### Rollback trigger

Rollback or pause deployment if readiness fails, API/web contract is incompatible, financial status is ambiguous, ledger/mismatch alert fires, payout gate changes unexpectedly, node quorum is lost, or logs expose sensitive data. Rollback does not automatically reverse database changes or blockchain transactions; those require the relevant runbook and approval.

## 8. Acceptance criteria

- [ ] Correlation ID, request ID, and audit ID are generated, propagated, searchable, and redacted correctly.
- [ ] Payout, ledger, wallet, mining, and RandomX metric families are defined with bounded labels.
- [ ] Alert thresholds have severity, owner, runbook, deduplication, and resolve policy.
- [ ] Log/trace/metric retention is approved and tested for secret redaction.
- [ ] Operator dashboard panels show source, timestamp, freshness, and environment.
- [ ] Deployment smoke test validates health, readiness, version, metrics, config, contract, and rollback target.
- [ ] Financial alerting fails safe and cannot be silenced by a green aggregate status.
- [ ] Observability evidence is captured for normal, retry, timeout, failover, reorg, payout pause, and reconciliation mismatch scenarios.
- [ ] Implementation PRs link back to this contract and record the source baseline they instrument.

No instrumentation or code change is authorized by this documentation-only branch.
