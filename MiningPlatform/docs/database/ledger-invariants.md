# Ledger Invariants

1. Setiap journal entry memiliki minimal dua line.
2. Total debit sama dengan total credit untuk aset yang sama.
3. Entry `POSTED` tidak boleh diperbarui atau dihapus.
4. Reversal membuat entry baru dan menunjuk entry lama.
5. `idempotencyKey` wajib unik.
6. Reward allocation hanya dapat terhubung ke satu journal entry.
7. Payout hanya dapat terhubung ke satu journal entry.
8. Saldo dibaca dari agregasi journal lines atau materialized projection yang dapat dibangun ulang.
9. Redis tidak menyimpan saldo otoritatif.
10. Decimal display tidak boleh menggantikan unit atomik dalam kalkulasi domain.
