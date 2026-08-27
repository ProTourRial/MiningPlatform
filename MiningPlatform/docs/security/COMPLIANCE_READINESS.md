# KYC, AML, Sanctions, and Compliance Readiness

**Status:** Working compliance checklist; not legal advice or approval.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/compliance-readiness`

> This draft must be reviewed by qualified counsel and a compliance professional for the actual operating jurisdictions. It does not determine whether MiningPlatform may offer custody, exchange, referral, or payout services.

## 1. Jurisdiction decision log

| Decision                                                        | Status | Required approver           | Blocking consequence                                    |
| --------------------------------------------------------------- | ------ | --------------------------- | ------------------------------------------------------- |
| Legal entity and operating jurisdiction                         | `OPEN` | Counsel/board/owner         | No production payout or custody                         |
| Countries/regions served or excluded                            | `OPEN` | Counsel/compliance          | No public availability claim                            |
| Nature of service: pool, payout processor, custody, or exchange | `OPEN` | Counsel/compliance/treasury | No assumption that pool status removes obligations      |
| KYC trigger and tiering                                         | `OPEN` | Compliance owner            | No payout policy beyond alpha gate                      |
| AML transaction monitoring                                      | `OPEN` | Compliance owner            | No unrestricted payout                                  |
| Sanctions screening provider and cadence                        | `OPEN` | Compliance owner            | No payout to unscreened destination/user where required |
| Tax reporting and records                                       | `OPEN` | Tax adviser                 | No launch claim on tax treatment                        |
| Privacy/data processing basis                                   | `OPEN` | Counsel/privacy owner       | No collection beyond minimum alpha data                 |

## 2. Risk-based controls

The implementation must define risk tiers using jurisdiction, user/account signals, transaction size/frequency, destination/network, sanctions result, referral abuse, and anomalous behavior. A risk score cannot silently override a hard block such as sanctions match, invalid destination, compromised account, or legal exclusion.

| Control                | Minimum requirement                                                          | Evidence                                              |
| ---------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| Identity/KYC           | Trigger, provider, result, review, expiry, and appeal path                   | Synthetic decision fixture and vendor record          |
| AML monitoring         | Thresholds, velocity rules, clustering/anomaly escalation                    | Alert test and case log template                      |
| Sanctions              | Source list, refresh cadence, exact/near-match review, disposition           | Screening evidence without raw sensitive data in repo |
| Transaction monitoring | Payout, referral, reserve, and wallet-change rules                           | Monitoring matrix and owner                           |
| Record retention       | Legal hold, retention class, deletion restriction, access log                | Approved retention schedule                           |
| User communication     | Clear hold/rejection reason, appeal channel, no tipping-off where prohibited | Reviewed copy and support template                    |
| Vendor risk            | Provider security, availability, data location, subprocessor review          | Vendor assessment                                     |

## 3. Payout go/no-go

Real payout is blocked until the operating jurisdiction, supported user regions, KYC/AML trigger, sanctions process, data processing basis, tax review, record retention, and escalation authority are approved. Alpha may expose a gated UI or synthetic workflow only if the risk disclosure clearly states that no real payout is available.

## 4. Privacy boundary

Only minimum data required for account security, payout policy, compliance decision, audit, and support may be collected. Wallet addresses, destination fingerprints, KYC results, sanctions results, and transaction metadata require explicit classification, access control, retention, redaction, and deletion/hold rules. Sensitive personal data and vendor credentials must never be placed in fixtures, source control, or public transparency responses.

## 5. Escalation and incident response

A potential sanctions hit, suspicious activity, wallet compromise, fraud, or legal complaint is escalated to the compliance owner and incident commander. The system may hold the affected payout/account, but operators must follow counsel-approved communication and recordkeeping rules. No operator may manually clear a compliance hold without the required reviewer and evidence.

## 6. Acceptance criteria

1. Every jurisdiction and payout mode has an explicit approved or rejected status.
2. Compliance triggers and hard blocks are mapped to API state, audit event, UI copy, and support action.
3. KYC/AML/sanctions data classification and retention are approved before sensitive data collection.
4. Synthetic test scenarios cover clear, review, reject, expiry, appeal, and provider-unavailable outcomes.
5. Legal/compliance owners sign the go/no-go record for the selected operating model.
