# API Contract Readiness

- **Branch:** `feat/api-contract-readiness`
- **Status:** Documentation-only contract draft
- **Scope:** Payout destination, auto-withdrawal, payout eligibility, wallet balance, worker, reward, dan referral
- **Out of scope:** Backend implementation, Prisma schema, migration, RandomX, `upstream-stratum`, accounting code, manifest, dan release metadata

> Contoh dengan label **Implemented** memetakan route yang saat ini sudah ada. Contoh dengan label **Target** adalah kontrak yang perlu disetujui sebelum implementasi backend. Dokumen ini tidak mengaktifkan payout dan tidak menjadikan target endpoint sebagai fitur tersedia.

## 1. Global API conventions

**Base URL:** `https://<api-host>/api/v1`
**Development base URL:** `http://localhost:4000/api/v1`
**Content type:** `application/json`
**Authentication:** `Authorization: Bearer <access-token>` untuk protected routes.
**Interactive session:** action sensitif seperti auto-withdrawal dan payout destination write harus berasal dari interactive user session, bukan API key-only context.
**Step-up:** payout destination write menggunakan `x-step-up-token: <single-use-token>`.

Response JSON di bawah ini adalah contoh shape yang disarankan. Field `id`, timestamp, status, dan numeric amount harus diperlakukan sebagai string-safe values pada client; amount finansial tidak boleh diparse menjadi floating-point number.

### 1.1 Contract identity and compatibility

- **Contract version:** `v1.0.0-draft`.
- **Path version:** `/api/v1`.
- **Source commit dokumen ini:** `2c4801c59f296c15d2cf91abb5c1e4d8ef237501` (metadata drift update).
- **Runtime source baseline:** `main` pada `770e38c5e119102635aefa97893cdcbdbc345da9`.
- **Readiness reference commit:** `feat/product-readiness-planning` pada `96417739824585dd7861d37b3a0d6cfa387fac10`.
- **Baseline date:** 27 Agustus 2026.
- **Source of truth for current implementation:** controller/DTO pada runtime source baseline; dokumen ini tidak mengubah route.
- **Status:** documentation-only proposal. Endpoint berlabel **Implemented** berarti route ditemukan pada baseline; endpoint **Target** belum boleh dipanggil frontend.

Perubahan compatible seperti penambahan optional response field menaikkan patch/minor contract revision sesuai changelog API. Perubahan method/path, required field, semantic meaning, permission, status code, atau enum yang dapat memutus client memerlukan contract major review dan path version baru atau migration window. Setiap implementasi backend harus mencatat commit source yang digunakan saat contract dikunci.

### 1.2 Source drift check

Dokumen ini sengaja dibekukan terhadap source baseline tertentu. Setelah RandomX v20 selesai di-merge, atau setelah backend/API berubah materially, lakukan pemeriksaan drift sebelum kontrak dipakai sebagai acuan implementasi:

1. Catat commit `main`, commit API/backend aktual, commit RandomX hasil merge, dan commit readiness reference.
2. Bandingkan semua controller/DTO/guard/version prefix dengan endpoint dan scope pada dokumen ini.
3. Bandingkan enum/status/error code, required field, serialization amount, idempotency behavior, concurrency/version field, dan audit event.
4. Jalankan contract test untuk endpoint **Implemented** serta tandai endpoint yang berubah menjadi `DRIFTED`, `REMOVED`, atau `UNVERIFIED`.
5. Perbarui `Source commit dokumen ini`, `Runtime source baseline`, dan `Contract version` hanya melalui review/PR dokumentasi.
6. Jangan mengubah frontend atau mengaktifkan payout berdasarkan dokumen lama ketika drift belum ditutup.

**Drift result:** `NOT_CHECKED` sampai pemeriksaan pasca-merge selesai. Hasil yang valid harus menyertakan commit comparison, daftar file/controller yang diperiksa, test run, mismatch, owner, dan keputusan compatibility.

## 2. Payout destination

### 2.1 List payout routes — Implemented

```http
GET /payouts/routes
Authorization: Bearer <access-token>
```

**Required scope:** `dashboard:read`

```json
{
  "routes": [
    {
      "id": "route-btc-registration-v1",
      "routeKey": "BTC_NATIVE_V1",
      "version": 1,
      "status": "ADDRESS_REGISTRATION",
      "minimumPayoutAtomic": "100000",
      "maximumPayoutAtomic": null,
      "fixedNetworkFeeAtomic": "0",
      "addressCooldownSeconds": 86400,
      "requiredConfirmations": 3,
      "manualApprovalRequired": true,
      "assetNetwork": {
        "id": "network-btc-mainnet",
        "networkKey": "BTC",
        "displayName": "Bitcoin Network",
        "chainFamily": "BITCOIN",
        "isTestnet": false,
        "addressValidator": "BITCOIN",
        "asset": {
          "id": "asset-btc",
          "symbol": "BTC",
          "decimals": 8
        }
      },
      "fundsEnabled": false,
      "registrationOnly": true
    }
  ]
}
```

**Contract notes:** `fundsEnabled=false` must remain visible while the global payout gate or executor is disabled. `registrationOnly=true` means the route may register an address but may not create a payout.

### 2.2 List user destinations — Implemented

```http
GET /payouts/addresses
Authorization: Bearer <access-token>
```

**Required scope:** `profile:read`

```json
{
  "addresses": [
    {
      "id": "payout-address-uuid",
      "asset": { "symbol": "BTC" },
      "assetNetwork": {
        "networkKey": "BTC",
        "displayName": "Bitcoin Network",
        "isTestnet": false
      },
      "payoutRoute": {
        "routeKey": "BTC_NATIVE_V1",
        "version": 1,
        "status": "ADDRESS_REGISTRATION",
        "addressCooldownSeconds": 86400,
        "manualApprovalRequired": true
      },
      "addressDisplay": "bc1q8f2a…91ef7c20",
      "addressFingerprint": "8f2a91ef7c20aa10",
      "label": "Main BTC wallet",
      "status": "COOLDOWN",
      "verified": true,
      "active": false,
      "payoutCapable": false,
      "cooldownUntil": "2026-08-28T08:00:00Z"
    }
  ]
}
```

Full address and private key material must never be returned to a generic dashboard read. `addressDisplay` and `addressFingerprint` are the display contract.

### 2.3 Register destination — Implemented, address-control only

```http
POST /payouts/addresses
Authorization: Bearer <access-token>
X-Step-Up-Token: <single-use-step-up-token>
Content-Type: application/json
```

**Body:**

```json
{
  "payoutRouteId": "route-btc-registration-v1",
  "address": "bc1qexampleaddressvalidatedbyserver",
  "label": "Main BTC wallet"
}
```

**Response shape:** the masked destination shape from `GET /payouts/addresses`, initially with `status=COOLDOWN`, `active=false`, and `payoutCapable=false`.

**Validation contract:** route/network compatibility, checksum, address length, label length, step-up scope, cooldown, audit event, and one-active-address rule. Checksum is not proof of private-key ownership.

### 2.4 Activate or disable destination — Implemented

```http
POST /payouts/addresses/{payoutAddressId}/activate
Authorization: Bearer <access-token>
X-Step-Up-Token: <single-use-step-up-token>
```

```http
POST /payouts/addresses/{payoutAddressId}/disable
Authorization: Bearer <access-token>
X-Step-Up-Token: <single-use-step-up-token>
```

**Response shape:** updated masked destination. Activation must fail while cooldown is not expired, address is not verified, route is unavailable, or step-up token is invalid/replayed.

## 3. Auto-withdrawal

### 3.1 Read preferences — Implemented

```http
GET /payouts/preferences
Authorization: Bearer <access-token>
```

**Required scope:** `profile:read`

```json
{
  "preferences": [
    {
      "miningAccountId": "mining-account-uuid",
      "username": "account.worker",
      "asset": "BTC",
      "minimumPayout": "100000",
      "autoWithdrawalEnabled": false,
      "effective": false,
      "blockers": [
        "AUTO_PAYOUT_EXECUTOR_NOT_IMPLEMENTED",
        "GLOBAL_PAYOUT_GATE_DISABLED",
        "NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS"
      ]
    }
  ]
}
```

`autoWithdrawalEnabled` adalah preference. `effective` adalah hasil evaluasi seluruh gate. Client tidak boleh menyimpulkan `effective=true` hanya karena toggle bernilai true.

### 3.2 Update preference — Implemented, preference only

```http
PATCH /payouts/preferences/{miningAccountId}
Authorization: Bearer <interactive-access-token>
Content-Type: application/json
```

**Required scope:** `profile:read` sesuai controller saat ini; scope final perlu dikonfirmasi sebelum public API contract dibekukan.

```json
{
  "enabled": true
}
```

**Response:** satu object preference dengan `autoWithdrawalEnabled`, `effective`, `blockers`, `minimumPayout`, dan asset.

No payout request, reservation, signing, or broadcast may occur as a side effect of this endpoint while any blocker exists.

## 4. Payout eligibility — Target contract

**Status:** Target; controller/executor belum tersedia.

### 4.1 Evaluate eligibility

```http
GET /payouts/eligibility?miningAccountId=mining-account-uuid&asset=BTC&network=BTC
Authorization: Bearer <access-token>
```

**Required scope:** `payouts:read`

```json
{
  "miningAccountId": "mining-account-uuid",
  "asset": "BTC",
  "network": "BTC",
  "status": "INELIGIBLE",
  "effective": false,
  "availableBalanceAtomic": "85000",
  "minimumPayoutAtomic": "100000",
  "maturity": {
    "status": "MATURE",
    "requiredConfirmations": 3,
    "currentConfirmations": 3
  },
  "destination": {
    "payoutAddressId": "payout-address-uuid",
    "addressDisplay": "bc1q8f2a…91ef7c20",
    "addressFingerprint": "8f2a91ef7c20aa10",
    "routeStatus": "ACTIVE"
  },
  "blockers": ["BALANCE_BELOW_MINIMUM_PAYOUT"],
  "evaluatedAt": "2026-08-27T08:00:00Z",
  "policyVersion": "payout-policy-v1"
}
```

Allowed `status` values should include `ELIGIBLE`, `INELIGIBLE`, `PENDING_SETTLEMENT`, `PENDING_MATURITY`, `ON_HOLD`, `ROUTE_UNAVAILABLE`, and `PAYOUT_PAUSED`. The endpoint must be read-only and deterministic for the same source snapshot.

### 4.2 Request payout — Reserved target

Payout creation is intentionally not documented as an implemented route. Before adding it, approve a separate contract for:

```http
POST /payouts
Idempotency-Key: payout-request-unique-key
Authorization: Bearer <interactive-access-token>
Content-Type: application/json
```

Illustrative body only:

```json
{
  "miningAccountId": "mining-account-uuid",
  "asset": "BTC",
  "payoutAddressId": "payout-address-uuid",
  "amountMode": "ELIGIBLE_BALANCE"
}
```

A future implementation must return a state-machine object, not a success boolean:

```json
{
  "payoutId": "payout-uuid",
  "status": "RESERVED",
  "amountAtomic": "125000",
  "asset": "BTC",
  "network": "BTC",
  "destinationFingerprint": "8f2a91ef7c20aa10",
  "reservationExpiresAt": "2026-08-27T08:15:00Z",
  "nextAction": "MANUAL_APPROVAL",
  "txHash": null
}
```

## 5. Wallet balance

### 5.1 Ledger balances — Implemented

```http
GET /ledger/balances
Authorization: Bearer <access-token>
```

**Required scope:** `ledger:read`

```json
{
  "balances": [
    {
      "asset": "BTC",
      "currencyId": "asset-btc",
      "postedAtomic": "250000",
      "reversedAtomic": "0",
      "availableAtomic": "250000",
      "pendingAtomic": "40000",
      "heldAtomic": "0",
      "liabilityState": "RECONCILED",
      "asOf": "2026-08-27T08:00:00Z"
    }
  ]
}
```

The final response must state whether `availableAtomic` is spendable, reconciled, and below/above threshold. Balance must be derived from posted journal lines and must not be a directly mutable field.

### 5.2 Wallet module status — Implemented, disabled boundary

```http
GET /wallets/status
```

```json
{
  "module": "wallets",
  "status": "scaffolded-disabled",
  "userDepositsEnabled": false,
  "payoutsEnabled": false
}
```

## 6. Worker

### 6.1 List workers — Implemented

```http
GET /workers
Authorization: Bearer <access-token>
```

**Required scope:** `workers:read`

```json
{
  "workers": [
    {
      "id": "worker-uuid",
      "name": "rig-01",
      "miningAccountId": "mining-account-uuid",
      "declaredHardwareType": "ASIC",
      "status": "ONLINE",
      "algorithm": "SHA256",
      "hashrate": {
        "reported": "110000000000000",
        "calculated5m": "108500000000000",
        "unit": "H/s"
      },
      "shares": {
        "accepted": 1200,
        "rejected": 4,
        "stale": 2,
        "duplicate": 0
      },
      "lastSeenAt": "2026-08-27T07:59:50Z"
    }
  ]
}
```

The API must distinguish reported and calculated hashrate, include the measurement window, and avoid treating missing telemetry as zero.

### 6.2 Create worker — Implemented

```http
POST /workers
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "name": "rig-01",
  "miningAccountId": "mining-account-uuid",
  "declaredHardwareType": "ASIC"
}
```

Allowed hardware values: `CPU`, `GPU`, `FPGA`, `ASIC`, `HYBRID`, `OTHER`, `UNKNOWN`.

### 6.3 Update/delete worker — Implemented

```http
PATCH /workers/{workerId}
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "name": "rig-01-east",
  "disabled": false,
  "agentEnabled": true,
  "declaredHardwareType": "ASIC"
}
```

```http
DELETE /workers/{workerId}
Authorization: Bearer <access-token>
```

### 6.4 Worker credentials — Implemented

```http
GET /workers/{workerId}/credentials
Authorization: Bearer <access-token>
```

```http
POST /workers/{workerId}/credentials/rotate
Authorization: Bearer <access-token>
```

```http
DELETE /workers/{workerId}/credentials/{credentialId}
Authorization: Bearer <access-token>
```

A create/rotate response may display the worker secret once only:

```json
{
  "credentialId": "worker-credential-uuid",
  "workerId": "worker-uuid",
  "username": "account.worker",
  "secret": "shown-once-and-never-returned-again",
  "expiresAt": null,
  "warning": "Store this secret now. It will not be shown again."
}
```

The example secret is illustrative. It must never be stored in logs, browser analytics, screenshots, or API response caches.

## 7. Reward

### 7.1 Reward status — Implemented

```http
GET /rewards/status
Authorization: Bearer <access-token>
```

```json
{
  "module": "rewards",
  "status": "financial-truth-alpha",
  "strategy": "follow-upstream-atomic-v1",
  "initialPlatformFeeBasisPoints": 50,
  "payoutsEnabled": false
}
```

### 7.2 List rewards — Implemented

```http
GET /rewards
Authorization: Bearer <access-token>
```

**Required scope:** `rewards:read`

```json
{
  "rewards": [
    {
      "id": "allocation-uuid",
      "rewardPeriodId": "period-uuid",
      "asset": "BTC",
      "grossAtomic": "1000000",
      "platformFeeAtomic": "5000",
      "platformFeeBasisPoints": 50,
      "referralFeeAtomic": "3750",
      "referralCommissionAtomic": "1250",
      "referralCodeSnapshot": "MP05",
      "beneficiaryType": "SITE_DONATION_WALLET",
      "netAtomic": "996250",
      "status": "SETTLED",
      "settledAt": "2026-08-27T07:00:00Z",
      "policyVersion": "fee-policy-v1"
    }
  ]
}
```

The `MP05` beneficiary must be represented as a site-donation liability, not as a user balance. The final contract should expose enough fields to reproduce gross-to-net calculation without exposing private treasury data.

### 7.3 Reward period — Implemented

```http
GET /rewards/periods/{rewardPeriodId}
Authorization: Bearer <access-token>
```

```json
{
  "rewardPeriodId": "period-uuid",
  "status": "RECONCILED",
  "periodStart": "2026-08-27T06:00:00Z",
  "periodEnd": "2026-08-27T07:00:00Z",
  "asset": "BTC",
  "grossAtomic": "1000000",
  "upstreamFeeAtomic": "0",
  "networkCostAtomic": "0",
  "platformFeeAtomic": "5000",
  "referralCommissionAtomic": "1250",
  "userAllocationAtomic": "993750",
  "sourceChecksum": "sha256:example",
  "ledgerTrace": ["journal-entry-uuid"]
}
```

## 8. Referral

**Current status:** There is no dedicated referral controller in the current API surface. Referral attribution and allocation exist in domain/authentication/reward data, but the public read/write contract below is **Target** and must not be implemented implicitly by frontend assumptions.

### 8.1 Read referral profile — Target

```http
GET /referrals/me
Authorization: Bearer <access-token>
```

**Required scope:** `referrals:read`

```json
{
  "program": {
    "programKey": "default-v1",
    "status": "ACTIVE",
    "policyVersion": "referral-policy-v1"
  },
  "myCode": {
    "code": "ABIA1234",
    "status": "ACTIVE"
  },
  "attribution": {
    "code": "MP05",
    "source": "REGISTRATION",
    "sticky": true,
    "createdAt": "2026-08-27T06:00:00Z"
  },
  "beneficiary": {
    "type": "SITE_DONATION_WALLET",
    "displayName": "MiningPlatform site donation wallet"
  },
  "rates": {
    "standardPlatformFeeBasisPoints": 50,
    "referredMinerFeeBasisPoints": 37.5,
    "beneficiaryPartsPerMillion": 1250
  }
}
```

### 8.2 Validate referral code — Target

```http
POST /referrals/validate
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "code": "MP05"
}
```

```json
{
  "code": "MP05",
  "valid": true,
  "programKey": "default-v1",
  "beneficiaryType": "SITE_DONATION_WALLET",
  "preview": {
    "standardFeeBasisPoints": 50,
    "referredMinerFeeBasisPoints": 37.5,
    "beneficiaryPartsPerMillion": 1250,
    "appliesOnlyAfterSettlement": true
  }
}
```

Validation must not mutate attribution or create financial records. Attribution should be written only by an explicit onboarding/account action and must be sticky according to the approved policy.

### 8.3 Referral reward summary — Target

```http
GET /referrals/rewards?status=SETTLED&page=1&pageSize=50
Authorization: Bearer <access-token>
```

```json
{
  "items": [
    {
      "rewardId": "allocation-uuid",
      "sourceType": "USER",
      "sourceReference": "redacted-user-reference",
      "code": "MP05",
      "grossRewardAtomic": "1000000",
      "beneficiaryAtomic": "1250",
      "beneficiaryType": "SITE_DONATION_WALLET",
      "status": "SETTLED",
      "settledAt": "2026-08-27T07:00:00Z",
      "policyVersion": "referral-policy-v1"
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

## 9. API contract hardening

### 9.1 Normative response envelope

Public contract `v1.0.0-draft` menggunakan envelope berikut untuk response baru. Alpha route yang saat ini mengembalikan raw domain payload boleh tetap raw selama statusnya internal/alpha, tetapi adapter publik harus memetakannya ke envelope ini tanpa mengubah makna domain.

**Success:**

```json
{
  "data": {
    "payoutId": "payout-uuid",
    "status": "RESERVED"
  },
  "meta": {
    "contractVersion": "v1.0.0-draft",
    "requestId": "req-uuid",
    "asOf": "2026-08-27T08:00:00Z"
  }
}
```

**Collection:**

```json
{
  "data": [],
  "meta": {
    "contractVersion": "v1.0.0-draft",
    "requestId": "req-uuid",
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "totalItems": 0,
      "totalPages": 0,
      "hasNext": false,
      "hasPrevious": false
    }
  }
}
```

**Failure:**

```json
{
  "error": {
    "code": "PAYOUT_GATED",
    "message": "Payout is temporarily unavailable.",
    "requestId": "req-uuid",
    "retryable": false,
    "details": {
      "blockers": ["GLOBAL_PAYOUT_GATE_DISABLED"]
    }
  },
  "meta": {
    "contractVersion": "v1.0.0-draft"
  }
}
```

`message` harus aman untuk user dan tidak mengandung secret, raw address, SQL detail, stack trace, atau internal host. `details` hanya boleh berisi data yang dapat dibocorkan kepada caller dengan permission tersebut.

### 9.2 Normative status codes and error codes

|   HTTP status | Normative meaning                                    | Error code examples                                                | Retry guidance                                         |
| ------------: | ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
|         `200` | Read atau mutation selesai dan state dapat dibaca    | —                                                                  | Tidak perlu retry otomatis                             |
|         `201` | Resource baru berhasil dibuat                        | —                                                                  | Jangan ulangi tanpa idempotency                        |
|         `202` | Request diterima untuk asynchronous processing       | —                                                                  | Poll resource/status dengan backoff                    |
|         `204` | Mutation berhasil tanpa response body                | —                                                                  | Tidak perlu retry                                      |
|         `400` | Request malformed atau semantic input invalid        | `INVALID_REQUEST`, `VALIDATION_ERROR`                              | Perbaiki request                                       |
|         `401` | Credential/token tidak ada atau invalid              | `UNAUTHENTICATED`, `TOKEN_EXPIRED`                                 | Refresh interactive session; jangan loop tanpa batas   |
|         `403` | Identity valid tetapi tidak punya permission         | `FORBIDDEN_SCOPE`, `ROLE_NOT_ALLOWED`                              | Jangan retry tanpa perubahan permission                |
|         `404` | Resource tidak ada atau tidak terlihat oleh caller   | `RESOURCE_NOT_FOUND`                                               | Jangan menebak ID lain                                 |
|         `409` | State conflict atau idempotency conflict             | `STATE_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `ADDRESS_ALREADY_ACTIVE` | Re-read resource; jangan blind retry                   |
|         `412` | `If-Match` tidak cocok                               | `VERSION_MISMATCH`                                                 | Re-read, tampilkan diff, minta konfirmasi ulang        |
|         `428` | Optimistic concurrency wajib tetapi header tidak ada | `PRECONDITION_REQUIRED`                                            | Kirim ulang setelah GET terbaru                        |
|         `429` | Rate limit terlampaui                                | `RATE_LIMITED`                                                     | Ikuti `Retry-After` dan exponential backoff            |
|         `500` | Kesalahan internal tidak terklasifikasi              | `INTERNAL_ERROR`                                                   | Retry terbatas hanya untuk safe/idempotent request     |
| `502/503/504` | Dependency/provider unavailable atau timeout         | `UPSTREAM_UNAVAILABLE`, `DEPENDENCY_TIMEOUT`                       | Retry bounded dengan jitter; mutation harus idempotent |

Error code adalah kontrak machine-readable; HTTP status tidak boleh menjadi satu-satunya input untuk frontend branching.

### 9.3 Idempotency key rules

- Semua mutation yang membuat payout, reservation, ledger-side effect, referral attribution, wallet destination, atau asynchronous job wajib menerima `Idempotency-Key`.
- Key adalah opaque string 16–128 karakter, case-sensitive, tanpa data pribadi atau secret. Client membuat UUID/ULID; server tidak membuat key diam-diam untuk mutation.
- Scope key minimal: authenticated principal + endpoint + resource/operation. TTL minimum yang disarankan: 24 jam untuk payout/financial mutation dan 1 jam untuk non-financial mutation.
- Server menyimpan request hash, first response status/body, resource ID, created-at, expiry, dan final state reference. Replay request yang identik mengembalikan response yang ekuivalen.
- Key yang sama dengan body/path berbeda harus menghasilkan `409 IDEMPOTENCY_CONFLICT`; server tidak boleh menjalankan operation kedua.
- Timeout client tidak berarti operation gagal. Client harus query resource/status menggunakan key atau operation ID sebelum retry.
- Idempotency record tidak boleh dihapus sebelum retention window berakhir atau final state direkonsiliasi.
- `GET`, `HEAD`, dan safe read tidak memerlukan key, tetapi tetap harus memiliki request ID.

### 9.4 Permission matrix

| Operation                                        | Guest |                          User |               Admin |                 Owner/approved operator | Required scope                      |
| ------------------------------------------------ | ----: | ----------------------------: | ------------------: | --------------------------------------: | ----------------------------------- |
| Read public status/metadata                      | Allow |                         Allow |               Allow |                                   Allow | None                                |
| Read own workers                                 |     — |                         Allow | Scoped support only |                     Scoped support only | `workers:read`                      |
| Create/update/delete own worker                  |     — |                         Allow | Scoped support only |                     Scoped support only | `workers:write`                     |
| Read own reward/ledger/balance                   |     — |                         Allow | Scoped support only |                     Scoped support only | `rewards:read`, `ledger:read`       |
| Register/activate/disable own payout destination |     — |            Allow with step-up |  No implicit access |             Break-glass only with audit | `profile:write` + step-up           |
| Toggle own auto-withdrawal preference            |     — |     Allow interactive session |  No implicit access |             Break-glass only with audit | `profile:write`                     |
| Read own payout eligibility                      |     — |                         Allow | Scoped support only |                     Scoped support only | `payouts:read`                      |
| Request payout                                   |     — | Target; interactive + step-up |  No implicit access |              Approved operator workflow | `payouts:write` + idempotency       |
| Approve/sign/broadcast payout                    |     — |                          Deny |     Deny by default |           Maker-checker role separation | `treasury:approve`, `treasury:sign` |
| Read referral attribution/rewards                |     — |                Allow own data | Scoped support only |                     Scoped support only | `referrals:read`                    |
| Manage referral program/policy                   |     — |                          Deny |     Deny by default |                Owner + finance approval | `referrals:admin`                   |
| Read audit events                                |     — |      Own security events only |      Scoped support |                  Full operational scope | `audit:read`                        |
| Change fee/route/payout policy                   |     — |                          Deny |     Deny by default | Owner + finance/security/legal approval | `policy:write`                      |

Role membership alone is insufficient for treasury actions. Resource ownership, scope, interactive session, step-up, maker-checker, and audit policy must all be evaluated.

### 9.5 Pagination, filter, and sort rules

Collection endpoints use cursor pagination for high-volume streams and page pagination only for bounded/admin views. Until cursor support is implemented, the page contract is:

```text
?page=1&pageSize=50&sort=createdAt&order=desc
```

- `page` default `1`, minimum `1`.
- `pageSize` default `50`, minimum `1`, maximum `100` unless endpoint-specific policy is stricter.
- `sort` must be an allowlisted field; unknown field returns `400 INVALID_SORT_FIELD`.
- `order` accepts only `asc` or `desc`.
- Every sort must include a stable unique-ID tie breaker to avoid duplicate/missing rows between pages.
- Filters must be typed and allowlisted: `status`, `asset`, `network`, `workerId`, `dateFrom`, `dateTo`, `online`, and endpoint-approved fields only.
- Date filters use ISO-8601 UTC; inclusive/exclusive boundary must be documented. Recommended: `dateFrom` inclusive and `dateTo` exclusive.
- Response returns `pagination` metadata and `asOf`; callers must not infer total from the current page length.
- Financial exports must state whether totals are snapshot-consistent; pagination across a moving ledger requires a snapshot/cursor token.

### 9.6 Optimistic concurrency

Sensitive mutable resources use an opaque `version` or `ETag` returned by GET. Update/delete requests must send `If-Match: "<etag>"` or the documented `version` field.

- Missing precondition returns `428 PRECONDITION_REQUIRED` when the endpoint requires concurrency protection.
- Stale precondition returns `412 VERSION_MISMATCH` and does not mutate state.
- Server must not silently last-write-wins for payout destination, auto-withdrawal policy, payout request, approval, fee policy, or referral attribution.
- A successful mutation returns the new version/ETag and audit ID.
- Idempotency and optimistic concurrency are complementary: idempotency prevents duplicate execution; `If-Match` prevents overwriting a newer state.

### 9.7 Audit events for wallet and payout changes

Every wallet or payout mutation emits an immutable audit event in the same transaction as the state change or its durable outbox record.

| Event                           | Trigger                         | Minimum metadata                                                                                                                         |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYOUT_DESTINATION_REGISTERED` | New address stored              | `auditId`, actor, user/resource ID, route ID/version, asset/network, address fingerprint, step-up authorization ID, cooldown, request ID |
| `PAYOUT_DESTINATION_ACTIVATED`  | Address becomes active          | `auditId`, actor, destination ID, route version, prior active ID, step-up ID, request ID                                                 |
| `PAYOUT_DESTINATION_DISABLED`   | Address disabled                | `auditId`, actor, destination ID, reason, step-up ID, request ID                                                                         |
| `AUTO_WITHDRAWAL_ENABLED`       | Preference set ON               | `auditId`, actor, mining account ID, prior/new value, effective flag, blockers, request ID                                               |
| `AUTO_WITHDRAWAL_DISABLED`      | Preference set OFF              | `auditId`, actor, mining account ID, prior/new value, request ID                                                                         |
| `PAYOUT_ELIGIBILITY_EVALUATED`  | Eligibility read/decision       | `auditId` or decision ID, account, asset/network, balance snapshot, threshold, blockers, policy version, request ID                      |
| `PAYOUT_REQUESTED`              | Payout intent accepted          | `auditId`, payout ID, idempotency key hash, amount, asset/network, destination fingerprint, request ID                                   |
| `PAYOUT_RESERVED`               | Balance held                    | `auditId`, payout ID, journal/reservation ID, amount, expiry, request ID                                                                 |
| `PAYOUT_APPROVED`               | Maker-checker approval          | `auditId`, approver ID, payout ID, approval policy/version, reason, request ID                                                           |
| `PAYOUT_SIGNING_STARTED`        | Signer receives approved intent | `auditId`, payout ID, signer key reference (not key), policy version, request ID                                                         |
| `PAYOUT_BROADCAST`              | Transaction submitted           | `auditId`, payout ID, tx hash, node/provider reference, request ID                                                                       |
| `PAYOUT_CONFIRMED`              | Confirmation/finality reached   | `auditId`, payout ID, tx hash, block hash/height, confirmation count, request ID                                                         |
| `PAYOUT_FAILED`                 | Terminal failure                | `auditId`, payout ID, safe error code, retryable, recovery action, request ID                                                            |
| `PAYOUT_PAUSED`                 | Gate/operator pause             | `auditId`, actor/system, scope, reason, incident ID, request ID                                                                          |

Never include private key, seed phrase, worker secret, full payout address, raw authentication token, or sensitive raw IP in event metadata. `auditId`, `requestId`, and `correlationId` must be searchable across API, worker, outbox, ledger, signer, node, and incident records.

## 10. Error contract

All endpoints should converge on a machine-readable error shape before becoming public:

```json
{
  "error": {
    "code": "PAYOUT_ROUTE_NOT_ACTIVE",
    "message": "The selected payout route is not active.",
    "requestId": "req-uuid",
    "retryable": false,
    "details": {
      "routeStatus": "ADDRESS_REGISTRATION"
    }
  }
}
```

Minimum error codes for frontend mapping: `UNAUTHENTICATED`, `FORBIDDEN_SCOPE`, `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `CONFLICT`, `STEP_UP_REQUIRED`, `STEP_UP_REPLAYED`, `COOLDOWN_ACTIVE`, `PAYOUT_GATED`, `BELOW_MINIMUM_PAYOUT`, `PENDING_SETTLEMENT`, `REORG_REVIEW`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, and `INTERNAL_ERROR`.

## 11. Contract review checklist

- [ ] Every **Implemented** route above matches the controller path, method, auth guard, and scope.
- [ ] Every **Target** route is visibly marked as target in API docs and frontend copy.
- [ ] Amounts are serialized as strings and include asset, decimals, and `asOf`/policy timestamp where relevant.
- [ ] Payout destination reads are masked; write actions require step-up and interactive session.
- [ ] Auto-withdrawal distinguishes preference from effective execution and returns blockers.
- [ ] Payout eligibility is read-only, deterministic, and does not reserve funds.
- [ ] A future payout mutation requires `Idempotency-Key` and a state-machine response.
- [ ] Wallet balance is ledger-derived and distinguishes pending, posted, held, and spendable values.
- [ ] Worker reads distinguish reported versus calculated hashrate and never use missing data as zero.
- [ ] Reward responses expose fee policy snapshot and MP05 donation liability correctly.
- [ ] Referral validation is non-mutating; attribution and commission are settlement-scoped.
- [ ] Error responses include stable code, request ID, retryability, and safe details.
- [ ] OpenAPI/contract tests, examples, SDK guidance, and changelog are added only after backend contract approval.

No implementation change is authorized by this document alone.
