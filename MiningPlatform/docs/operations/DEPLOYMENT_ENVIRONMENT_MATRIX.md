# Deployment Environment Matrix

**Status:** Deployment contract; configuration changes are not applied by this branch.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/deployment-environment-matrix`

## 1. Environment matrix

| Environment | Data                     | Payout mode          | Signer mode                | External nodes                   | Required posture                    |
| ----------- | ------------------------ | -------------------- | -------------------------- | -------------------------------- | ----------------------------------- |
| Local       | Disposable/synthetic     | Disabled             | Mock/none                  | Regtest or mock                  | No production secrets               |
| CI          | Ephemeral synthetic      | Disabled             | Mock                       | Mock/test endpoint               | Reproducible and isolated           |
| Preview     | Synthetic/isolated       | Disabled             | Mock/none                  | Test endpoint                    | Publicly non-financial              |
| Staging     | Sanitized synthetic      | Simulation only      | Isolated test signer       | Testnet/regtest/provider sandbox | Same policy shape as production     |
| Production  | Approved controlled data | Gated until go/no-go | Isolated production signer | HA Bitcoin Core/provider         | Least privilege, audited, monitored |

## 2. Configuration classes

| Class                | Examples                                                                          | Rules                                              |
| -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| Public configuration | Web/API URL, build version, feature display flags                                 | May be exposed only if non-sensitive               |
| Secret configuration | Database URL, Redis credentials, session secret, provider token, signer reference | Secret manager only; never repo/log/client         |
| Financial control    | Payout mode, reserve limit, confirmation/maturity, fee policy ID                  | Change-controlled, effective-dated, audited        |
| Security control     | Allowed origins, rate limits, session TTL, step-up policy                         | Reviewed by Security and tested per environment    |
| Node control         | RPC endpoint, quorum, freshness, provider priority                                | Never expose credentials; fail closed on ambiguity |

## 3. Compatibility requirements

API and web versions must publish a compatible contract version and source commit. A deployment is blocked when web expects an endpoint or response field not supported by the API, when API schema differs from migration/runtime baseline, or when observability metric names drift from the approved catalog. Compatibility checks must run before traffic is shifted.

## 4. Health and readiness

Liveness indicates process availability only. Readiness must verify safe dependencies without exposing credentials: database connectivity, Redis mode, configuration validity, contract version, node/provider freshness, signer mode, payout mode, and migration compatibility. A service must not report ready for real payout if payout mode is gated or any critical financial dependency is ambiguous.

## 5. Rollback

Rollback authority is the release owner with Engineering, Security, Operations, and Finance/Treasury consultation. Rollback must identify application version, contract version, data compatibility, migration status, financial state, active payout batches, and audit evidence. A rollback must not reverse a committed migration or replay payout without an explicit recovery plan.

## 6. Acceptance criteria

1. Each environment has a documented security posture and no accidental production secret path.
2. Payout is disabled in local, CI, preview, and staging unless a separately approved simulation mode is used.
3. Web/API compatibility and source commit are checked before deploy.
4. Health/readiness distinguishes process health from financial readiness.
5. Rollback has authority, evidence, and data-compatibility checks.
6. Backup verification, smoke tests, security scan, and release evidence are required before production go/no-go.
