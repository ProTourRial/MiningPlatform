# ADR-0002: Double-Entry Ledger

Status: Accepted

## Decision

Saldo pengguna tidak disimpan sebagai angka yang dapat ditambah atau dikurangi langsung. Seluruh perubahan nilai dicatat melalui journal entry yang seimbang.

## Invariants

- Total debit sama dengan total credit.
- Entry yang sudah posted tidak diedit.
- Koreksi memakai reversal entry.
- Setiap operasi memakai idempotency key.
- Nilai blockchain disimpan dalam unit atomik pada domain service saat perhitungan.
