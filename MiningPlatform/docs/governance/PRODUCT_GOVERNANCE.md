# Product Governance and P0 Decision Log

**Status:** Working decision record; implementation remains gated.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/product-governance`
**Owner:** Product owner, with engineering, security, operations, treasury, and legal/compliance reviewers.

## 1. Purpose

Dokumen ini mengubah keputusan produk yang tersebar menjadi keputusan yang dapat ditelusuri. Setiap keputusan P0 harus memiliki owner, tanggal, status, rationale, dependency, dan acceptance evidence. Dokumen ini tidak mengaktifkan payout, signer, custody, native mining, atau perubahan schema.

## 2. Decision status vocabulary

| Status | Meaning | Allowed implementation posture |
|---|---|---|
| `PROPOSED` | Usulan belum disetujui | Dokumentasi dan fixture saja |
| `APPROVED-CONDITIONAL` | Disetujui dengan gate/dependency | Implementasi hanya pada scope yang disebut |
| `APPROVED` | Disetujui untuk milestone | Boleh diimplementasikan setelah technical/security gates hijau |
| `REJECTED` | Tidak digunakan | Jangan diimplementasikan |
| `SUPERSEDED` | Digantikan keputusan baru | Simpan untuk audit; gunakan keputusan terbaru |

## 3. Product decisions

| ID | Decision | Current status | Owner/approver | Rationale | Acceptance evidence |
|---|---|---|---|---|---|
| PG-001 | Alpha payout remains gated; no real broadcast during alpha | `APPROVED-CONDITIONAL` | Product + Security + Treasury | UI/API readiness is not proof of safe custody | Release gate, payout smoke test with dummy mode, signed go/no-go |
| PG-002 | User payout destination is account-scoped and never replaced by global configuration | `APPROVED-CONDITIONAL` | Product + Engineering | Prevents misdirected funds and default-wallet confusion | Wallet policy tests and audit event evidence |
| PG-003 | BTC route and BEP20 route are separate asset/network paths | `APPROVED-CONDITIONAL` | Engineering + Treasury | Prevents cross-network loss | Network validation vectors and rejection evidence |
| PG-004 | MP05 is donation/referral beneficiary only, never a user payout fallback | `APPROVED-CONDITIONAL` | Product + Treasury + Legal | Avoids undisclosed diversion and custody ambiguity | Fee/referral settlement fixture and public disclosure copy |
| PG-005 | Initial reward scheme | `PROPOSED` | Product + Finance + Engineering | Must be selected after variance/reserve analysis | Signed reward-scheme decision record |
| PG-006 | Legal operating jurisdiction | `PROPOSED` | Legal/Compliance | Determines KYC/AML, sanctions, tax, privacy, and custody obligations | Counsel memo and jurisdiction go/no-go |
| PG-007 | Minimum payout BTC/BEP20 | `PROPOSED` | Product + Treasury + Finance | Must balance user utility, fee economics, reserve, and operational load | Approved threshold table and payout acceptance fixture |
| PG-008 | Confirmation/maturity depth | `PROPOSED` | Engineering + Treasury + Security | Must protect against orphan/reorg and unconfirmed liability | Block lifecycle policy plus regtest evidence |
| PG-009 | Pool reserve limit | `PROPOSED` | Finance + Treasury + Security | Limits payout exposure during node, reorg, or reconciliation incidents | Reserve policy, alert threshold, and pause runbook |
| PG-010 | Production SLA target | `PROPOSED` | Operations + Product | Must reflect HA architecture and incident response capacity | SLO document, dashboard, and incident drill |

## 4. RACI

| Area | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Reward scheme | Engineering + Finance | Product owner | Treasury, Security, Operations | QA, Support |
| Wallet destination policy | Engineering | Treasury owner | Security, Legal | Product, Support |
| Payout approval and signer | Operations + Treasury | Treasury owner | Security, Finance, Engineering | Product, Support |
| Ledger/reconciliation | Finance engineering | Finance owner | Treasury, Security, Operations | Product |
| RandomX/native mining integration | Mining engineering | Engineering lead | Security, Operations, Finance | Product, QA |
| Legal jurisdiction and KYC/AML | Legal/Compliance | Compliance owner | Product, Treasury, Security | Engineering, Support |
| Release go/no-go | Release owner | Product owner | Engineering, Security, Operations, Finance, Legal | All stakeholders |

## 5. Glossary

| Term | Normative meaning |
|---|---|
| Deposit wallet | Address used to receive supported user deposits, if deposits are ever enabled. It is not a payout destination. |
| Payout wallet/destination | Address stored for a specific account and validated for the selected asset/network. |
| Pool treasury | Operational pool-controlled funds used for approved pool liabilities and operations. |
| Donation wallet | Site beneficiary address for donations or referral beneficiary proceeds. MP05 points here when the approved referral policy says so. |
| Minimum payout | Smallest eligible user amount before reservation; it is not a guarantee of immediate broadcast. |
| Maturity | Required block confirmations before reward/liability becomes eligible under policy. |
| Reserve | Controlled operational liquidity or liability buffer; it is not user balance and must not be silently reallocated. |
| Liability | Amount the system owes according to accepted contribution, reward, fee, and policy state. |
| Gated payout | Payout flow that can be displayed or simulated but cannot sign/broadcast until all release gates pass. |
| Drift check | Comparison of documentation contract against the implementation/source baseline after Codex checkpoint. |

## 6. Open decision approval template

Every `PROPOSED` decision must be updated with the following fields before implementation:

```text
Decision ID:
Proposed value:
Alternatives considered:
Owner:
Approvers:
Effective date:
Dependencies:
Risk if wrong:
Rollback/disable path:
Acceptance evidence:
Status:
```

## 7. P0 gate

A P0 implementation may proceed only if the related decision is `APPROVED` or `APPROVED-CONDITIONAL` with all named conditions satisfied. A documentation branch never changes decision status by itself. Any conflict between this document and the latest signed product/legal decision must be resolved by updating this record before code is integrated.
