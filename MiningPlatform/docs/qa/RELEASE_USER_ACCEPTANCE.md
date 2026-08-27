# Release Lifecycle User Acceptance Scenarios

**Status:** Executable UAT contract; no production deployment or real payout.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/release-acceptance-governance`

## 1. Test record

| Field | Value |
|---|---|
| UAT run ID | `TBD` |
| Environment | Disposable/staging only |
| Web/API commit | `TBD` |
| Contract version | `TBD` |
| Tester/reviewer | `TBD` |
| Start/end UTC | `TBD` |
| Result | `PASS`, `FAIL`, or `BLOCKED` |

## 2. Scenarios

### RA-01 — Alpha release is honestly gated

**Given** the deployment is marked alpha.

**When** an anonymous or authenticated user visits landing, dashboard, wallet, reward, and payout pages.

**Then** the UI identifies alpha status, payout gated status, and known limitations; no CTA claims real payout, signing, custody, or broadcast; and API flags agree with the UI.

**Evidence:** Screenshot, API response, deployment version, and correlation ID.

### RA-02 — Beta pilot requires explicit scope

**Given** a beta deployment has an approved pilot cohort and limits.

**When** a pilot user requests an allowed flow and a non-pilot user requests the same flow.

**Then** the allowed flow remains within the approved asset/network, amount, account, and time limits; non-pilot access is denied safely; and both decisions are auditable.

**Evidence:** Cohort/limit configuration, safe response, audit event, and approval record.

### RA-03 — Production go/no-go blocks on missing evidence

**Given** one critical gate is pending, expired, or unexplained.

**When** the release owner attempts promotion.

**Then** promotion is denied or remains `NO-GO`; the missing gate, owner, and remediation are visible; and no payout/signer/broadcast activation occurs.

**Evidence:** Gate evaluation, release evidence ID, and deployment log.

### RA-04 — Version compatibility is checked

**Given** web and API have different source or contract versions.

**When** the release smoke test runs.

**Then** compatible versions proceed; incompatible versions fail before traffic promotion; errors identify the contract mismatch without exposing secrets.

**Evidence:** Version responses, compatibility decision, and smoke result.

### RA-05 — Deployment smoke test uses synthetic data

**Given** a staging deployment with payout disabled or simulation-only.

**When** the tester runs landing, auth, health, readiness, protected dashboard, wallet validation, payout-gated, and error-boundary checks.

**Then** all checks use synthetic data; no signer/broadcast call is made; health and readiness distinguish process availability from financial readiness.

**Evidence:** Smoke matrix, mock provider logs, metrics, and redacted screenshots.

### RA-06 — Rollback preserves user and financial context

**Given** a deployment introduces a critical regression before payout is enabled.

**When** the release owner invokes rollback.

**Then** traffic returns to the last compatible version; active sessions and safe error context are handled according to policy; immutable ledger/audit evidence is preserved; and no payout is retried blindly.

**Evidence:** Previous/current deployment IDs, rollback timestamp, health result, and audit event.

### RA-07 — Payout is paused during release risk

**Given** a reconciliation delta, signer problem, wallet compromise, provider ambiguity, or critical alert occurs.

**When** the incident commander or authorized owner pauses payout.

**Then** new payout attempts are held with an honest status; existing state is not deleted or edited; users see a safe next action; and resume requires evidence-based approval.

**Evidence:** Pause scope, incident ID, API/UI status, and resume authority.

### RA-08 — Release evidence is traceable

**Given** a reviewer selects a release gate.

**When** the reviewer follows the evidence index.

**Then** the reviewer can locate commit SHA, artifact/deployment ID, test command/result, source baseline, owner, reviewer, timestamp, known limitation, and expiry without guessing.

**Evidence:** Completed evidence record and reviewer sign-off.

### RA-09 — Hotfix follows the same safety boundary

**Given** a critical production defect requires a hotfix.

**When** the team prepares, reviews, deploys, and evaluates the hotfix.

**Then** the hotfix uses a PR, scoped review, signed provenance policy, targeted tests, rollback target, and post-deploy smoke; `CHANGELOG.md` is not edited outside the approved release process.

**Evidence:** PR metadata, checks, deployment ID, smoke result, and rollback target.

### RA-10 — User receives consistent release status

**Given** the deployment is alpha, beta, degraded, paused, rolled back, or production-ready.

**When** the user views landing, dashboard, wallet, payout, and support surfaces.

**Then** status, limitations, next actions, and support copy are consistent; loading/error/empty states do not display misleading zero balances or completed payouts; and request/correlation IDs can be safely referenced.

**Evidence:** Route matrix, screenshots, API responses, and support copy review.

## 3. UAT result policy

`PASS` requires expected behavior and evidence. `BLOCKED` is appropriate when a documented dependency such as payout gating or pending legal approval prevents execution; it is not a pass. `FAIL` requires defect, owner, severity, and retest. A release cannot receive a final `GO` while any critical scenario is `FAIL`, any required evidence is missing, or a `BLOCKED` scenario has no approved explanation and expiry.
