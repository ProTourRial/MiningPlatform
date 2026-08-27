# Legal Readiness Draft

**Status:** Non-binding working draft; requires qualified counsel review.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/legal-readiness`

> This document is not legal advice, does not create contractual rights by itself, and must not be published as final policy without counsel approval for the actual operating jurisdictions.

## 1. Privacy policy outline

MiningPlatform should describe the categories of data collected, purpose, lawful basis where applicable, retention, processors/subprocessors, international transfer, security controls, user rights, complaint path, and contact owner. Data categories include account/session data, worker metadata, wallet destination and validation evidence, payout and reward records, referral attribution, security/audit events, support records, and compliance results when legally required.

The public policy must state that wallet addresses are not automatically replaced by site or donation addresses, that the platform does not collect private keys or seed phrases, and that public transparency uses aggregated data only.

## 2. Terms of service outline

The terms should define the service scope, alpha/beta/production status, eligibility, supported asset/network routes, reward and fee policy, payout gating, minimum payout and maturity decisions, user responsibilities, prohibited abuse, wallet ownership, suspension/hold rights, reorg/orphan risk, provider/node dependency, data/privacy references, limitation of liability, dispute process, changes, termination, and contact channel.

The terms must not promise a payout amount, uptime, reward scheme, or jurisdictional availability before those values are approved and implemented.

## 3. Risk disclosure

Mining pool returns vary with network difficulty, pool luck, hashrate, stale/rejected shares, block orphan/reorg events, transaction fees, provider/node availability, reward policy, operational reserve, and legal/compliance restrictions. During alpha, payout may remain gated and UI/API availability does not mean funds are held, owed, signed, or broadcast. Users must select the correct asset and network and must not provide private keys or seed phrases.

A reorg or orphan can delay, reduce, reverse, or invalidate an immature reward under the approved block lifecycle policy. Payouts may be paused for security, reconciliation, compliance, reserve, or infrastructure reasons.

## 4. Payout-gated notice

> **Payouts are currently gated during alpha.** You may configure and validate a destination, but no real payout is promised or broadcast until the required reward, wallet, security, compliance, operational, and release gates are approved. Your payout destination is account-specific; site donation/referral addresses are not fallback destinations for user balances.

## 5. Data processing inventory

| Data                 | Purpose                              | Classification           | Retention decision                                  |
| -------------------- | ------------------------------------ | ------------------------ | --------------------------------------------------- |
| Account/session      | Authentication and security          | Personal/confidential    | Pending legal approval                              |
| Worker metadata      | Mining operations and support        | Operational              | Pending retention policy                            |
| Wallet destination   | Payout routing and validation        | Financial/confidential   | Keep through legal/audit hold; exact period pending |
| Payout/reward/ledger | Financial reconciliation             | Financial/high integrity | Retain per legal/accounting requirement             |
| Referral attribution | Fee settlement and abuse review      | Operational/financial    | Retain with settlement evidence                     |
| Audit/security event | Accountability and incident response | Security/confidential    | Preserve under legal hold rules                     |
| KYC/AML/sanctions    | Compliance decision                  | Sensitive/restricted     | Provider/legal-specific                             |
| Public metrics       | Transparency                         | Aggregated/public        | Bounded historical retention                        |

## 6. Unresolved legal decisions

Counsel must decide legal entity and operating jurisdiction, service classification, countries served/excluded, custody/payment obligations, KYC/AML and sanctions triggers, tax reporting, privacy basis, cross-border transfer, consumer disclosures, referral treatment, and dispute/complaint handling. Until decisions are approved, production payout and custody remain blocked.

## 7. Acceptance criteria

The legal workstream is complete only when counsel approves publishable privacy and terms text, the risk disclosure reflects the actual implementation state, jurisdiction and payout decisions are recorded, data retention/deletion is aligned with legal hold and reconciliation, and release evidence links the approved documents to the go/no-go record.
