# MiningPlatform Current Status

Tanggal status: 18 Agustus 2026 (Asia/Jakarta)

Dokumen ini adalah sumber ringkas untuk checkpoint engineering aktif. Untuk bukti implementasi, urutan otoritas adalah: branch `main` dan commit aktual -> GitHub Actions evidence -> `CHANGELOG.md` -> dokumen rilis historis.

## Checkpoint saat ini

- Release package terakhir: `0.3.0-alpha.2`.
- Branch aktif yang diaudit: `main`.
- HEAD yang diaudit: `c08296254571c5e37beed9e65687007000cb6a0d`.
- Commit HEAD: `fix: restore CI and expose production preview`.
- `CHANGELOG.md` memiliki blok `Unreleased` setelah alpha.2.
- Jangan menyebut status ini `alpha.3` sampai release/version resmi dibuat.

## Pencapaian yang sudah terbukti

### Mining Plane

- Bitcoin/SHA-256 mining core, header reconstruction, target/difficulty, dan SHA-256d validation.
- Share validation untuk unauthorized, unknown job, stale, duplicate, malformed, invalid time/version, dan low difficulty.
- Stratum V1 downstream flow dan upstream TCP client/simulator.
- Multi-upstream registry, priority/weight selection, circuit breaker, recovery backoff+jitter, dan provider-scoped jobs.
- Bounded share queue, explicit backpressure, upstream result lifecycle, dan VarDiff foundation.
- Production worker credential authentication menggunakan PostgreSQL/Redis boundary.

### Event dan Monitoring Plane

- PostgreSQL transactional outbox.
- Redis Stream transport dengan pending recovery, retry, malformed-event isolation, dan dead-letter foundation.
- Shared idempotency contract untuk projection.
- Rolling hashrate/read-model foundation dan authenticated realtime worker rooms.
- Monitoring agent foundation tetap diposisikan sebagai inventory/telemetry boundary, bukan sumber finansial.

### Control Plane

- Registration, email verification, password login/logout, dan reset password.
- Access-token + rotating refresh-session model.
- Persistent refresh-token family history, atomic refresh rotation, replay detection, dan family-wide revocation.
- TOTP 2FA.
- RBAC USER/ADMIN/OWNER dan stronger authentication pada administrative surfaces.
- User profile, active sessions, scoped API keys.
- Worker CRUD dan worker credential create/rotate/revoke.
- Notification inbox dan encrypted channel registry.
- Identity email delivery melalui transactional outbox + Resend adapter.

### Control Plane Frontend v1 - Unreleased HEAD

- Responsive Control Plane navigation.
- Authenticated operational dashboards.
- Worker management UI.
- Hashrate insights.
- Financial surfaces tetap gated.
- Lightweight Bitcoin reward feed menggunakan cached public block context.
- Production-accessible `/control-plane-preview` untuk review visual/deployment.
- Production web requests default ke same-origin `/api/v1`.

## CI evidence pada HEAD

GitHub Actions CI terakhir pada HEAD `c082962` selesai `success`.

Job `quality` berhasil menjalankan:

- `pnpm install --frozen-lockfile`
- `pnpm db:generate`
- `pnpm db:migrate:deploy`
- `pnpm verify:v030-alpha2:static`
- `pnpm verify:payment-addresses`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm release:manifest:verify`

Job `migration-fresh` berhasil menjalankan verifikasi fresh migration alpha.2.

Job `migration-upgrade` berhasil menjalankan verifikasi upgrade migration alpha.2.

Dengan demikian dokumentasi lama yang menyatakan pnpm/Prisma/PostgreSQL/Redis build dan fresh/upgrade migration belum terbukti harus dianggap usang untuk HEAD ini.

## Yang belum boleh disebut production-ready

- Workflow Docker E2E terpisah tersedia tetapi pada audit 18 Agustus 2026 belum memiliki run pada `main`; compose-smoke belum menjadi release evidence.
- Browser E2E lengkap untuk lifecycle Control Plane belum menjadi gate yang terdokumentasi hijau.
- Captured fixture dan soak/failover terhadap upstream provider produksi yang benar-benar dipilih belum lengkap.
- Distributed API rate limiting, IP reputation, managed DDoS protection, dan public TLS/certificate automation belum selesai.
- Telegram/Discord/webhook delivery dan channel verification belum lengkap; Resend production sender/domain tetap external deployment work.
- Reward settlement, contribution accounting, automatic journal posting, spendable balance projection, dan reconciliation belum aktif.
- Wallet signing, signer isolation, payout approval, broadcast, confirmation, dan payout nyata tetap disabled/gated.
- Load, stress, soak, selected-upstream failure testing, chaos, dan disaster-recovery evidence belum lengkap.

## Financial safety boundary

Financial UI boleh ada sebagai gated surface, tetapi tidak boleh dianggap sebagai bukti financial backend aktif.

Sampai settlement dan wallet release gates dipenuhi:

- user deposit crediting tetap tidak tersedia;
- wallet worker tetap nonaktif untuk payout nyata;
- payout nyata tetap tidak tersedia;
- public support/payment receiving addresses tidak boleh mengubah saldo user;
- wallet tidak boleh mengubah balance secara langsung;
- balance harus berasal dari journal entry yang valid, immutable, dan seimbang.

## Next execution order

1. Pertahankan CI main hijau sebagai mandatory gate.
2. Jalankan dan rekam Docker E2E compose-smoke pada main.
3. Tambahkan browser E2E lifecycle Control Plane dan security-session flows.
4. Pilih upstream provider kandidat produksi dan capture fixture TLS/auth/error/failover/soak.
5. Selesaikan notification delivery/verification yang masih masuk scope v0.3.
6. Hardening public edge: TLS, reverse-proxy limits, distributed rate limiting, DDoS strategy, secret rotation.
7. Jalankan load/soak/failure testing untuk Stratum, API, Redis/event projection, dan WebSocket fanout.
8. Tutup atau terima blocker secara eksplisit sebelum membuat release candidate v0.3 berikutnya.
9. Mulai v0.4 ledger settlement hanya dengan deterministic accounting trace dan reconciliation evidence.
10. Jangan mengaktifkan wallet/payout nyata sebelum ledger, signer isolation, approval, reconciliation, legal/compliance, dan operational runbook memenuhi gate.

## Dokumen historis

Dokumen `docs/releases/v0.3.0-alpha.1*` dan `docs/releases/v0.3.0-alpha.2*` adalah release history dan tetap dipertahankan sebagai audit trail. Dokumen historis tidak boleh digunakan untuk menyimpulkan current checkpoint tanpa melihat `CURRENT_STATUS.md`, `CHANGELOG.md`, dan CI evidence terbaru.
