# Manual QA Checklists

- **Status:** Documentation-only executable checklist
- **Branch:** `feat/manual-qa-checklists`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Anonymous, authenticated user, worker, wallet, payout, referral, admin/operator, mobile, failure/retry, dan reconciliation
- **Out of scope:** Code changes, migration execution, RandomX implementation, `upstream-stratum`, accounting implementation, dan `CHANGELOG.md`

> Checklist ini memverifikasi behavior yang tersedia atau status gated. Item `Target` tidak boleh dilaporkan PASS hanya karena halaman atau endpoint placeholder terlihat.

## 1. Execution protocol

### Test metadata

Tester harus mencatat:

- environment/base URL, browser/device, UTC timestamp, app/API/web commit, API contract version, dan schema version;
- account IDs/worker IDs/payout IDs yang disanitasi;
- request ID, correlation ID, audit ID, screenshot/video, dan log reference;
- precondition data, exact steps, actual result, severity, owner, dan retest date.

### Status and severity

| Status    | Meaning                                                |
| --------- | ------------------------------------------------------ |
| `PASS`    | Expected result dan evidence lengkap                   |
| `FAIL`    | Actual result menyimpang dari expected                 |
| `BLOCKED` | Environment/dependency/permission menghalangi eksekusi |
| `N/A`     | Tidak berlaku dengan alasan tertulis                   |
| `NOT RUN` | Belum dijalankan                                       |

| Severity | Meaning                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------- |
| `P0`     | Security/financial integrity, data loss, double payout, unauthorized access, atau broad outage |
| `P1`     | Core flow tidak dapat digunakan, misleading payout state, atau major operational failure       |
| `P2`     | Degraded UX, non-critical error, atau workaround tersedia                                      |
| `P3`     | Cosmetic/documentation issue                                                                   |

### Evidence rule

Screenshot wajib memperlihatkan state, timestamp, dan environment tanpa secret, token, worker credential, full wallet address, raw IP, atau private data yang tidak diperlukan. Untuk finance/security, screenshot harus dilengkapi request/audit/correlation reference yang disanitasi.

## 2. Test accounts and fixtures

| Fixture           | Purpose                | Requirement                                                       |
| ----------------- | ---------------------- | ----------------------------------------------------------------- |
| `A-ANON`          | Anonymous user         | Tidak memiliki session/cookie valid                               |
| `A-USER-EMPTY`    | New authenticated user | Tanpa worker, reward, wallet, atau referral                       |
| `A-USER-ACTIVE`   | Normal user            | Memiliki worker dan data dashboard fixture                        |
| `A-USER-REFERRAL` | Referral user          | Attribution valid dan settled reward fixture                      |
| `A-USER-MP05`     | Default code path      | Attribution `MP05` → site donation liability                      |
| `A-USER-GATED`    | Payout gated           | Balance/route/global gate menghasilkan blocker yang diketahui     |
| `A-OPERATOR`      | Operational role       | Scope operator sesuai environment, tanpa signer privilege default |
| `A-ADMIN`         | Admin role             | Admin scope, tidak otomatis treasury approval                     |
| `A-CHECKER`       | Maker-checker          | Checker berbeda dari payout maker                                 |
| `A-MOBILE`        | Mobile session         | Viewport 320/375/768 px dan mobile browser                        |

## 3. Anonymous user scenarios

| ID    | Priority | Steps                                              | Expected result                                                         | Evidence              | Status |
| ----- | -------- | -------------------------------------------------- | ----------------------------------------------------------------------- | --------------------- | ------ |
| AN-01 | P1       | Buka landing page tanpa session                    | Hero, positioning, alpha disclosure, CTA, dan status produk tampil      | Screenshot desktop    | ☐      |
| AN-02 | P1       | Buka halaman public transparency/status            | Hanya data agregat; timestamp/freshness dan environment status terlihat | Screenshot + URL      | ☐      |
| AN-03 | P1       | Klik link login/register                           | Route terbuka; tidak ada redirect loop atau broken link                 | Screen recording      | ☐      |
| AN-04 | P1       | Request protected endpoint tanpa token             | HTTP `401` dengan error code normatif; tidak ada data privat            | Response + screenshot | ☐      |
| AN-05 | P2       | Gunakan token invalid/expired pada protected route | `401 UNAUTHENTICATED`/equivalent; token tidak direfleksikan             | Response sanitized    | ☐      |
| AN-06 | P2       | Coba menebak worker/payout ID dari URL/API         | `404` atau generic not-found tanpa ownership disclosure                 | Response              | ☐      |
| AN-07 | P1       | Buka landing pada jaringan lambat                  | Loading state tidak menampilkan angka palsu/zero dan CTA tetap jelas    | Video + timing        | ☐      |
| AN-08 | P1       | Buka halaman saat API unavailable                  | Error state actionable, request ID/support link, tidak ada fake success | Screenshot            | ☐      |

## 4. Authenticated user scenarios

| ID    | Priority | Steps                                           | Expected result                                                               | Evidence                | Status |
| ----- | -------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- | ------ |
| AU-01 | P0       | Register dengan data valid                      | Account dibuat; password/token tidak tampil di UI/log                         | Response + audit        | ☐      |
| AU-02 | P1       | Register email duplicate/invalid/password lemah | Validation aman; tidak membocorkan account existence berlebihan               | Screenshot              | ☐      |
| AU-03 | P0       | Login valid lalu buka dashboard                 | Session valid; user hanya melihat resource miliknya                           | Screenshot + request ID | ☐      |
| AU-04 | P0       | Login dengan password salah berulang            | Rate limit/lock berlaku; event security tercatat                              | Audit + response        | ☐      |
| AU-05 | P0       | Logout lalu request protected endpoint          | Session ditolak setelah logout                                                | Response                | ☐      |
| AU-06 | P0       | Refresh session normal                          | Token rotation sesuai policy; session tetap valid                             | Sanitized network       | ☐      |
| AU-07 | P0       | Replay refresh token lama                       | Replay ditolak/family dicabut sesuai policy; incident event ada               | Audit event             | ☐      |
| AU-08 | P1       | Buka dashboard dengan account tanpa data        | Empty states berisi next action, bukan blank/angka zero misleading            | Screenshot              | ☐      |
| AU-09 | P1       | Buka security/session page                      | Session list, revoke action, 2FA/step-up status, dan last updated tampil      | Screenshot              | ☐      |
| AU-10 | P1       | Request resource user lain menggunakan ID       | `403` atau safe `404`; tidak ada side-channel ownership leak                  | Response                | ☐      |
| AU-11 | P1       | Refresh/reload setelah network reconnect        | UI memulihkan data tanpa duplicate mutation atau reset state yang menyesatkan | Video                   | ☐      |

## 5. Worker scenarios

| ID    | Priority | Steps                                                | Expected result                                                                    | Evidence              | Status |
| ----- | -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------- | ------ |
| WK-01 | P0       | Create worker dengan nama valid dan hardware ASIC    | Worker dibuat, owner benar, status awal jelas                                      | Response + screenshot | ☐      |
| WK-02 | P1       | Create worker dengan nama invalid/duplicate/too long | Validation error; tidak ada partial resource                                       | Response              | ☐      |
| WK-03 | P1       | List/get worker                                      | Worker, algorithm, status, hashrate window, share quality, last seen tampil        | Screenshot            | ☐      |
| WK-04 | P1       | Rename worker                                        | New name tampil konsisten; audit event dan version berubah                         | Screenshot + audit    | ☐      |
| WK-05 | P0       | Disable/delete worker saat active                    | Connection/action behavior sesuai policy; tidak menghapus histori financial        | Log + screenshot      | ☐      |
| WK-06 | P0       | Create/rotate credential                             | Secret tampil sekali; tidak ada secret di log/clipboard history/analytics          | Sanitized capture     | ☐      |
| WK-07 | P0       | Revoke credential lalu reconnect miner               | Credential lama ditolak; credential baru/other worker tidak terdampak              | Stratum/log evidence  | ☐      |
| WK-08 | P1       | Submit duplicate/stale/invalid share fixture         | Share diklasifikasikan benar dan tidak menghasilkan financial contribution invalid | Log/event evidence    | ☐      |
| WK-09 | P1       | Provider/upstream unavailable saat worker aktif      | UI status degraded/offline/unknown dengan timestamp; no fake hashrate              | Screenshot + alert    | ☐      |
| WK-10 | P2       | Open worker detail on mobile                         | Chart/table tidak clipped; unit dan window terbaca                                 | Mobile screenshot     | ☐      |

## 6. Wallet scenarios

| ID    | Priority | Steps                                          | Expected result                                                                  | Evidence              | Status |
| ----- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | --------------------- | ------ |
| WL-01 | P0       | List payout addresses                          | Address masked, fingerprint/network/status/cooldown tampil; no full address leak | Screenshot + response | ☐      |
| WL-02 | P0       | Register valid BTC native address with step-up | Address masuk cooldown; `active=false`, `payoutCapable=false` bila gated         | Response + audit      | ☐      |
| WL-03 | P0       | Register malformed/wrong-network address       | Ditolak sebelum persistence; error actionable                                    | Response              | ☐      |
| WL-04 | P0       | Register tanpa/expired/replayed step-up        | `STEP_UP_REQUIRED`/`STEP_UP_REPLAYED`; no state change                           | Response + audit      | ☐      |
| WL-05 | P1       | Register compatible BEP20 route                | Network warning, route, asset, and confirmation policy tampil                    | Screenshot            | ☐      |
| WL-06 | P0       | Activate address before cooldown               | Ditolak dengan `COOLDOWN_ACTIVE`; no active address change                       | Response              | ☐      |
| WL-07 | P0       | Activate address after cooldown                | One-active-address rule berlaku; previous active state consistent                | Screenshot + audit    | ☐      |
| WL-08 | P1       | Disable active address                         | Payout eligibility recalculates; destination no longer payout-capable            | Response + screenshot | ☐      |
| WL-09 | P0       | Inspect UI/log/analytics during wallet flow    | No secret/full address/token/raw IP leakage                                      | Redaction report      | ☐      |
| WL-10 | P1       | Use browser back/replay submit                 | Idempotency/concurrency prevents duplicate destination or unsafe overwrite       | Network evidence      | ☐      |

## 7. Payout scenarios

| ID    | Priority | Steps                                                   | Expected result                                                                                         | Evidence                     | Status |
| ----- | -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| PO-01 | P0       | Open payout status/routes in alpha                      | `enabled=false`/registration-only/gated reason honest and visible                                       | Screenshot + response        | ☐      |
| PO-02 | P0       | Check pending/immature balance                          | Not eligible; maturity/pending reason shown; no payout action                                           | Screenshot                   | ☐      |
| PO-03 | P0       | Check settled balance below minimum                     | `BELOW_MINIMUM_PAYOUT`; threshold and next action visible                                               | Response + screenshot        | ☐      |
| PO-04 | P0       | Check eligible balance with route inactive              | `ROUTE_UNAVAILABLE`/`PAYOUT_GATED`; no reservation                                                      | Response + ledger evidence   | ☐      |
| PO-05 | P0       | Toggle auto-withdrawal OFF → ON while executor disabled | Preference may save, but `effective=false`, blockers visible, no payout side effect                     | Response + audit             | ☐      |
| PO-06 | P0       | Toggle auto-withdrawal ON → OFF                         | Preference disabled; scheduler must not create new payout                                               | Audit + queue check          | ☐      |
| PO-07 | P0       | Submit duplicate payout request fixture                 | Same idempotency key returns same outcome; no second reservation                                        | Response + DB/audit evidence | ☐      |
| PO-08 | P0       | Submit same key with different payload                  | `409 IDEMPOTENCY_CONFLICT`; no second side effect                                                       | Response                     | ☐      |
| PO-09 | P0       | Simulate node/provider timeout after broadcast          | State remains recoverable; no blind duplicate broadcast; reconciliation task created                    | Incident/log evidence        | ☐      |
| PO-10 | P0       | Verify approval/signing UI for operator                 | Maker cannot self-check; destination fingerprint/amount/policy shown                                    | Screenshot + audit           | ☐      |
| PO-11 | P0       | Activate emergency payout pause                         | New sensitive actions denied; existing state preserved; status incident visible                         | Screenshot + audit           | ☐      |
| PO-12 | P1       | Inspect payout history                                  | Status, asset/network, amount, fee, destination fingerprint, tx hash/confirmation, failure reason shown | Screenshot                   | ☐      |
| PO-13 | P0       | Simulate reorg/orphan affected reward                   | Reward/payout becomes pending/review; no history deletion or fake completion                            | State/audit evidence         | ☐      |

## 8. Referral scenarios

| ID    | Priority | Steps                              | Expected result                                                                          | Evidence                     | Status |
| ----- | -------- | ---------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| RF-01 | P1       | Validate valid referral code       | Non-mutating preview returns policy/rate and beneficiary type                            | Response                     | ☐      |
| RF-02 | P1       | Validate invalid/expired code      | Safe invalid response; no attribution or financial record                                | Response + DB evidence       | ☐      |
| RF-03 | P0       | Register with valid referral       | Attribution sticky according to policy; no retroactive reassignment                      | Audit + response             | ☐      |
| RF-04 | P0       | Settle reward with referral        | Miner fee `0,375%`; beneficiary `0,125%` from gross; journal balanced                    | Reward fixture + ledger      | ☐      |
| RF-05 | P0       | Settle reward with no referral     | Platform fee `0,50%`; no beneficiary liability                                           | Reward fixture + ledger      | ☐      |
| RF-06 | P0       | Settle `MP05` reward               | `0,125%` is `SITE_DONATION_WALLET` liability; not user balance or hidden platform income | Allocation + policy snapshot | ☐      |
| RF-07 | P0       | Retry settlement/referral event    | No duplicate commission/liability; same result on replay                                 | Idempotency/audit evidence   | ☐      |
| RF-08 | P1       | Open referral summary with no data | Empty state explains no settled commission; no misleading zero                           | Screenshot                   | ☐      |

## 9. Admin/operator scenarios

| ID    | Priority | Steps                                          | Expected result                                                                      | Evidence               | Status |
| ----- | -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------- | ------ |
| OP-01 | P0       | Operator opens dashboard                       | Panels show mining, events, ledger, payout, wallet/node, security, deployment health | Screenshot             | ☐      |
| OP-02 | P0       | Operator searches correlation/request/audit ID | Cross-service trace returns matching safe records                                    | Screenshot + query ref | ☐      |
| OP-03 | P0       | Operator views ledger mismatch alert           | Alert cannot be hidden by green aggregate; payout scope pause/runbook visible        | Alert + incident       | ☐      |
| OP-04 | P0       | Operator tries treasury action without scope   | `403`; no side effect; access event logged                                           | Response + audit       | ☐      |
| OP-05 | P0       | Maker creates approval; checker reviews        | Different checker required; intent hash/amount/destination/policy match              | Audit trail            | ☐      |
| OP-06 | P0       | Operator enables payout gate without approval  | Action denied or requires explicit approval; no config drift                         | Response + audit       | ☐      |
| OP-07 | P1       | Operator inspects node disagreement            | Affected node removed from quorum; payout confirmation/broadcast paused              | Dashboard + incident   | ☐      |
| OP-08 | P1       | Operator reviews backup freshness              | Age, RPO, restore drill result, and unresolved gap visible                           | Dashboard/report       | ☐      |
| OP-09 | P1       | Operator reviews deployment                    | Commit/image/API/schema/config fingerprint and smoke result match                    | Screenshot             | ☐      |
| OP-10 | P0       | Support operator views user resource           | Least privilege, masking, ticket-bound/time-bound access, audit                      | Access log             | ☐      |

## 10. Mobile scenarios

| ID    | Priority | Steps                                              | Expected result                                                              | Evidence            | Status |
| ----- | -------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- | ------ |
| MB-01 | P1       | Open landing at 320/375 px                         | No horizontal overflow; CTA and alpha disclosure readable                    | Screenshots         | ☐      |
| MB-02 | P1       | Open dashboard and navigation                      | Primary menu works with touch, route active, no content obstruction          | Video               | ☐      |
| MB-03 | P1       | Open worker/reward tables                          | Cards/table adapt; units/timestamps remain visible                           | Screenshots         | ☐      |
| MB-04 | P0       | Register wallet/address on mobile                  | Form validation, network warning, step-up, cooldown, and confirmation usable | Video + screenshot  | ☐      |
| MB-05 | P0       | Inspect payout gated state                         | CTA cannot imply successful payout; blocker list readable                    | Screenshot          | ☐      |
| MB-06 | P2       | Trigger offline/slow request                       | Loading/error/retry state usable; no accidental duplicate submit             | Video               | ☐      |
| MB-07 | P1       | Keyboard/focus on mobile browser or assistive tech | Focus and form error announcement remain meaningful                          | Accessibility notes | ☐      |

## 11. Failure and retry scenarios

| ID    | Priority | Steps                                              | Expected result                                                                      | Evidence              | Status |
| ----- | -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------- | ------ |
| FR-01 | P0       | Timeout a safe GET                                 | Retry bounded; request ID changes per attempt; correlation ID may persist            | Network capture       | ☐      |
| FR-02 | P0       | Timeout financial mutation after server acceptance | Client checks operation/idempotency before retry; no duplicate side effect           | Logs + response       | ☐      |
| FR-03 | P1       | Return `409` state conflict                        | UI reloads latest state and explains conflict; no silent overwrite                   | Screenshot            | ☐      |
| FR-04 | P0       | Return `412 VERSION_MISMATCH`                      | UI asks user to review latest state; no mutation                                     | Response + screenshot | ☐      |
| FR-05 | P1       | Return `429` with `Retry-After`                    | Client respects bounded backoff and shows actionable message                         | Network evidence      | ☐      |
| FR-06 | P1       | API 5xx/upstream 503                               | Error classified retryable/non-retryable; no fake zero/paid state                    | Screenshot            | ☐      |
| FR-07 | P0       | Redis unavailable during payout reservation        | Financial action fails safe; Postgres remains source of truth; no double reservation | Incident evidence     | ☐      |
| FR-08 | P0       | PostgreSQL unavailable during ledger write         | No optimistic balance credit; payout/financial writes pause                          | Incident evidence     | ☐      |
| FR-09 | P0       | Signer unavailable                                 | Payout remains in recoverable state; no fallback signing in API/web                  | Audit + state         | ☐      |
| FR-10 | P1       | WebSocket disconnect/reconnect                     | Last update timestamp visible; events not duplicated or silently lost                | Video + logs          | ☐      |

## 12. Reconciliation scenarios

| ID    | Priority | Steps                                                  | Expected result                                                 | Evidence              | Status |
| ----- | -------- | ------------------------------------------------------ | --------------------------------------------------------------- | --------------------- | ------ |
| RC-01 | P0       | Import same upstream settlement twice                  | Second import idempotent; no duplicate allocation/journal       | Import log + ledger   | ☐      |
| RC-02 | P0       | Change source checksum/period mismatch                 | Import rejected or exception created; no forced balance match   | Exception record      | ☐      |
| RC-03 | P0       | Compare gross, fee, referral, user liability, clearing | Totals balance and policy snapshot matches                      | Reconciliation report | ☐      |
| RC-04 | P0       | Simulate orphan/reorg after allocation                 | Reversal/adjustment references original; posted fact unchanged  | Journal + audit       | ☐      |
| RC-05 | P0       | Create payout from non-reconciled balance              | Eligibility denied; no reservation                              | Response + ledger     | ☐      |
| RC-06 | P0       | Wallet/node balance differs from internal liability    | Payout pauses; mismatch exception includes owner/deadline       | Alert + incident      | ☐      |
| RC-07 | P1       | Rebuild read model/projection                          | Dashboard recomputes from durable events and matches source     | Before/after report   | ☐      |
| RC-08 | P0       | Resolve mismatch through approved correction           | Only reversal/adjustment posted; trial balance remains balanced | Approval + journal    | ☐      |

## 13. Accessibility and content gate

- [ ] Every interactive control has accessible name, visible focus, keyboard behavior, and appropriate error association.
- [ ] Contrast, target size, table responsiveness, reduced motion, and screen-reader order are reviewed.
- [ ] Status terms are consistent: `FOUNDATION`, `PILOT`, `GATED`, `ACTIVE`, `PENDING`, `FAILED`, `RECONCILIATION_EXCEPTION`.
- [ ] Wallet/network warnings and payout risk disclosure appear before irreversible or sensitive actions.
- [ ] Loading and empty states do not use `0`, `paid`, or `active` to represent missing/unverified data.
- [ ] Copy identifies timestamp, data delay, fee, threshold, confirmation, and next action.

## 14. Exit criteria

A QA cycle is complete only when:

1. Semua P0 item `PASS` atau memiliki signed waiver dari owner/security/finance.
2. P1 failures memiliki owner, severity, reproducible steps, target fix, dan retest plan.
3. Tidak ada secret, full wallet address, token, atau production personal data pada evidence.
4. Payout remains gated unless controlled-funds approval is independently recorded.
5. API/web commit, contract version, config fingerprint, and environment are attached.
6. Failed/retry/reconciliation scenarios have incident or exception references where applicable.
7. Test summary reports executed, blocked, failed, waived, and not-run counts by scenario.

Manual QA tidak menggantikan automated unit/integration/contract/security/load/chaos testing. Checklist ini adalah executable acceptance aid dan bukan authorization untuk mengubah feature gate.
