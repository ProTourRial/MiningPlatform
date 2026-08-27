# Security and Compliance Readiness

> **Draft — review before use:** Saya adalah AI, bukan pengacara. Dokumen ini adalah working draft/analysis, bukan nasihat hukum; qualified attorney dan compliance professional harus meninjau sebelum dijadikan kebijakan, dipublikasikan, atau dipakai untuk menerima dana nyata.

- **Status:** Documentation-only readiness plan
- **Branch:** `feat/security-compliance-readiness`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Threat model, wallet compromise, maker-checker, secrets, signer isolation, rate limiting/DDoS, privacy classification, dan KYC/AML decision log
- **Out of scope:** Implementasi kode, schema, migration, RandomX, `upstream-stratum`, accounting implementation, dan `CHANGELOG.md`

## 1. Security objectives

MiningPlatform harus melindungi tiga hal secara terpisah: **mining truth**, **financial truth**, dan **key/custody boundary**. Availability dapat diturunkan sementara untuk menjaga integritas saldo dan payout. Dashboard, cache, atau optimistic UI tidak boleh menjadi sumber kebenaran transaksi.

Tujuan minimum sebelum payout nyata:

1. Tidak ada private key, seed phrase, worker secret, refresh token, atau full wallet address pada log, browser, database aplikasi, analytics, atau support ticket.
2. Setiap sensitive action memiliki authenticated actor, scope, step-up bila perlu, policy version, idempotency, optimistic concurrency, audit event, dan correlation ID.
3. Payout hanya berjalan melalui eligibility → reservation → approval → isolated signing → broadcast → confirmation → reconciliation.
4. Semua financial correction berupa reversal/adjustment yang dapat ditelusuri; tidak ada edit/delete terhadap posted fact.
5. Incident dapat mengaktifkan emergency stop tanpa kehilangan evidence dan tanpa memerlukan perubahan database manual.

## 2. Threat model

### 2.1 Assets

| Asset             | Contoh                                                     | Dampak kompromi                                     |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| User identity     | Account, session, 2FA, recovery                            | Account takeover, unauthorized wallet change        |
| Worker identity   | Worker credential, alias, farm metadata                    | Unauthorized mining, telemetry pollution            |
| Financial records | Reward, fee, referral, ledger, balance, payout reservation | False liability, double payout, user loss           |
| Wallet boundary   | Signing key, HSM/KMS reference, hot/warm/cold allocation   | Irreversible fund theft                             |
| Infrastructure    | PostgreSQL, Redis, nodes, API, Stratum, CI/CD              | Data loss, service outage, supply-chain compromise  |
| Private data      | Email, IP, location, worker telemetry, wallet fingerprint  | Privacy harm, profiling, targeted attack            |
| Trust surface     | Transparency, status, terms, support, API docs             | Misleading claims, impersonation, reputational loss |

### 2.2 Adversaries and abuse cases

| Actor                           | Abuse case                                        | Primary controls                                           |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Unauthenticated internet client | Credential stuffing, endpoint enumeration, DDoS   | Edge protection, rate limit, generic errors, MFA           |
| Compromised user                | Change destination, create payout, abuse referral | Step-up, cooldown, device/session review, limits           |
| Malicious miner                 | Fake/duplicate/low-difficulty/stale shares        | Protocol validation, dedupe, difficulty, upstream evidence |
| Compromised operator            | Approve/sign unauthorized transfer                | RBAC, maker-checker, HSM/KMS, audit, dual control          |
| Malicious insider               | Alter balance or hide mismatch                    | Immutable ledger, separation of duties, reconciliation     |
| Provider compromise             | Wrong settlement, malicious transaction response  | Multi-source verification, signed import, limits, pause    |
| Supply-chain attacker           | Malicious dependency/image/CI secret access       | Lockfile review, artifact attestations, secret scanning    |
| Chain/network event             | Reorg, double-spend, node disagreement            | Confirmation policy, node quorum, reorg state machine      |
| Privacy attacker                | Link identity to address/worker/farm              | Minimize data, masking, access logging, retention limits   |

### 2.3 Security assumptions to validate

- Threat model provider/node tidak diasumsikan selalu benar.
- Checksum address hanya memvalidasi format, bukan ownership.
- PostgreSQL authoritative untuk durable financial facts; Redis/cache dapat hilang tanpa mengubah saldo.
- Backup dapat diakses dengan privilege berbeda dari production write path.
- Emergency stop tetap dapat bekerja ketika dependency utama bermasalah.

## 3. Wallet compromise procedure

### Trigger

Aktifkan Sev-1 bila key/seed/signer token mungkin terekspos, transaksi tidak dikenal muncul, approval/signing audit tidak lengkap, hot wallet balance berubah tanpa intent, atau host signer/cloud identity dicurigai dikompromikan.

### Immediate containment

1. Assume compromise until disproven; pause payout, conversion, signer access, dan wallet broadcast.
2. Revoke API keys, operator sessions, cloud tokens, RPC credentials, CI secrets, dan signer sessions yang relevan.
3. Preserve KMS/HSM audit, signer logs, host snapshot, access logs, transaction history, image digest, dan config fingerprint.
4. Jangan mengirim rescue transaction secara spontan. Setiap transfer darurat membutuhkan incident commander, security lead, treasury owner, dan second approver.
5. Bandingkan internal ledger, payout intents, reservations, wallet balance, node state, dan blockchain transactions.
6. Notify owner, security, treasury/finance, legal/compliance, infrastructure provider, dan affected counterparties sesuai severity.

### Recovery

- Generate a new key boundary melalui approved ceremony; jangan reuse suspected key.
- Review allowlist, velocity limit, approval roles, hot/warm/cold allocation, and emergency stop.
- Reconcile all known/unknown transactions and mark unresolved movements as exceptions.
- Rotate secrets after evidence capture, not before, unless continued exposure requires immediate rotation.
- Restore signer hanya setelah independent security review, wallet/node reconciliation, and owner approval.
- Complete postmortem and determine breach notification, user notification, law-enforcement, and regulator obligations with counsel.

Private key, seed phrase, raw token, dan full address dilarang ditulis ke incident chat atau issue tracker.

## 4. Maker-checker approval

### Separation of duties

| Action                       | Maker                    | Checker                          | Additional control                 |
| ---------------------------- | ------------------------ | -------------------------------- | ---------------------------------- |
| Request payout               | User/system              | —                                | Eligibility and idempotency        |
| Release reservation          | Payout operator          | Finance/treasury                 | Reason and original intent         |
| Approve payout               | Treasury maker           | Independent treasury checker     | Amount/destination/policy review   |
| Sign transaction             | Isolated signer service  | KMS/HSM policy                   | Key boundary and limit             |
| Change payout route/limit    | Product/operations maker | Security + treasury + owner      | Effective time and rollback        |
| Change fee/referral policy   | Product maker            | Finance + owner; legal as needed | Versioned policy and disclosure    |
| Emergency resume after pause | Incident commander       | Security + treasury + operations | Time/amount/scope-limited approval |

Rules:

- Maker tidak boleh menjadi satu-satunya checker untuk action yang memindahkan dana.
- Approval terikat pada immutable intent hash: asset, network, amount, destination fingerprint, policy version, expiry, dan purpose.
- Approval stale, replayed, revoked, atau out-of-scope harus ditolak.
- Every approval/rejection emits audit event with actor, role, timestamp, reason, request ID, correlation ID, and incident ID where relevant.
- Emergency break-glass access is time-bound, logged, reviewed after use, and never a normal payout path.

## 5. Secret rotation and signer isolation

### Secret classes

| Secret               | Storage                            | Rotation trigger                             | Evidence                  |
| -------------------- | ---------------------------------- | -------------------------------------------- | ------------------------- |
| User/session token   | Hashed/secure session store        | Replay, compromise, expiry                   | Session audit             |
| Worker credential    | Hash or one-time display boundary  | User request, compromise, worker retirement  | Rotation/revocation event |
| API key              | Hashed, scoped, last-used metadata | Schedule, leak, role change                  | Key audit                 |
| DB/Redis credential  | Secret manager                     | Personnel/deployment/provider change         | Access review             |
| Node RPC credential  | Private secret manager             | Node rotation, exposure, role change         | RPC access log            |
| Signer/KMS reference | HSM/KMS policy                     | Key ceremony, compromise, scheduled rotation | KMS/HSM audit             |

### Isolation requirements

- Web/API/frontend never receives or stores private key or seed material.
- Signer accepts a typed payout intent, not arbitrary raw transaction from a user request.
- Signer verifies intent hash, asset/network, destination fingerprint, amount limit, expiry, approval set, and policy version before signing.
- KMS/HSM key policy is separate from application deployment identity; access is allowlisted and audited.
- Signer runtime has minimal network access and cannot read user database broadly.
- Raw transaction, key reference, and tx hash are logged only as safe references; key material is never logged.
- Key rotation has ceremony, dual control, test transaction policy, old-key retirement, and reconciliation.
- Backup of key material, if legally/operationally necessary, uses a separate encrypted custody process and never appears in normal application backup.

## 6. Rate limiting and abuse/DDoS response

### Rate-limit classes

| Surface             | Key                                    | Initial control                                               |
| ------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Login/register      | IP + account fingerprint               | Low burst, progressive backoff, CAPTCHA/challenge when needed |
| Step-up/2FA         | Account + device/IP                    | Strict attempt limit, lock/recovery workflow                  |
| Worker auth/Stratum | Worker credential + IP/region          | Connection cap, auth failure backoff, per-worker quota        |
| Read API            | Principal/API key + endpoint           | Token bucket, `429`, `Retry-After`                            |
| Financial mutation  | Principal + resource + idempotency key | Low rate, concurrency guard, maker-checker                    |
| Webhook delivery    | Destination + event type               | Bounded retry, dead-letter, signature verification            |
| Public transparency | IP/edge                                | CDN/cache, aggregate-only, no sensitive backend query         |

### DDoS/abuse response

1. Confirm whether the event is volumetric, protocol-level, credential abuse, application exhaustion, or financial fraud.
2. Activate edge protection, connection caps, regional isolation, provider circuit breaker, or read-only mode as appropriate.
3. Protect PostgreSQL and Redis from retry storms; apply backpressure and shed nonessential work.
4. Preserve allowlisted admin/on-call path without exposing origin directly.
5. If financial integrity is uncertain, pause payout even if mining availability remains healthy.
6. Record source ranges, request classes, rate-limit action, impact, and provider escalation; avoid retaining unnecessary personal data.
7. Remove mitigation gradually after stable observation window and review residual risk.

## 7. Privacy data classification

| Class                    | Examples                                                            | Handling                                                          |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P0 secret                | Private key, seed phrase, access/refresh token, worker secret       | Never log/store in plaintext; immediate rotation if exposed       |
| P1 highly sensitive      | Full payout address, raw IP, exact farm location, security evidence | Restricted access, encryption, audit, short operational retention |
| P2 personal/account      | Email, account ID, sessions, support history, device metadata       | Purpose limitation, access control, retention and deletion policy |
| P3 financial operational | Balance, reward, fee, referral liability, payout state, tx hash     | Need-to-know; ledger/legal retention; user-scoped read            |
| P4 internal operational  | Service metrics, trace IDs, provider health, deployment data        | Internal access; redact identifiers; bounded metric cardinality   |
| P5 public aggregate      | Pool hashrate, uptime, incident status, fee policy                  | Privacy-reviewed read model; timestamp and freshness              |

Minimum data controls:

- Define controller/processor, purpose, lawful basis, retention, deletion, export, access request, breach response, and subprocessor list with counsel.
- Mask address and identifiers by default; fingerprint is for correlation, not public discovery.
- Do not use user ID, payout ID, tx hash, or request ID as high-cardinality metric labels.
- Support/debug access is time-bound, ticket-bound, logged, and preferably read-only.
- Production data must not be copied to development without minimization and sanitization.

## 8. KYC/AML decision log

This is a decision log template, not a conclusion that any specific license or control is legally sufficient.

| Decision                     | Current status                          | Decision owner        | Required analysis/evidence                                       |
| ---------------------------- | --------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| Operating legal entity       | `TBD — pending legal review`            | Owner + Legal         | Entity, beneficial owner, place of business                      |
| Launch jurisdictions         | `TBD — pending legal review`            | Owner + Legal         | Country/state licensing, consumer, tax, privacy                  |
| Custody characterization     | `TBD — pending product/legal review`    | Legal + Treasury      | Whether platform controls funds/keys or only routes settlement   |
| Conversion activity          | `TBD — pending legal/compliance review` | Legal + Finance       | Exchange/money-service implications and provider obligations     |
| KYC tiers                    | `TBD — pending risk appetite`           | Compliance + Security | Thresholds, enhanced due diligence, account/payout triggers      |
| AML monitoring               | `TBD — pending program design`          | Compliance            | Structuring, velocity, linked accounts, address risk, escalation |
| Sanctions screening          | `TBD — provider selection`              | Compliance + Security | Jurisdictions, lists, false positives, screening events          |
| Travel rule/data sharing     | `TBD — pending asset/network scope`     | Legal + Compliance    | Applicability, vendors, privacy and data transfer                |
| Suspicious activity handling | `TBD — pending legal review`            | Compliance            | Case management, reporting, retention, confidentiality           |
| Tax records/reporting        | `TBD — pending tax review`              | Finance + Tax advisor | Reward, fee, referral, conversion, payout exports                |
| Referral/donation liability  | `TBD — pending legal/accounting review` | Finance + Legal       | MP05 beneficiary, disclosure, donation treatment, reporting      |
| Restricted users/assets      | `TBD — pending jurisdiction matrix`     | Legal + Compliance    | Blocking, geofencing, notice, appeal, audit                      |

### Decision log acceptance

- [ ] Every row has an owner, decision date, approver, source analysis, effective date, and review date.
- [ ] No real-funds launch while legal entity, operating jurisdictions, custody model, sanctions, KYC/AML, and tax position are unresolved.
- [ ] UI terms do not promise availability in a jurisdiction that has not been reviewed.
- [ ] User data collection is minimized to the chosen compliance model.
- [ ] Compliance holds are represented as explicit payout states, not hidden balance changes.

## 9. Acceptance criteria

- [ ] Threat model is reviewed by security owner and mapped to controls, tests, and runbooks.
- [ ] Wallet compromise game day is completed with key rotation and reconciliation evidence.
- [ ] Maker-checker roles, approval intent hash, expiry, replay protection, and audit are defined.
- [ ] Secret inventory, storage, rotation, revocation, and evidence are owned.
- [ ] Signer isolation threat model and KMS/HSM access review are complete.
- [ ] Rate limits and DDoS controls are tested without exposing origin or starving on-call access.
- [ ] Privacy classification appears in API/log/metric review and support access policy.
- [ ] KYC/AML/sanctions/tax decisions are approved before accepting custody or activating payout.
- [ ] All unresolved decisions remain visibly gated and are not silently encoded as production defaults.

No security/compliance implementation is authorized by this documentation-only branch.
