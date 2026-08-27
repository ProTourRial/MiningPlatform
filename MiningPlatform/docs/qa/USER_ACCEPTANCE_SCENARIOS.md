# User Acceptance Scenarios

- **Status:** Documentation-only behavior scenarios
- **Branch:** `feat/user-acceptance-scenarios`
- **Baseline:** `main` pada commit `770e38c5e119102635aefa97893cdcbdbc345da9`
- **Scope:** Perilaku pengguna pada wallet, payout, auto-withdrawal, timeout, invalid destination, dan account lock
- **Out of scope:** Implementasi kode, schema, migration, RandomX, `upstream-stratum`, accounting implementation, dan `CHANGELOG.md`

> Skenario ini memverifikasi bahwa user-facing behavior jujur terhadap state backend. “Berhasil disimpan” tidak boleh diterjemahkan menjadi “payout dapat dikirim”.

## 1. Acceptance conventions

Tester mencatat environment, browser/device, UTC timestamp, source commit, API contract version, account/worker/destination ID yang disanitasi, request ID, correlation ID, audit ID, screenshot, dan actual result. Tidak boleh ada secret, full address, token, atau private key pada evidence.

| Label | Meaning |
|---|---|
| `PASS` | User dapat menyelesaikan scenario dan expected behavior terbukti |
| `FAIL` | UI/API memberi hasil yang berbeda atau misleading |
| `BLOCKED` | Dependency/feature gate menghalangi eksekusi |
| `NOT RUN` | Belum dieksekusi |

All payout-related scenarios assume **payout remains gated in alpha** unless the test environment explicitly documents a controlled pilot gate.

## 2. Scenario summary

| ID | User goal | Priority |
|---|---|---:|
| UA-01 | Menambahkan wallet payout BTC | P0 |
| UA-02 | Menambahkan wallet payout BEP20 | P0 |
| UA-03 | Mengganti wallet payout | P0 |
| UA-04 | Menolak wallet invalid/wrong network | P0 |
| UA-05 | Memahami auto-withdrawal ON/OFF | P0 |
| UA-06 | Melihat payout ditolak karena belum eligible | P0 |
| UA-07 | Melihat payout ditahan karena maturity | P0 |
| UA-08 | Retry setelah timeout tanpa double payout | P0 |
| UA-09 | Akun terkena payout lock setelah wallet berubah | P0 |
| UA-10 | Melihat status payout gate/route inactive | P0 |
| UA-11 | Memahami fee/referral/MP05 | P1 |
| UA-12 | Memulihkan dari error tanpa kehilangan konteks | P1 |

## 3. UA-01 — User menambahkan wallet payout BTC

**Given:** User authenticated, payout route BTC tersedia untuk address registration, payout funds masih disabled.

**When:**

1. User membuka `Wallet destinations`.
2. User memilih `BTC native / Bitcoin Network`.
3. User memasukkan BTC address yang valid pada environment test.
4. User melihat network warning, masked preview, fingerprint, dan cooldown disclosure.
5. User menyelesaikan step-up verification.
6. User menekan `Save destination` satu kali.

**Then:**

- Sistem memvalidasi address sebagai Bitcoin Network, bukan sekadar non-empty string.
- Destination tersimpan pada account user dan asset/network/route yang dipilih.
- UI menunjukkan `COOLDOWN` atau `OWNERSHIP_PENDING`, `active=false`, dan `payoutCapable=false` bila gate belum lulus.
- UI tidak menyebut “default wallet” atau “payout sent”.
- User melihat cooldown expiry, next action, dan link help.
- Audit event `PAYOUT_DESTINATION_REGISTERED` tersedia dengan masked/fingerprint reference.
- Tidak ada payout, reservation, signing, broadcast, atau perubahan global wallet.

**Acceptance evidence:** screenshot before/after, response status, audit ID, dan sanitized log.

## 4. UA-02 — User menambahkan wallet payout BEP20

**Given:** User memilih asset/token yang secara eksplisit mendukung BEP20.

**When:** User memilih `BNB Smart Chain (BEP20)`, memasukkan EVM address yang valid, membaca token/network warning, menyelesaikan step-up, lalu menyimpan.

**Then:**

- Address divalidasi terhadap BNB Smart Chain route dan chain/token policy.
- UI menampilkan `BEP20`, asset/token, contract/decimals bila relevan, fingerprint, cooldown, dan wrong-network warning.
- Destination BTC dan BEP20 tersimpan sebagai route/network records terpisah.
- BTC mining reward tidak otomatis dipindah atau dikonversi ke BEP20 payout.
- User harus memahami bahwa BEP20 payout berada pada settlement/conversion route terpisah dari reward mining BTC.
- Jika route belum aktif, status tetap gated; tidak ada transfer percobaan.

**Acceptance evidence:** network/asset response, masked destination, route ID/version, dan screenshot.

## 5. UA-03 — User mengganti wallet payout

**Given:** User memiliki active BTC payout destination dan tidak ada incident.

**When:**

1. User memilih `Change destination`.
2. User memasukkan destination baru dengan network yang sama atau memilih route/network baru secara eksplisit.
3. User menyelesaikan step-up verification.
4. User mengonfirmasi warning bahwa address lama tidak akan dipakai untuk payout baru setelah policy berlaku.

**Then:**

- Address baru disimpan sebagai record baru; histori address lama tidak dihapus.
- Account masuk `WITHDRAWAL_LOCK` dan cooldown sesuai policy.
- Auto-withdrawal `effective=false` selama lock/cooldown/ownership pending.
- Existing payout reservation tidak dialihkan diam-diam; statusnya dipause/re-evaluate sesuai state machine.
- User dapat melihat old/new fingerprint, cooldown expiry, lock reason, dan next action.
- Audit events `PAYOUT_DESTINATION_CHANGED` dan `WITHDRAWAL_LOCK_APPLIED` tersedia.
- Tidak ada konfigurasi global, MP05, treasury, atau donation wallet yang menggantikan destination user.

## 6. UA-04 — Wallet invalid atau wrong network

### BTC field receives BEP20/EVM address

Expected: submit ditolak sebelum persistence dengan error `NETWORK_MISMATCH` atau equivalent; helper text menyebut Bitcoin Network.

### BEP20 field receives BTC address

Expected: submit ditolak sebelum persistence dengan error `NETWORK_MISMATCH`; UI tidak mengubah address menjadi format lain secara diam-diam.

### Checksum malformed

Expected: submit ditolak dengan `INVALID_ADDRESS_CHECKSUM`/`INVALID_ADDRESS`; tidak ada route activation atau payout eligibility.

### Valid checksum tetapi unsupported token/chain

Expected: checksum tidak cukup; route/token policy menolak atau menandai `UNSUPPORTED_ASSET_NETWORK`.

### Acceptance rule

Tidak ada validasi client-only yang dapat dilewati dengan direct request. Tidak ada transfer test untuk “melihat apakah address benar”.

## 7. UA-05 — User mengaktifkan auto-withdrawal

**Given:** User memiliki preference yang default OFF dan payout executor/global gate belum active.

**When:**

1. User membuka payout settings.
2. User membaca threshold, maturity, route, risk, dan alpha disclosure.
3. User mengubah toggle OFF menjadi ON.
4. User mengonfirmasi action.

**Then:**

- `autoWithdrawalEnabled=true` dapat tersimpan sebagai preference bila user berwenang.
- `effective=false` selama blocker ada.
- Blocker list menjelaskan, misalnya, `AUTO_PAYOUT_EXECUTOR_NOT_IMPLEMENTED`, `GLOBAL_PAYOUT_GATE_DISABLED`, `NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS`, atau `WITHDRAWAL_LOCK_ACTIVE`.
- Tidak ada payout request, reservation, signing, broadcast, atau debit balance sebagai side effect.
- UI membedakan “preference saved” dari “auto-withdrawal active”.
- Audit event `AUTO_WITHDRAWAL_ENABLED` mencatat actor, account, old/new value, effective state, blocker, dan request ID.

### User turns auto-withdrawal OFF

Expected: preference OFF, scheduler tidak membuat request baru, active reservations tidak dihapus diam-diam, dan audit event `AUTO_WITHDRAWAL_DISABLED` tersedia.

## 8. UA-06 — Payout ditolak karena belum eligible

**Given:** User memiliki balance pending atau settled balance di bawah minimum payout.

**When:** User membuka payout page dan menekan action yang tersedia atau mencoba request melalui API yang sesuai.

**Then:**

- UI menunjukkan status `INELIGIBLE`, `PENDING_SETTLEMENT`, atau `BELOW_MINIMUM_PAYOUT` secara spesifik.
- Threshold, available/spendable amount, pending amount, asset/network, dan next action tampil.
- Tidak ada reservation, debit, state transition ke signing, atau user-facing success.
- Retry hanya menyegarkan eligibility; retry tidak membuat payout intent baru.
- Support link atau explanation tersedia bila user tidak dapat melakukan action.

## 9. UA-07 — Payout ditahan karena maturity

**Given:** Reward berasal dari block/settlement yang belum mencapai confirmation/maturity policy.

**When:** User membuka reward/payout detail.

**Then:**

- Reward berstatus `IMMATURE`/`PENDING_MATURITY`, bukan spendable.
- UI menampilkan current confirmations, required confirmations/maturity, block/period timestamp, dan last updated.
- Balance available tidak memasukkan reward immature.
- Auto-withdrawal tidak efektif dan payout request ditolak/gated.
- Jika orphan/reorg terdeteksi, user melihat `REORG_REVIEW` atau equivalent; histori tidak dihapus.
- Setelah maturity/finality terpenuhi, state berubah melalui transition teraudit dan eligibility dihitung ulang.

## 10. UA-08 — Retry setelah timeout

**Given:** User mengirim payout request pada environment controlled pilot; server mungkin sudah menerima request tetapi response timeout.

**When:**

1. Client tidak menerima response final.
2. User menekan retry atau browser reconnect.
3. Client mengirim request dengan `Idempotency-Key` yang sama.
4. Client memeriksa payout status sebelum membuat key baru.

**Then:**

- Server mengembalikan outcome/operation yang sama jika request pertama sudah committed.
- Tidak ada duplicate reservation, debit, approval, signing, atau broadcast.
- Jika outcome benar-benar belum committed, hanya satu retry yang boleh membuat side effect.
- Same key dengan payload berbeda ditolak sebagai `IDEMPOTENCY_CONFLICT`.
- UI menampilkan `PROCESSING`, `RESERVED`, atau `UNKNOWN_RECONCILIATION` secara jujur; tidak menampilkan `COMPLETED` tanpa evidence.
- User dapat melacak request melalui payout ID, request ID, correlation ID, dan status timeline.

## 11. UA-09 — Akun terkena payout lock

**Given:** User baru mengganti payout destination, gagal ownership check, terkena risk hold, atau operator mengaktifkan scoped emergency pause.

**When:** User membuka payout atau auto-withdrawal.

**Then:**

- Account/route menampilkan `WITHDRAWAL_LOCK_ACTIVE`, `COOLDOWN`, `ON_HOLD`, atau `PAYOUT_PAUSED` sesuai alasan.
- Semua payout routes yang terdampak tidak dapat bypass lock melalui auto-withdrawal, alternate UI, referral, atau global default.
- User melihat lock reason yang aman, created time, expected review/unlock time bila ada, dan next action.
- Wallet destination tetap tersimpan; sistem tidak mengganti address dengan treasury/donation/MP05 wallet.
- Audit event dan incident/reference tersedia untuk operator.
- Setelah lock dilepas, eligibility dievaluasi ulang; payout tidak dikirim otomatis tanpa policy yang mengizinkan.

## 12. UA-10 — Payout route inactive/gated

**Given:** Route status `ADDRESS_REGISTRATION`, `DISABLED`, `ROUTE_UNAVAILABLE`, atau global payout gate OFF.

**When:** User melihat route, wallet, payout, dan auto-withdrawal page.

**Then:**

- Semua halaman memakai status yang sama dan tidak kontradiktif.
- `fundsEnabled=false`/`payoutCapable=false` terlihat bila relevan.
- Address registration dapat tersedia tanpa membuat user percaya bahwa payout sudah aktif.
- CTA payout dinonaktifkan atau hanya membuka explanation; tidak ada fake submit.
- UI menyebut bahwa route dapat berubah setelah product/security/treasury approval.

## 13. UA-11 — User memahami fee, referral, dan MP05

**Given:** User melihat reward estimate atau settled reward.

**Then:**

- Standard case menampilkan platform fee **0,50%**.
- Valid referral case menampilkan miner fee **0,375%** dan beneficiary portion **0,125% dari gross reward**.
- `MP05` ditampilkan sebagai beneficiary referral/donation ke **wallet donasi situs**.
- UI tidak menyebut MP05 sebagai fallback wallet, payout address user, deposit wallet, atau treasury wallet.
- Fee, referral, upstream/network cost, gross, dan net dapat ditelusuri ke policy version dan settlement state.

## 14. UA-12 — User memulihkan dari error tanpa kehilangan konteks

**Given:** API mengembalikan 401, 403, 409, 412, 429, 503, timeout, atau WebSocket disconnect.

**Then:**

- Error code dan message sesuai status; tidak ada stack trace/secret.
- UI memberi next action: login ulang, re-read state, wait/retry, contact support, atau resolve conflict.
- Request ID terlihat atau dapat disalin tanpa membocorkan data sensitif.
- Re-read tidak mereset form/address/amount secara diam-diam sebelum user memilih.
- Retry financial mutation mempertahankan idempotency key sesuai operation.
- Loading/error/empty state tidak mengubah balance/reward menjadi angka nol yang misleading.

## 15. UAT sign-off matrix

| Domain | P0 scenarios | Required approver |
|---|---|---|
| Wallet/network | UA-01, UA-02, UA-03, UA-04, UA-09 | Product + Security + Treasury |
| Auto-withdrawal | UA-05 | Product + Security + Operations |
| Payout eligibility/maturity | UA-06, UA-07, UA-10 | Product + Finance/Treasury |
| Retry/idempotency | UA-08, UA-12 | Engineering + Operations |
| Fee/referral | UA-11 | Finance + Product |
| Legal/risk copy | All payout/wallet scenarios | Legal/Compliance review |

UAT dapat diberi status **GO** hanya bila semua P0 scenario `PASS` atau memiliki signed waiver yang menyebut risiko, scope, expiry, owner, dan compensating control. `BLOCKED` karena payout masih gated bukan `FAIL`, selama UI secara jujur menunjukkan alasan dan tidak mengklaim fitur aktif.

## 16. Test record

| Field | Value |
|---|---|
| UAT run ID | `TBD` |
| Environment | `TBD` |
| Web/API commit | `TBD` |
| API contract version | `TBD` |
| Tester | `TBD` |
| UTC start/end | `TBD` |
| P0 pass/fail/blocked | `TBD` |
| Sign-off | `TBD` |

No implementation change is authorized by this documentation-only branch.
