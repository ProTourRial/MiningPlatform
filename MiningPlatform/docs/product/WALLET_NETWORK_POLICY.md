# Wallet and Network Policy

- **Status:** Documentation-only policy draft
- **Branch:** `feat/wallet-network-policy`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Wallet roles, address format/checksum, network separation, ownership confirmation, cooldown, withdrawal lock, audit, fallback, dan emergency pause
- **Out of scope:** Backend implementation, schema, migration, RandomX, `upstream-stratum`, accounting implementation, dan `CHANGELOG.md`

> **Core rule:** wallet payout destination bukan “default wallet” umum. Ia adalah address milik akun tertentu untuk route asset/network tertentu. Tidak ada konfigurasi global yang boleh mengganti tujuan payout akun secara otomatis.

## 1. Wallet roles and terminology

| Istilah                  | Fungsi                                                                                          | Siapa yang mengendalikan                          |                              Boleh menerima payout pengguna? | Boleh menjadi fallback pengguna? |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | -----------------------------------------------------------: | -------------------------------: |
| **Wallet deposit**       | Address untuk menerima deposit dari pengguna, bila fitur deposit diaktifkan pada masa depan     | User/platform sesuai custody model yang disetujui |                                        Tidak secara implisit |                        **Tidak** |
| **Wallet payout**        | Destination address yang didaftarkan user per account, asset, dan network untuk menerima payout | Pengguna/wallet tujuan                            |              **Ya, jika route ACTIVE dan payout gate lulus** |               **Tidak otomatis** |
| **Pool treasury**        | Wallet operasional untuk settlement, reserve, fee, liquidity, atau controlled payout            | Treasury/operator dengan maker-checker            |                               Bukan tujuan payout user biasa |                        **Tidak** |
| **Wallet donasi situs**  | Beneficiary untuk referral code default `MP05` dan donasi yang diumumkan                        | Beneficiary/site owner sesuai policy dan approval | Hanya sebagai beneficiary yang dinyatakan, bukan user payout |                        **Tidak** |
| **Wallet hot/warm/cold** | Klasifikasi custody treasury berdasarkan exposure dan limit                                     | Treasury/security                                 |                       Tidak sebagai default user destination |                        **Tidak** |

Istilah yang dilarang pada UI/API: `default wallet` jika maksudnya adalah payout destination, `fallback wallet` untuk menggambarkan treasury/donasi, atau `wallet` tanpa asset/network. Gunakan istilah eksplisit seperti **BTC payout destination**, **BEP20 payout destination**, **pool treasury wallet**, atau **site donation wallet**.

## 2. Non-negotiable separation rules

1. Payout destination selalu disimpan dengan scope minimal `accountId + assetId + networkId + payoutRouteId`.
2. Address payout satu akun tidak boleh diganti oleh environment variable, platform default, global admin setting, route default, referral code, atau wallet treasury.
3. Global configuration hanya boleh menentukan route metadata, validator, policy, dan operational gate; ia tidak boleh menjadi user destination.
4. `MP05` hanya menentukan beneficiary referral/donasi sebesar 0,125% sesuai fee policy. **MP05 bukan fallback wallet pengguna, bukan deposit wallet, bukan treasury wallet, dan bukan address payout otomatis akun.**
5. Jika user belum memiliki active payout destination, payout harus `NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS` atau `PAYOUT_GATED`; jangan mengirim ke address global.
6. Jika route/network berubah, user harus memilih dan mengonfirmasi destination baru; sistem tidak boleh melakukan silent migration.
7. User-facing amount, asset, network, destination fingerprint, threshold, fee, confirmation, dan lock state wajib tampil sebelum sensitive action.

## 3. Address format and checksum

### 3.1 Bitcoin native

- Address harus divalidasi sebagai **Bitcoin Network native address**, bukan sekadar string non-empty.
- Validator harus mengakui format yang didukung policy (misalnya Bech32/Bech32m atau legacy jika memang diizinkan) dan menolak address testnet ketika route mainnet.
- Network version, checksum, length, witness rules, dan malformed characters harus diperiksa server-side.
- Address prefix saja tidak cukup untuk menyimpulkan network; gunakan library/network parameter yang eksplisit.
- UI menampilkan network `Bitcoin`, asset `BTC`, address fingerprint, dan warning irreversibility.

### 3.2 BNB Smart Chain / BEP20

- BEP20 payout harus menggunakan address yang divalidasi terhadap **BNB Smart Chain**, bukan Bitcoin Network.
- EVM address checksum (EIP-55 bila digunakan) harus divalidasi atau dinormalisasi menurut policy yang disetujui; chain ID/network harus selalu disimpan bersama address.
- Token contract, decimals, gas policy, dan asset compatibility harus berasal dari versioned route catalog.
- Address EVM yang valid secara checksum tidak otomatis membuktikan bahwa address menerima token tertentu atau dimiliki user.
- UI menampilkan network `BNB Smart Chain (BEP20)`, asset/token, contract reference bila diperlukan, dan wrong-network warning.

## 4. Network separation matrix

| Address/route                 | Valid network                          | Invalid examples                                             | Required behavior                                                             |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| BTC native payout             | Bitcoin mainnet route                  | BTC testnet, BEP20/EVM address, arbitrary string             | Reject before persistence; `NETWORK_MISMATCH` atau `INVALID_ADDRESS_CHECKSUM` |
| BEP20 payout                  | BNB Smart Chain chain ID/policy        | Bitcoin address, unsupported EVM chain, wrong token contract | Reject before persistence; show exact network expected                        |
| Deposit route (future)        | Only explicitly enabled asset/network  | Payout/treasury/donation address                             | Separate route and custody policy; never reuse payout destination silently    |
| Pool treasury                 | Internal approved network/asset policy | User-selected arbitrary destination                          | Not exposed as user payout fallback                                           |
| Site donation wallet for MP05 | Approved donation asset/network        | User wallet or pool treasury substitution                    | Fixed through approved versioned beneficiary config; audited change only      |

A valid address on one network is invalid for another network even if the textual format looks similar. Never send funds merely because checksum validation succeeded.

## 5. Address ownership confirmation

Checksum/network validation proves syntax and route compatibility, not private-key ownership. Before a route becomes payout-capable, product/security must choose and document an ownership confirmation method:

| Method                                | Assurance                    | Trade-off                                           | Initial policy                              |
| ------------------------------------- | ---------------------------- | --------------------------------------------------- | ------------------------------------------- |
| Signed challenge message              | Strong address control proof | Not supported by every wallet/asset flow            | Recommended where wallet supports it        |
| Micro-transfer confirmation           | Stronger operational proof   | Costs network fee; can create accounting complexity | Optional controlled pilot                   |
| User confirmation checkbox            | No cryptographic proof       | Low friction but weak assurance                     | Never sufficient alone for high-risk payout |
| Exchange/wallet provider verification | Provider-dependent           | Requires integration and privacy review             | Optional B2B route                          |

If ownership proof is unavailable, address may remain registered but must be marked `UNVERIFIED` and `payoutCapable=false` unless risk/compliance owner explicitly approves a lower-assurance route. Never label checksum-only registration as “verified owner”.

## 6. Address change cooldown and withdrawal lock

### 6.1 Required lifecycle

```text
REGISTERED
  → OWNERSHIP_PENDING
  → VERIFIED
  → COOLDOWN
  → ACTIVE
  → DISABLED
```

The exact states may be implemented differently, but the API/UI must distinguish them.

### 6.2 Policy

- New or changed payout address enters cooldown before activation; initial proposal is 24 hours, pending approval.
- Address change requires authenticated interactive session, step-up authentication, fresh CSRF/session binding where applicable, and audit event.
- **Withdrawal lock:** after a destination change, all payout routes for the account are locked until the approved cooldown expires and risk checks pass. A global route must not bypass this lock.
- Existing payout reservations are not silently redirected. They are paused/re-evaluated according to payout state machine.
- Repeated address changes may extend cooldown or trigger manual review; behavior must be deterministic and disclosed.
- Disabling an address does not delete its history or audit record.
- Auto-withdrawal must remain `effective=false` while destination is `OWNERSHIP_PENDING`, `COOLDOWN`, `UNVERIFIED`, or `DISABLED`.
- Address activation must use optimistic concurrency so two active addresses cannot be created by concurrent requests.

## 7. Prohibition on unvalidated transfers

The platform must **never send funds** to an address that has not passed all applicable checks:

1. asset/network route compatibility;
2. checksum and syntax validation;
3. testnet/mainnet or chain ID validation;
4. token contract/decimals compatibility for BEP20;
5. ownership confirmation or approved risk exception;
6. cooldown and withdrawal lock clearance;
7. destination allowlist/risk/sanctions policy;
8. balance eligibility, reservation, maker-checker approval, and payout gate;
9. node/provider confirmation policy;
10. final signer intent verification against the address fingerprint.

A failed check must produce a durable reason and a safe state. Do not “try the transfer and see what happens”; blockchain mistakes may be irreversible.

## 8. Audit events

Minimum immutable events:

- `PAYOUT_DESTINATION_REGISTERED`
- `PAYOUT_DESTINATION_OWNERSHIP_REQUESTED`
- `PAYOUT_DESTINATION_VERIFIED`
- `PAYOUT_DESTINATION_COOLDOWN_STARTED`
- `PAYOUT_DESTINATION_ACTIVATED`
- `PAYOUT_DESTINATION_DISABLED`
- `PAYOUT_DESTINATION_CHANGED`
- `WITHDRAWAL_LOCK_APPLIED`
- `WITHDRAWAL_LOCK_RELEASED`
- `PAYOUT_DESTINATION_VALIDATION_FAILED`
- `PAYOUT_ROUTE_NETWORK_MISMATCH`
- `PAYOUT_GLOBAL_GATE_PAUSED`
- `PAYOUT_FALLBACK_DENIED`
- `DONATION_BENEFICIARY_POLICY_CHANGED`

Each event stores `auditId`, actor/system, account ID, destination ID, asset/network/route version, old/new fingerprint (not full address), old/new state, cooldown/lock expiry, policy version, request ID, correlation ID, reason, and incident ID if relevant. Never store private key, seed, token, worker secret, or full address in generic logs.

## 9. Fallback and emergency pause

### 9.1 Fallback policy

There is **no automatic fallback destination** for user payout. If a user destination is unavailable, invalid, disabled, or under cooldown:

- set payout to an explicit gated/pending state;
- preserve user liability and reservation according to the state machine;
- notify the user with next action;
- route the case to support/risk review where necessary;
- never substitute pool treasury, site donation wallet, MP05 wallet, environment default, or another account’s address.

A provider/node fallback may change the **transport/provider**, not the **user destination**. This distinction must be visible in audit and operations dashboards.

### 9.2 Emergency pause

Security, treasury, or incident commander may pause wallet registration, activation, payout, signing, or broadcast by scope: global, asset, network, route, account, or incident. Pause must be:

- explicit and versioned;
- fail-closed for sensitive operations;
- visible in operator/user status with safe reason;
- audited with actor, scope, start time, and expected review time;
- reversible only through approved resume procedure;
- independent of replacing user address with a fallback.

## 10. Acceptance criteria

- [ ] UI/API distinguishes deposit wallet, payout destination, pool treasury, and site donation wallet.
- [ ] No UI or API uses “default wallet” when it means a user payout destination.
- [ ] MP05 is documented and enforced as referral/donation beneficiary only, never as user fallback.
- [ ] Payout address is scoped per account + asset + network + route and cannot be globally auto-replaced.
- [ ] BTC addresses are validated only against Bitcoin network policy.
- [ ] BEP20 addresses are validated only against BNB Smart Chain/approved token route policy.
- [ ] Checksum success never bypasses ownership, cooldown, risk, or payout gate.
- [ ] Unvalidated or wrong-network address cannot reach signer/broadcast boundary.
- [ ] Address change applies withdrawal lock and cooldown consistently to auto/manual payout.
- [ ] All address, lock, beneficiary, and emergency-pause changes emit immutable audit events.
- [ ] No automatic user payout fallback exists; provider fallback does not change destination.
- [ ] BTC reward mining and BEP20 payout are represented as separate asset/network routes and settlement flows.

No wallet/network implementation change is authorized by this documentation-only branch.
