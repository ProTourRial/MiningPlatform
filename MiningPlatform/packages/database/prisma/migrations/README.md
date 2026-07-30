# Prisma Migrations

`20260730000100_baseline_core_mining` adalah baseline pertama untuk database baru.

Migration SQL dibuat dari `schema.prisma` karena repository versi sebelumnya belum memiliki migration history. Gunakan migration ini hanya pada database kosong atau database development yang dapat dibuat ulang.

Sebelum production deployment:

1. Jalankan `prisma validate`.
2. Jalankan migration pada database staging kosong.
3. Bandingkan hasil schema dengan `prisma migrate diff`.
4. Uji rollback melalui restore backup, bukan dengan menghapus migration yang sudah diterapkan.
5. Simpan migration yang sudah diterapkan sebagai immutable file.

`schema.prisma` tetap menjadi sumber definisi schema. Perubahan berikutnya harus dibuat melalui migration baru.
