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
  "blockers": [
    "BALANCE_BELOW_MINIMUM_PAYOUT"
  ],
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

## 9. Error contract

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

## 10. Contract review checklist

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
