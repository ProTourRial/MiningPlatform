# Payout Runbook

Status: alpha.7 address-control foundation. Real payout execution remains disabled.

## Non-negotiable runtime boundary

- Keep `PAYOUTS_ENABLED=false`.
- Keep the seeded BTC route in `ADDRESS_REGISTRATION`.
- Do not provision a private key, seed, signer credential, or spend-capable node credential to API/web.
- Do not treat a checksum-valid address as proof of private-key ownership.
- Auto withdrawal `ON` is preference-only and must remain ineffective.

## Address registration controls

1. The user must authenticate through a current interactive access-token session; API keys cannot issue payout step-up or change auto-withdrawal preferences, and payout metadata reads require their explicit read scope.
2. Require the current password and TOTP.
3. Issue a session/scope-bound five-minute token, persist only its hash, and consume it once in the same serializable transaction as the address mutation.
4. Reject reuse of the same TOTP counter across enrollment, login, factor disablement, payout step-up, and concurrent requests. Do not permit TOTP re-enrollment while a factor is enabled; the user must first disable it with the current password and TOTP.
5. Validate the address against the exact `AssetNetwork`. Alpha.7 supports Bitcoin mainnet Base58Check and Bech32/Bech32m checksum rules.
6. Persist route binding, network-bound SHA-256 address fingerprint, validation time, and cooldown. Normal user reads must return only a masked address and fingerprint.
7. Activate only after cooldown. Replacing an active route destination disables the prior record; never rewrite address identity or validation evidence.
8. Confirm audit entries for step-up issue/failure and address registration/activation/disablement.

## Future controlled-payout preconditions

- Rekonsiliasi reward berstatus selesai.
- Ledger seimbang.
- Payout eligibility and balance reservation are atomic and idempotent.
- Hot wallet balance cukup.
- Node sinkron.
- Fee estimate tersedia.
- Tidak ada incident aktif.
- Route berstatus `PILOT` atau `ACTIVE`; pilot payout wajib masuk dan tetap di `REVIEW` sampai approval control yang dapat diverifikasi database tersedia. Route nonaktif hanya boleh menuju `FAILED`/`CANCELLED`.
- Signer terisolasi dan approval separation of duties lulus.
- Wallet/blockchain reconciliation, confirmation, reorg, retry, dan recovery drill lulus.
- Risk/compliance dan owner go/no-go tertulis tersedia.
- `PAYOUTS_ENABLED=true` hanya setelah seluruh approval produksi di atas.

## Failure response

1. Aktifkan payout kill switch.
2. Jangan mengubah entry posted.
3. Nonaktifkan route yang terdampak melalui versi/status yang diaudit; jangan mengedit policy historis.
4. Pertahankan payout/address/journal evidence dan tandai kegagalan dengan kode stabil.
5. Rekonsiliasi transaction ID, wallet history, node view, dan ledger.
6. Buat incident record dan audit event.
7. Lanjutkan hanya setelah root cause, blast radius, dan recovery evidence diterima.

## Alpha.7 verification

```powershell
pnpm verify:migration:v030-alpha7:fresh
pnpm verify:migration:v030-alpha7:upgrade
pnpm test:integration:payout-control
```

Kedua migration command bersifat destruktif terhadap database target dan hanya boleh dijalankan dengan `DATABASE_URL`, `MIGRATION_PSQL_CONTAINER`, serta `MIGRATION_TEST_ACK` yang menunjuk database disposable.
