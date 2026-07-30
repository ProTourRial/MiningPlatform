# Landing Page v1

## Tujuan

Landing page menjelaskan MiningPlatform sebagai mining pool management platform dan upstream gateway. Halaman tidak boleh memberi kesan bahwa platform menjual kontrak hashrate, menjamin keuntungan, menerima dana nyata, atau telah siap digunakan oleh perangkat mining produksi.

## Sumber Desain

Struktur visual diadaptasi dari template `abia-biodata.zip` yang diberikan pemilik proyek. Elemen yang dipertahankan:

- tema gelap teknis;
- aksen lime dan cyan;
- judul display berukuran besar;
- panel bergaya glass dan border;
- navigasi tetap;
- kartu informasi modular;
- ritme visual antara bagian naratif dan panel data.

Konten biodata, galeri, hobi, akun sosial, AI chat, server template, dan integrasi vendor template tidak digunakan.

## Tipografi

Landing page memakai tiga peran font:

| Peran | Font utama | Fallback | Penggunaan |
| --- | --- | --- | --- |
| Display | Space Grotesk | Aptos Display, Segoe UI, Arial | Hero, judul bagian, judul kartu |
| Body | Inter | Aptos, Segoe UI, Arial | Paragraf, navigasi, tombol |
| Technical | IBM Plex Mono | SFMono-Regular, Consolas | Status, label metrik, versi, protokol |

File font tidak disimpan dalam repository. Deployment dapat memasang webfont secara self-hosted kemudian. Fallback sistem tetap menghasilkan layout yang stabil tanpa koneksi eksternal.

## Struktur Halaman

```text
Navbar
  ↓
Hero dan development pipeline preview
  ↓
Platform capabilities
  ↓
Validated mining pipeline
  ↓
Mining farm monitoring preview
  ↓
Mining analytics dan simulator
  ↓
Public transparency
  ↓
Operating principles
  ↓
FAQ
  ↓
Dashboard CTA
  ↓
Footer
```

## Prinsip Konten

1. Gunakan istilah `development`, `alpha`, dan `belum aktif` untuk fitur yang belum selesai.
2. Jangan menampilkan estimasi keuntungan sebagai janji.
3. Jangan menyebut local accepted share sebagai upstream accepted share.
4. Jangan menyebut wallet atau payout aktif sebelum implementasi production selesai.
5. Jelaskan bahwa mining berlangsung pada perangkat fisik.
6. Jelaskan bahwa simulator tidak memengaruhi saldo pengguna.
7. Statistik placeholder harus diberi label development.

## Route

Landing page tersedia pada route `/`.

Komponen utama:

```text
apps/web/src/components/landing/
├── navbar.tsx
├── hero.tsx
├── sections.tsx
└── footer.tsx
```

## Status SEO

Metadata judul, deskripsi, keyword, locale, dan Open Graph sudah ditambahkan. `robots.index` masih `false` selama internal alpha. Ubah menjadi `true` setelah domain, halaman legal, keamanan autentikasi, dan data publik production selesai.
