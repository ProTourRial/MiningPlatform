# Threat Model Readiness

**Status:** Working threat model; requires Security/Engineering/Treasury review.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/threat-model-readiness`

## 1. Assets and trust boundaries

| Asset | Boundary | Impact if compromised |
|---|---|---|
| User payout destination and ownership evidence | Browser/API to wallet policy | Misrouted or unauthorized payout |
| Eligibility/reservation/liability state | API to ledger/database | Double-credit, lost liability, or blocked withdrawal |
| Signer/PSBT material | Operations to isolated signer | Direct loss of treasury or user funds |
| Bitcoin Core/provider responses | Pool service to external node/provider | False confirmation, reorg error, or broadcast ambiguity |
| RandomX accepted-share evidence | Gateway/validator to reward handoff | Inflated/understated reward and denial of service |
| Referral/fee policy | Product control plane to settlement | Incorrect beneficiary or fee leakage |
| Secrets and sessions | CI/deployment/runtime | Account takeover or service compromise |
| Public transparency data | Internal aggregates to web | Privacy leakage or misleading status |
| Logs/audit evidence | Services to observability storage | Loss of accountability or sensitive-data exposure |

## 2. Attacker capabilities

The threat model assumes anonymous internet users can submit malformed API requests, replay valid requests, create many accounts/workers, attempt credential stuffing, submit invalid/stale/replayed shares, exploit race conditions, trigger provider timeouts, and abuse referral flows. It also assumes a compromised application credential, malicious or faulty provider response, operator error, and a compromised signer boundary are possible scenarios.

## 3. P0 abuse cases and controls

| ID | Abuse case | Control | Required evidence |
|---|---|---|---|
| TM-001 | Payout to wrong network | Asset/network binding, checksum validation, no global fallback | Wallet validation tests and rejection audit |
| TM-002 | Payout double-credit | Reservation idempotency, optimistic concurrency, immutable state event | Duplicate retry fixture and ledger evidence |
| TM-003 | Unauthorized wallet change | Step-up authentication, ownership confirmation, cooldown, withdrawal lock | Wallet-change audit and UAT |
| TM-004 | Maker approves own payout | Maker-checker separation and scoped approval digest | Approval audit with distinct identities |
| TM-005 | Blind retry after ambiguous broadcast | Provider query and transaction identity reconciliation | Incident runbook exercise |
| TM-006 | Reward inflation through share replay | Contribution evidence identity, replay detection, bounded labels | RandomX/share fixture and rejection metric |
| TM-007 | Reorg/orphan overpayment | Block state machine, maturity, reversal, reconciliation | Block lifecycle fixture |
| TM-008 | Referral self-attribution/double allocation | Immutable attribution, policy ID, abuse and clawback path | Fee/referral fixtures |
| TM-009 | Credential stuffing/session abuse | Rate limiting, session refresh/revocation, anomaly alert | API integration and security test |
| TM-010 | Sensitive data in logs/metrics | Redaction, allowlisted labels, destination fingerprints | Log/metric static review |
| TM-011 | DDoS/worker flood | Edge limits, TCP protection, worker quotas, backpressure | Abuse runbook and load test plan |
| TM-012 | Secret/signer compromise | Secret rotation, least privilege, isolated signer, emergency pause | Rotation drill and signer boundary review |

## 4. Security requirements

The production implementation must fail closed when destination/network validation, ownership evidence, maturity, reserve, reconciliation, approval, or signer policy is missing. Error responses must not disclose private key material, full wallet addresses when unnecessary, internal node credentials, or sensitive account enumeration details.

Security events require correlation ID, request ID, audit ID, actor class, action, outcome, reason code, timestamp, and affected scope. Metrics must use bounded allowlisted labels and never include raw addresses, transaction hashes, user IDs, or tokens.

## 5. Residual risks

| Risk | Current treatment | Accepted only when |
|---|---|---|
| Native mining boundary not yet integrated | Frozen pending Codex checkpoint | Codex commit, integration tests, and security scan complete |
| Signer and broadcast not implemented | Payout remains gated | Isolated signer, maker-checker, smoke test, and reconciliation pass |
| Compliance jurisdiction unresolved | Legal/compliance decision pending | Counsel/compliance go/no-go exists |
| Provider/node outage or ambiguity | Pause and reconcile | HA/failover drill and incident evidence pass |
| Low pool luck/reserve variance | PPLNS proposal and reserve controls | Finance approves reserve and disclosure |

## 6. Security review exit criteria

Every P0 threat has an owner, preventive control, detective signal, response action, and test evidence. Any unmitigated critical threat blocks payout launch. The document is a planning artifact and does not replace the Codex security scan or professional security review.
