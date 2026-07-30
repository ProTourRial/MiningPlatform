# Payout Runbook

## Preconditions

- Rekonsiliasi reward berstatus selesai.
- Ledger seimbang.
- Hot wallet balance cukup.
- Node sinkron.
- Fee estimate tersedia.
- Tidak ada incident aktif.
- `PAYOUTS_ENABLED=true` hanya setelah approval produksi.

## Failure response

1. Aktifkan payout kill switch.
2. Jangan mengubah entry posted.
3. Tandai payout gagal dengan kode yang stabil.
4. Rekonsiliasi transaction ID dan wallet history.
5. Buat incident record dan audit event.
6. Lanjutkan hanya setelah root cause diketahui.
