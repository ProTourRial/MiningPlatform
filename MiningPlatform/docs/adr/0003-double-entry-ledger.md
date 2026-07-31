# ADR-0003: Double-Entry Ledger

Status: Accepted  
Date: 2026-07-30  
Owner: Abia Nugrahanto

## Decision

Saldo pengguna bukan field yang dapat ditambah atau dikurangi langsung. Seluruh perubahan nilai dibuat melalui journal entry yang seimbang.

## Invariants

- Total debit sama dengan total credit.
- Entry posted tidak diedit; koreksi memakai reversal.
- Posting memakai idempotency key.
- Wallet tidak pernah mengubah user balance.
- Balance adalah projection dari journal lines.
