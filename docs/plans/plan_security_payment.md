# Rencana Security Hardening Payment & Finance `new_mafiking`

## Ringkasan
Tujuan utamanya: mencegah payment palsu mengaktifkan akses, mencegah pencurian kredensial QRIS/DANA/merchant, membatasi risiko library open-source, dan memastikan setiap perubahan status pembayaran bisa diaudit serta dipulihkan.

Plan ini berbasis inspeksi lokal terhadap `server.js`, `server/routes/payment.js`, `server/payments/payment-reconciler.js`, `lib/reconcilers/mutasiku.js`, `server/payments/providers/QrisMutasiProvider.js`, `server/payments/qris-dynamic.js`, `db/schema.sql`, `docs/security/*`, serta riset dari OWASP ASVS/API Top 10, Express security best practices, webhook security, npm provenance, Bank Indonesia QRIS, EMVCo QR, Duitku docs, dan paket `@prasetya/qris` / `qris-mutasi`.

## Temuan Kritis
- **P0: Reconciliation harus fail-closed.** Uang tidak boleh dianggap masuk hanya karena ada nominal cocok; match harus unik, belum expired, status mutasi valid, source event belum pernah diproses, dan amount persis.
- **P0: Mutasiku/qris-mutasi adalah boundary berisiko.** `qris-mutasi` mengambil data dari dashboard merchant via scraping dan menyimpan cookie lokal. Di wrapper saat ini, `cookieDir` terlihat belum benar-benar dipakai oleh library, jadi cookie bisa jatuh ke lokasi default library.
- **P0: Webhook perlu replay ledger.** QRIS webhook sudah punya HMAC + timestamp, tetapi perlu dedupe event. Mutasiku webhook saat ini berbasis `JSON.stringify(payload.data)` dan belum punya timestamp/replay ledger yang kuat.
- **P1: Supply-chain package QRIS perlu dikunci.** `@prasetya/qris@0.2.1` zero-dependency dan relatif mudah diaudit, tapi baru dan kecil. `qris-mutasi@2.0.0` punya dependency scraping dan metadata repo tidak jelas dari `npm view`.
- **P1: CSP masih report-only dan memakai `unsafe-inline`.** Ini terkait arsitektur React UMD/Babel/Tailwind CDN. Risiko XSS penting karena XSS admin/payment bisa menjadi financial impact.
- **P1: Operasional security masih ada gap.** Dokumen security mencatat open item ModSecurity/WAF, SSH deploy hardening, dan backup B2/rclone.

## Evidence Reviewed
- **Local codebase:** payment flow, QRIS dynamic generation, suffix lock, Duitku callback, Mutasiku poller/webhook, admin mark-paid, CSRF, CSP, request guard, SQLite schema, dan existing security docs.
- **Skills:** `security-and-hardening`, `security-best-practices`, `security-threat-model`, `testing-api-security-with-owasp-top-10`, `analyzing-sbom-for-supply-chain-vulnerabilities`, `performing-security-headers-audit`, dan `implementing-api-rate-limiting-and-throttling`.
- **OWASP:** ASVS dan API Top 10 untuk target kontrol akses, webhook, logging, rate limit, dan session security. Sumber: https://owasp.org/www-project-application-security-verification-standard/ dan https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- **Express official security:** TLS, Helmet, secure cookies, dependency safety, brute-force protection. Sumber: https://expressjs.com/en/advanced/best-practice-security/
- **Webhook security:** GitHub/Svix/Stripe pattern untuk HMAC, timestamp, raw body, replay prevention. Sumber: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries dan https://docs.svix.com/security
- **QRIS/payment standards:** Bank Indonesia QRIS, EMVCo QR, Duitku callback signature docs. Sumber: https://www.bi.go.id/en/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx, https://www.emvco.com/emv-technologies/qr-codes/, https://docs.duitku.com/api/id/
- **Supply chain:** `npm audit --omit=dev` saat inspeksi lokal bersih, tetapi `npm audit signatures` tidak selesai di terminal dan harus dipindahkan ke CI/stable network. Sumber npm provenance: https://docs.npmjs.com/generating-provenance-statements/

## Rekomendasi Arsitektur
Pilih **isolated payment collector** sebagai target produksi.

- Main app tetap mengurus order, QRIS, akses, admin, dan ledger.
- Collector terpisah mengambil mutasi dari dashboard/API merchant, lalu mengirim normalized mutation ke main app lewat internal signed ingestion endpoint.
- Collector tidak boleh punya akses langsung ke SQLite utama, session secret, Clerk secret, admin credential, atau private app env lain.
- Main app hanya menerima mutation batch yang ditandatangani HMAC raw-body + timestamp + nonce/key id.
- Jika collector error, payment tetap aman: order tetap `PENDING`, admin bisa verifikasi manual.

Alternatif yang lebih cepat adalah hardening in-process collector, tetapi risiko blast radius kredensial merchant lebih besar. Alternatif paling kuat adalah pindah sepenuhnya ke gateway resmi dengan callback terverifikasi, tetapi butuh biaya/onboarding dan mengubah workflow produk.

## Implementation Plan
### Phase 0 - Freeze dan Baseline
- Pastikan `MUTATION_COLLECTOR_ENABLED=false` di production sampai semua gate P0 lulus.
- Jadikan manual admin verification fallback resmi untuk transaksi yang ambigu.
- Catat asset finance: `QRIS_STATIC_STRING`, credential merchant, cookie merchant, webhook secrets, payment ledger, access grant, admin session, dan backup DB.
- Jalankan baseline non-mutating: `npm run check`, `npm audit --omit=dev`, header/TLS audit live, dan review env production tanpa mencetak secret.

### Phase 1 - Payment Ledger Invariants
- Tambah replay/dedupe table untuk webhook dan mutation event: provider, event id atau signature hash, timestamp, merchant order id, status proses.
- Tambah unique constraint untuk `incoming_mutations(provider, provider_mutation_id)` jika `provider_mutation_id` tersedia.
- Tambah unique constraint untuk access grant agar satu pembayaran tidak bisa membuat grant duplikat.
- Standarkan canonical amount sebagai integer rupiah string di semua signature, log, dan matcher.
- Pastikan `markPaymentPaid()` tetap satu-satunya jalur aktivasi akses, termasuk admin, webhook, dan collector.
- Payment expired tidak boleh berubah jadi success otomatis kecuali lewat manual override admin yang eksplisit dan tercatat.

### Phase 2 - Webhook dan Reconciliation Hardening
- QRIS reconcile webhook: verifikasi HMAC terhadap raw/canonical payload, timestamp skew maksimal, dan replay ledger.
- Mutasiku webhook: jangan sign `JSON.stringify(payload.data)` hasil reserialize. Gunakan raw body signature jika provider mendukung, atau pindahkan ke internal collector signed endpoint.
- Tolak mutation tanpa source id yang stabil kecuali content hash unik dan belum pernah diproses.
- Untuk match by amount: sukses hanya jika tepat satu candidate pending, amount persis, waktu transaksi berada dalam window order, arah transaksi masuk, dan status provider termasuk whitelist strict.
- Unknown/empty status dari provider harus dianggap tidak valid, bukan `SUCCESS`.
- Semua ambiguous/unmatched mutation masuk queue review admin, bukan auto-paid.

### Phase 3 - QRIS dan Library Supply Chain
- Pin exact dependency: `@prasetya/qris@0.2.1` dan `qris-mutasi@2.0.0`, bukan semver caret.
- Simpan hasil audit package: checksum package-lock, maintainer, metadata, dependency tree, dan alasan pemakaian.
- Untuk `@prasetya/qris`: tambah regression test parse static QRIS, convert dynamic, CRC valid, tag method dynamic, tag amount sesuai full amount, dan scan manual via beberapa wallet.
- Untuk `qris-mutasi`: treat sebagai untrusted scraper. Audit source `dist`, cookie handling, network destination, timeout, redirect, error logging, dan update behavior sebelum production.
- Tambah CI checks: `npm audit --omit=dev`, `npm audit signatures` atau documented fallback, SBOM generation, OSV/Dependabot, Semgrep secret/security scan.

### Phase 4 - Isolated Mutasi Collector
- Buat process/container terpisah dengan env minimal: merchant credential, collector HMAC secret, QRIS cookie dir, hash pepper collector.
- Cookie merchant wajib berada di directory khusus mode `0700`; file cookie mode `0600`; jangan log cookie, email, password, payer id, atau raw HTML.
- Jika tetap memakai `qris-mutasi`, perbaiki/fork wrapper agar `cookieDir` benar-benar dipakai, atau jalankan collector dengan working directory terkunci khusus.
- Batasi network egress collector hanya ke host merchant resmi dan endpoint ingestion main app.
- Tambah timeout, body size cap, redirect policy, dan retry backoff.
- Collector mengirim normalized data saja: amount, direction, status, source id, timestamp, masked payer info, hash; tidak mengirim credential/cookie.

### Phase 5 - AppSec Web dan Admin
- Pertahankan CSRF untuk semua state-changing browser route; webhook/internal ingestion tetap pakai HMAC dan raw body.
- Admin payment route wajib admin-only, rate-limited, logged, dan idealnya dibatasi dengan step-up auth atau IP allowlist/VPN.
- Kurangi risiko XSS bertahap: migrasi CSP dari report-only ke enforce setelah inline/CDN runtime dikurangi.
- Review public endpoint allowlist di `server.js`; hapus endpoint payment/webhook yang tidak dipakai.
- Pastikan guest checkout dev tidak aktif di production.
- Tambah per-user/IP throttling untuk payment create, payment status, login, correction, dan admin payment actions.

### Phase 6 - Server dan Operasional Finance
- Selesaikan open item security docs: WAF/ModSecurity atau Cloudflare rules, SSH deploy hardening, dan backup B2/rclone terenkripsi.
- Pastikan TLS/HSTS aktif via reverse proxy production.
- Rotasi semua payment/merchant/webhook/session secrets setelah hardening selesai.
- Backup DB terenkripsi, diuji restore, dan punya retention yang cukup untuk investigasi payment.
- Tambah audit log immutable-ish: event payment created, QR generated, webhook received, mutation ingested, match attempted, mark paid, grant created, admin override.

### Phase 7 - Monitoring dan Incident Response
- Alert untuk invalid webhook signature spike, replay attempt, banyak order amount collision, collector login failure, cookie refresh failure, mutation ambiguous, admin mark-paid, dan sudden payment success burst.
- Dashboard admin payment menampilkan pending/expired/success/ambiguous, last collector poll, last successful ingestion, dan error terakhir yang sudah disanitasi.
- Update incident runbook: disable collector, rotate merchant password/cookie, revoke webhook secret, freeze auto-verify, export reconciliation log, compare DB vs merchant dashboard, restore backup bila perlu.

## Perubahan Interface / Kontrak
- Tambah internal endpoint signed ingestion, misalnya `POST /api/payment/reconcile/mutation-batch`, hanya untuk collector.
- Tambah replay ledger table untuk webhook/mutation idempotency.
- Tambah unique indexes untuk mutation source id dan access grant.
- Tambah env production: `COLLECTOR_HMAC_SECRET`, `COLLECTOR_KEY_ID`, `PAYMENT_REPLAY_WINDOW_SEC`, `COLLECTOR_ALLOWED_CLOCK_SKEW_SEC`, `QRIS_COOKIE_DIR`, dan wajib `HASH_PEPPER`.
- Update docs: payment trust boundary, dependency risk register, collector runbook, secret rotation, dan rollback.

## Validation Plan
- Existing tests wajib tetap hijau: `npm run check`, `npm run test:payment-contract`, `npm run test:qris-payment-route`, `npm run test:mutasiku-reconciler`, `npm run test:manual-payment-route`.
- Tambah tests P0: forged signature ditolak, timestamp lama ditolak, replay event diproses sekali, wrong amount tidak paid, duplicate mutation tidak paid dua kali, ambiguous amount masuk review, expired order tidak auto-paid.
- Tambah tests collector: cookie dir benar, file permission benar, no secret in logs, timeout bekerja, unknown provider status ditolak.
- Tambah manual finance smoke: buat QRIS, bayar nominal tepat, cek access aktif; buat nominal salah, access tidak aktif; buat dua pending nominal sama/berdekatan, auto-match tidak sembrono.
- Tambah production gate: canary 1-3 transaksi kecil, bandingkan DB payment ledger dengan dashboard merchant, lalu baru aktifkan collector bertahap.

## Remaining Assumptions dan Research Gaps
- Belum ada bukti official Mutasiku webhook spec di repo; perlu konfirmasi dokumentasi resmi sebelum webhook publik dipakai untuk uang.
- Perlu cek Terms of Service `merchant.qris.online` / qris.interactive untuk memastikan scraping via `qris-mutasi` diizinkan.
- `npm audit signatures` tidak selesai saat inspeksi lokal; jadikan CI gate atau dokumentasikan fallback.
- Live production header/TLS/WAF belum diaudit dalam plan ini; itu masuk Phase 0 sebelum eksekusi production.

## Implementation Status (2026-06-11)

Semua phase di plan ini sudah diimplementasikan (kode + tests). Ringkasan:

| Phase | Status | Artefak |
|---|---|---|
| 0 Baseline & Freeze | DONE | `scripts/security/baseline-audit.js`, `MUTATION_COLLECTOR_ENABLED=false` default |
| 1 Ledger Invariants | DONE | `payment_webhook_events`, `payment_idempotency_keys`, unique constraint, canonical amount, expired-resurrection guard |
| 2 Webhook & Reconciliation | DONE | `checkAndRecordWebhookEvent`, `validateProviderStatus`, strict match, raw-body HMAC for collector |
| 3 Supply Chain | DONE | `@prasetya/qris@0.2.1` & `qris-mutasi@2.0.0` exact pins, `scripts/security/audit-supply-chain.js`, `scripts/security/build-sbom.js`, `docs/security/sbom.json`, `tests/payment/test-qris-security-regression.js` (20 tests) |
| 4 Isolated Collector | DONE | `server/workers/collector.js`, `server/payments/providers/QrisMutasiProvider.js` (cookie dir chdir + 0600 + egress allowlist), `POST /api/payment/reconcile/mutation-batch` signed endpoint |
| 5 AppSec Web & Admin | DONE | `server/security/ip-allowlist.js` + `ADMIN_IP_ALLOWLIST` / `COLLECTOR_IP_ALLOWLIST`, per-action rate limit, `scripts/security/csp-migration-check.js` |
| 6 Server & Operational | DONE | `server/payments/payment-alerts.js`, `scripts/security/rotate-secrets.js`, `docs/security/secret-rotation.md`, audit log immutability triggers (`005_audit_immutability.sql`) |
| 7 Monitoring & IR | DONE | `server/payments/payment-alerts.js` thresholds, `docs/security/payment-runbook.md`, `GET /api/admin/payments/dashboard` |

Tests baru:
- `test:qris-security-regression` (20 tests) — parse/convert/CRC, amount validation
- `test:webhook-replay-prevention` (11 tests) — event dedup, idempotency
- `test:audit-immutability` (7 tests) — append-only triggers

Scripts baru:
- `audit:supply-chain` — pins & metadata
- `build:sbom` — CycloneDX-style SBOM
- `check:csp-migration` — readiness check
- `rotate:secrets` — fresh secret generation
- `audit:baseline` — env/audit/integrity check
- `start:collector` — isolated collector process

Belum selesai (butuh akses production / alat eksternal):
- Live production header/TLS/WAF audit (jalankan `npm run audit:baseline -- --live-url https://mafiking.com`)
- WAF/ModSecurity v3 connector deployment
- SSH deploy hardening + rclone B2 backup pipeline
- Mutasiku Terms-of-Service review
- Drainage test payment burst > 20/60s

Owner tindakan operasional ini ada di `docs/security/payment-runbook.md` dan `docs/security/secret-rotation.md`.
