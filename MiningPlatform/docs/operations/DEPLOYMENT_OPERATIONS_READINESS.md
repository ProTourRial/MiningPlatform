# Deployment Operations Readiness

- **Status:** Documentation-only deployment contract
- **Branch:** `feat/deployment-operations-readiness`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Environment matrix, Vercel/web variables, API/web compatibility, rollback, migration approval, Docker smoke test, health/readiness, backup verification, dan production launch checklist
- **Out of scope:** Implementasi deployment, migration execution, schema, RandomX, `upstream-stratum`, accounting implementation, dan `CHANGELOG.md`

> Deployment berhasil hanya jika artifact, configuration, dependency health, contract compatibility, backup, observability, dan rollback target dapat dibuktikan. Deploy hijau tidak otomatis berarti payout aman.

## 1. Environment matrix

| Concern | Local development | CI/preview | Staging | Production |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `test`/`production-like` | `production` | `production` |
| Database | Disposable PostgreSQL 17 | Ephemeral PostgreSQL 17 | HA/staging clone | HA primary + standby, PITR |
| Redis | Docker Redis 7 | Ephemeral Redis | HA/staging | HA/managed Redis; not financial source of truth |
| Web | `localhost`/Docker nginx | Preview URL | Staging domain | Production domain/TLS/edge |
| API | `localhost:4000` | Preview API | Staging API | Production API |
| Stratum | Dev mode/simulator allowed | Fixture/simulator | Provider sandbox or approved upstream | Production upstream with failover |
| Payout | Always `false` | Always `false` | Simulation/manual test only | `false` until controlled-funds gate approval |
| Swagger | Allowed locally | Optional | Internal only | Disabled (`ENABLE_SWAGGER=false`) |
| Development dashboard | Allowed locally | Disabled | Disabled | Disabled |
| Seed data | Optional local | Explicit fixture only | Controlled fixture | Disabled |
| Secrets | Local `.env`, never committed | CI secret store | Secret manager | Secret manager/KMS/HSM with rotation |
| Observability | Local logs/Prometheus | Test artifacts | Full staging dashboards | Full dashboards, paging, status/incident |
| Deployment mode | Docker Compose | Reproducible container build | Rolling/canary where supported | Approved rolling/canary + rollback |

Local `.env.example` is a template only. Any `change-me`, test token, `AUTH_EXPOSE_TEST_TOKENS=true`, dev Stratum credential, or placeholder RPC secret is a deployment blocker.

## 2. Required configuration

### 2.1 Vercel web project variables

Vercel should hold only browser-safe build/runtime configuration for the web project. Values prefixed `NEXT_PUBLIC_` are public by design and must never contain secrets.

| Variable | Required | Example/meaning | Secret? |
|---|---:|---|---:|
| `NEXT_PUBLIC_API_URL` | Yes | `https://api.example.com/api/v1` or `/api/v1` behind same-origin proxy | No |
| `NEXT_PUBLIC_SOCKET_URL` | If realtime enabled | `https://api.example.com` or same-origin socket path | No |
| `NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD` | No; must be false in production | `false` | No |
| `NEXT_PUBLIC_DEVELOPMENT_DASHBOARD_TOKEN` | Never production | Local-only test token | **Do not configure** |
| `NEXT_PUBLIC_DEVELOPMENT_WORKER_ID` | Never production | Local-only fixture ID | **Do not configure** |

Vercel build settings must pin Node/pnpm versions, use the repository lockfile, and record the commit/image/source version shown in the deployment. Vercel must not receive `DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, wallet/RPC credentials, signing references, or any server-only secret.

### 2.2 API and worker variables

The following are server-side requirements derived from `.env.example` and `docker-compose.yml`; exact values belong in the environment secret/config store, not this document.

| Group | Variables | Production rule |
|---|---|---|
| Runtime | `NODE_ENV`, `APP_URL`, `TRUST_PROXY_HOPS`, `LOG_LEVEL`, `PORT` | `production`, canonical HTTPS URL, exact proxy count |
| Database | `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | HA endpoint, TLS where supported, least privilege, PITR |
| Redis/events | `REDIS_URL`, `REDIS_PASSWORD`, `EVENT_BUS_DRIVER`, `EVENT_STORE_DRIVER`, `EVENT_STREAM`, group names | HA endpoint, auth/TLS, bounded retry/backlog |
| Auth | `AUTH_JWT_SECRET`, `AUTH_ENCRYPTION_KEY`, `AUTH_IP_HASH_KEY`, issuer/audience, token TTLs | Random managed secrets; secure cookies; test tokens disabled |
| Email | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Verified sender/domain; disabled until provisioned |
| Mining | `MINING_ASSET`, `MINING_ALGORITHM`, `REWARD_METHOD`, `PLATFORM_FEE_PERCENT` | Policy-approved values; no ad hoc runtime override |
| Stratum | `STRATUM_HOST/PORT`, publish address/port, auth driver, IP hash key, limits | Public only behind firewall/edge/DDoS policy; dev mode false |
| Upstream | driver, host/port/TLS, credentials, pools JSON, timeout/retry/health | Provider-approved, TLS where available, secrets redacted |
| Payout/RPC | `PAYOUTS_ENABLED`, schedule, minimum/confirmations, Bitcoin RPC variables | Payout false until gate; RPC private; wallet identity audited |
| Object storage | `S3_ENDPOINT`, region, bucket, access/secret keys, path style | Private bucket, encrypted, lifecycle and backup policy |
| Monitoring | `METRICS_ENABLED`, Prometheus/Grafana ports and scrape config | Internal network; no public unauthenticated dashboards |
| Retention/build | scheduler retention, `MINING_BUILD_VERSION`, `GIT_COMMIT`, `BUILD_DATE`, schema metadata | Injected by CI; must match artifact and release record |

### 2.3 Secret preflight

- [ ] All production values differ from `.env.example` placeholders.
- [ ] Secret manager/KMS access is granted only to required runtime identity.
- [ ] Secret versions and last rotation are recorded without recording secret values.
- [ ] No secret appears in Git history, build logs, browser bundle, Docker layer, image label, or error payload.
- [ ] Rotation and emergency revocation procedure has been tested.
- [ ] `AUTH_SECURE_COOKIES=true`, `AUTH_EXPOSE_TEST_TOKENS=false`, `STRATUM_DEV_MODE=false`, and `PAYOUTS_ENABLED=false` are verified in the production config snapshot.

## 3. API/web compatibility matrix

| Web build | API contract | Required action |
|---|---|---|
| Current web | Same `/api/v1` contract and response/error enums | Normal smoke test |
| New web, old API | Allowed only for additive fields and backward-compatible behavior | Contract test + preview verification |
| Old web, new API | Allowed only while old fields/routes remain supported | Compatibility window and deprecation notice |
| New required API field/enum | Not backward compatible | Version/release coordination before deploy |
| Payout state-machine change | Financially sensitive | Separate approval, migration plan, audit, and controlled rollout |
| Schema or migration change | Requires DB review | Expand/contract strategy, backup, rollback/forward-fix plan |

The API contract baseline is `v1.0.0-draft` at main commit `770e38c5e119102635aefa97893cdcbdbc345da9`. A deployment record must state the API contract version, web commit, API commit, config fingerprint, and schema version together.

## 4. Database migration approval

This branch does not execute or modify migrations. Any future migration requires the following approval path:

1. Describe purpose, affected tables/indexes/constraints, data volume, lock behavior, and financial impact.
2. Test fresh install and upgrade path on a disposable PostgreSQL version matching production.
3. Test backup restore and rollback/forward-fix strategy; never assume destructive down migration is safe.
4. Run explain/lock/capacity checks and verify replication/replica lag behavior.
5. Rehearse migration against a sanitized production-size clone.
6. Obtain owner, database, security, and finance/accounting approval for financial tables.
7. Deploy expand-compatible changes first; backfill separately with bounded, observable jobs.
8. Verify application/API compatibility before enabling new behavior.
9. Record migration version, checksum, duration, row counts, errors, and post-migration invariants.
10. Keep `CHANGELOG.md` unchanged until the relevant Codex milestone and final release history are approved.

A migration cannot be “rolled back” by editing posted ledger or payout records. Financial correction uses the approved state machine/reconciliation workflow.

## 5. Docker smoke test

### 5.1 Build and config validation

From repository root:

```bash
cp .env.example .env
# Replace every secret/placeholder for the test environment.
docker compose config --quiet
docker compose build --pull
```

The smoke environment must use disposable credentials, a disposable database, and `PAYOUTS_ENABLED=false`. Do not run a test transaction against a production wallet.

### 5.2 Start and inspect

```bash
docker compose up -d postgres redis minio api web stratum-server outbox-worker mining-worker accounting-worker scheduler prometheus grafana nginx
docker compose ps
docker compose logs --no-color --tail=200 api web stratum-server outbox-worker mining-worker accounting-worker scheduler
```

Expected conditions:

- PostgreSQL and Redis healthchecks are healthy.
- API healthcheck passes before nginx is marked ready.
- Web depends on a healthy API.
- Stratum runs with `STRATUM_DEV_MODE=false` and the intended auth driver in production-like smoke.
- Workers have no unbounded retry loop or crash loop.
- Prometheus/Grafana load without public unauthenticated exposure.
- Nginx routes web/API correctly and does not expose internal ports.

### 5.3 HTTP and functional smoke

```bash
curl -fsS http://localhost/api/v1/health/live
curl -fsS http://localhost/api/v1/health/ready
curl -fsS http://localhost/api/v1/version
curl -fsS http://localhost/api/v1/metrics
curl -fsS http://localhost/api/v1/payouts/status
```

Then execute a disposable-account smoke flow: register/login/logout, refresh session, create worker, read worker, read reward/ledger status, list payout routes/addresses, verify masked destination, and confirm that payout/auto-withdrawal remains gated. Save request IDs, response status, build metadata, and sanitized logs.

### 5.4 Stop/cleanup

```bash
docker compose down
```

Do not use `docker compose down -v` until test artifacts, backup evidence, and investigation logs are intentionally preserved.

## 6. Health/readiness endpoint contract

| Endpoint | Purpose | Must fail when |
|---|---|---|
| `/api/v1/health/live` | Process is alive | Process cannot serve a basic response |
| `/api/v1/health/ready` | Service can accept traffic | Required DB/Redis/config/dependency readiness is not met |
| `/api/v1/health/domain` | Domain-level operational status | Mining/event/financial dependency is degraded according to policy |
| `/api/v1/version` | Build/API/schema identity | Metadata is missing or inconsistent |
| `/api/v1/metrics` | Scrape endpoint | Metrics process unavailable; endpoint remains internal |

Readiness must not report green while a critical dependency is unavailable, while financial truth is ambiguous, or while the deployment is serving a mismatched schema/API contract. Liveness and readiness must remain distinct so an unhealthy dependency does not cause an endless restart loop.

## 7. Rollback procedure

### Trigger

Rollback or pause when smoke test fails, API/web incompatibility appears, ledger or reconciliation alert fires, payout gate changes unexpectedly, secret is exposed, node quorum is lost, error rate breaches threshold, or the new release causes a material worker/share regression.

### Steps

1. Declare incident and freeze unrelated deployments/config/policy changes.
2. Record current and previous commit, image digest, config fingerprint, schema version, migration status, and affected scope.
3. Pause payout/signing/broadcast immediately if financial state is uncertain; do not reverse blockchain transactions automatically.
4. Drain or route traffic according to runbook; retain Stratum/session behavior needed to avoid silent share loss.
5. Roll back stateless web/API/worker image only when schema compatibility is proven.
6. If schema changed, follow migration approval and forward-fix/restore plan; do not blindly run destructive down migration.
7. Verify health/readiness, API contract, event backlog, ledger balance, payout queue, node status, and user-visible status.
8. Re-run smoke tests and obtain operations/security/finance approval before resuming sensitive actions.
9. Record postmortem and corrective action; keep release history unchanged until final release decision.

## 8. Backup verification

Before production deployment:

- [ ] Latest PostgreSQL backup/PITR point exists and is encrypted.
- [ ] Backup age meets RPO target and replication lag is recorded.
- [ ] Restore was tested on an isolated target, including schema, ledger, audit, outbox, and idempotency records.
- [ ] Restore counts/checksums and trial balance are verified.
- [ ] Redis recovery strategy is documented; Redis is not treated as financial source of truth.
- [ ] Object storage and observability configuration backups are verified.
- [ ] Backup access uses separate identity and does not contain plaintext secrets/private keys.
- [ ] RPO/RTO result, restore operator, target, timestamp, and unresolved gaps are attached to the deployment record.

## 9. Production launch checklist

### Governance

- [ ] Release commit, image digest, API contract version, schema version, and config fingerprint are recorded.
- [ ] RandomX v20, migration, security scan, and Codex audit dependencies have explicit status and owner.
- [ ] No change to `CHANGELOG.md` is made before the Codex milestone is final.
- [ ] Go/no-go decision has named owner, operations, security, finance/treasury, and legal/compliance approvers.

### Platform

- [ ] TLS, DNS, edge/DDoS controls, firewall, origin protection, and rate limits are active.
- [ ] PostgreSQL/Redis/node topology, monitoring, backups, on-call, and incident runbooks are verified.
- [ ] Health/readiness/version/metrics smoke tests pass.
- [ ] Web/API compatibility is tested in the exact deployment pair.
- [ ] Observability IDs, dashboards, alerts, retention, and notification routes are active.

### Mining

- [ ] Production Stratum authentication and worker isolation are verified.
- [ ] Upstream/provider health, failover, template/job freshness, share acceptance, and capacity evidence are current.
- [ ] Hashrate and worker states are derived from real data, not placeholder values.

### Financial and payout

- [ ] Reward/fee policy is approved and versioned; 0,50%/0,375%/0,125% and MP05 donation liability are disclosed.
- [ ] Ledger trial balance and reconciliation have no unexplained mismatch.
- [ ] Wallet destination, maturity, threshold, confirmation, risk, reservation, approval, signer, node, and recovery gates are approved.
- [ ] Payout remains OFF unless controlled-funds gate is signed off.
- [ ] User-facing copy distinguishes pending, eligible, gated, processing, completed, and failed.

### Post-launch

- [ ] First observation window has named operator and escalation path.
- [ ] Deployment metrics are compared against baseline at 15/30/60 minutes and 24 hours.
- [ ] No unexpected config drift, error spike, event lag, queue growth, or reconciliation variance exists.
- [ ] Launch evidence and any deviations are stored with the release record.

No deployment operation or migration execution is authorized by this documentation-only branch.
