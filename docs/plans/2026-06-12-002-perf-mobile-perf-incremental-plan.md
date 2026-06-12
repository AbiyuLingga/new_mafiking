---
title: "perf: Mobile Performance Incremental Optimization (measured, quality-preserving)"
status: planned
plan_depth: Deep
created: 2026-06-12
origin: |
  Critical review of `2026-06-12-001-perf-mobile-perf-optimization-plan.md` (initial draft, preserved as audit trail) + measured production baseline collected on 2026-06-12.
related_session: ses_1466efb0effe0M6L4Rtv9GLvDZ
supersedes: docs/plans/2026-06-12-001-perf-mobile-perf-optimization-plan.md (initial draft; speculative estimates, kept for history)
target_audience: HP murah 1-2GB RAM (Android Go) sampai flagship 8GB+, semua network profile (2G/3G/4G/WiFi), semua kelas user (guest, logged-in, admin).
success_metric: |
  - Median mobile landing initial transfer: 7,43MB → ≤1,2MB
  - Initial JS gzip: 175KB → ≤175KB (quick wins), ≤120KB (after Phase 2 splitting)
  - Field p75: LCP ≤2,5s, INP ≤200ms, CLS ≤0,1 (internal target 0,05)
  - TBT median ≤100ms
  - No regression di auth, payment deep-link, practice, canvas, admin
routing_contract: |
  - Guest membuka `/` → di-redirect ke `/landing` (eksplisit marketing)
  - Pengguna terautentikasi membuka `/` → di-redirect ke `/belajar` (tanpa download landing chunk)
  - `/landing` selalu membuka halaman marketing secara eksplisit
  - URL payment, auth gate, dan protected route tetap dipertahankan
---

# perf: Mobile Performance Incremental Optimization (new_mafiking)

## 0. Konteks & Verdict

**Status:** Planned. Belum ada eksekusi. Menunggu approval.

**Verdict terhadap plan `-001` (initial draft):** Arah umumnya benar (route-level splitting, image optimization, code splitting, RUM), tetapi baseline-nya sudah tertinggal, beberapa estimasi tidak didukung pengukuran, dan Service Worker + cache `currentUser` justru menambah risiko reliability/security sebelum bottleneck utama diselesaikan.

**Verdict final:** Plan ini mengadopsi **measured incremental optimization**. Quick wins dulu (Phase 1), incremental splitting (Phase 2), polish (Phase 3), memory trace (Phase 4). Service Worker dan `sessionStorage` `currentUser` cache **ditolak**. Full ES-module migration **ditunda** ke RFC terpisah.

**Bedanya dengan `-001`:**

| Aspek | `-001` (initial draft) | `-002` (plan ini) |
|---|---|---|
| Baseline | TTI 22-28s, RAM 120-180MB (spekulatif) | Lighthouse 76/77, LCP 5,16/5,22s, TBT 39/47ms, transfer 7,43MB/750KB (measured) |
| Tailwind CDN removal | Fase utama (Fase 4) | Minor (production dist sudah tidak pakai; legacy path saja) |
| Image optimization | Universal q value (AVIF q=70/65/60) + Butteraugli calibration | Per-asset visual review (no universal q) |
| Service Worker | Fase 5, conservative scope | **Ditolak** — assets sudah immutable-cached, SW adds lifecycle risk |
| `sessionStorage` currentUser cache | Fase 6 | **Ditolak** — stale auth UI risk, no cross-tab sync |
| Full ES-module migration | Implicit dalam Fase 2 | **Ditunda** ke RFC terpisah |
| Routing contract | `/` → lobby → navigate("belajar") | `/` → auth-aware redirect, `/landing` eksplisit |
| Code splitting | Big-bang 14 chunks | Incremental, 1 route per PR |
| Quality safeguards | 5 safeguards (S1-S5) | 3 safeguards (S1 Butteraugli per-asset, S2 Lighthouse CI, S3 visual regression) |
| Effort | 48-68 jam (6-8,5 hari) | 30-40 jam (4-5 hari), lebih lean |

---

## 1. Measured Baseline (2026-06-12)

Baseline produksi terukur pada 12 Juni 2026:

| Skenario | Lighthouse | LCP | TBT | Transfer |
|---|---:|---:|---:|---:|
| Landing mobile (`/`) | 76 | 5,16s | 39ms | 7,43MB |
| `/belajar` mobile | 77 | 5,22s | 47ms | 750KB |
| Initial JS produksi | — | — | — | ~175KB gzip |
| Waste terbesar landing | — | — | — | Gambar mentor 6,2MB tetap diunduh walau tersembunyi di mobile |
| Waste lintas route | — | — | — | Clerk UI/SDK dan KaTeX dimuat sebelum benar-benar dibutuhkan |

**Sumber:** Lighthouse CI run, bundle analyzer output, network waterfall dari Chrome DevTools mobile emulation (Pixel 5, Slow 4G).

---

## 2. Codebase Audit (Fakta Terverifikasi, 2026-06-12)

| Komponen | Status | Lokasi |
|---|---|---|
| Production dist bundle | ✅ Sudah ada, dipakai sebagai default | `dist/index-*.js`, `vendor-react-*.js`, `generated-admin-*.js` |
| Legacy runtime (`MAFIKING.html`) | ⚠️ Masih muat Tailwind CDN + react.development + KaTeX eagerly | `MAFIKING.html:16,18,45,47` |
| `index.html` mirror | ⚠️ Sama seperti MAFIKING.html | `index.html:16,17` |
| Video lazy | ✅ IntersectionObserver + `preload="none"` | `lobby.jsx:1022,1286,1362,1872` |
| Practice video | ⚠️ `preload="metadata"` (bukan `none`) | `practice.jsx:3014` |
| Admin chunk | ✅ Sudah terpisah | `dist/assets/generated-admin-C-BaVutr.js` |
| Mentor image waste | ❌ 6,2MB tetap di-fetch walau tersembunyi di mobile | `assets/landing_mentors_20260607.png` |
| Landing image lain | ❌ 5,8MB | `assets/landing_page.png` |
| Landing jpgs | ✅ Kecil (65-110KB) | `assets/landing/*.jpg` |
| KaTeX eager | ❌ Loaded di bootstrap, padahal hanya dipakai di practice | `MAFIKING.html:16,47` + `index.html:16,17` |
| Clerk loading | ⚠️ Script load sudah on-demand, **tapi** `getToken()` di `backend-api.jsx:137` auto-trigger load untuk semua API call (termasuk guest) | `clerk-auth.jsx:90-122`, `backend-api.jsx:124-132` |
| `navigator.deviceMemory` | ✅ Dipakai | `drawing-canvas.jsx:110` |
| Custom perf observer | ⚠️ INP calculation tidak akurat (pakai `max(event.duration)`, bukan `event-timing` API) | `performance-vitals.js:178-187` |
| `window.*` globals | ~50+ exports | `src/shared.jsx`, `src/lobby.jsx`, `src/practice.jsx`, `src/payment.jsx`, dst. |

**Implikasi:**
- Quick wins utama: mentor image lazy + KaTeX lazy + Clerk auto-trigger guard
- Production sudah sehat (dist bundle, immutable cache, video lazy) — jangan disentuh
- Legacy path (`MAFIKING.html`) hanya untuk dev fallback, optimasi di sini prioritas rendah

---

## 3. Phase 0 — Measurement Contract

**Tujuan:** Ganti baseline spekulatif dengan pengukuran terukur dan reproducible. Pisahkan hard-navigation CWV dari soft-route SPA timing.

**File baru (2):**
- `package.json` — tambah `"web-vitals": "^4.2.4"` di dependencies
- `routes/performance-rum.js` — endpoint + table SQLite untuk RUM

**File diubah (3):**
- `src/performance-vitals.js` — replace custom observer dengan official `web-vitals` attribution build:
  - `onLCP` (per web-vitals attribution API, dengan `element`/`url`/`time`)
  - `onINP` (pakai `event-timing` API dengan `processingStart`/`processingEnd`, BUKAN `max(event.duration)`)
  - `onCLS` (dengan `hadRecentInput` check, sama seperti sekarang)
  - `onFCP`
  - `onTTFB`
- `db/schema.sql` — tambah table `web_vital_metrics`:
  ```sql
  CREATE TABLE web_vital_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    rating TEXT NOT NULL,
    navigation_type TEXT,
    device_class TEXT,
    attribution_json TEXT,
    captured_at INTEGER NOT NULL,
    retention_until INTEGER NOT NULL
  );
  CREATE INDEX idx_vital_metric_captured ON web_vital_metrics (metric, captured_at);
  CREATE INDEX idx_vital_path_captured ON web_vital_metrics (path, captured_at);
  ```
- `src/app.jsx:940` (`parseAppLocation`) — tambah route `/landing` eksplisit, return `{ route: "landing" }` (route baru di router, di-handle oleh `Lobby` component dengan auth-aware behavior: jika `isLoggedIn`, render redirect ke `/belajar`; jika guest, render marketing)

**Field `deviceClass`:** client-side heuristic berdasarkan `navigator.deviceMemory` dan `navigator.hardwareConcurrency`:
- `low` — `deviceMemory < 2` atau `hardwareConcurrency < 2`
- `mid` — `deviceMemory < 8` atau `hardwareConcurrency < 4`
- `high` — otherwise

**Field `navigationType`:** dari `PerformanceNavigationTiming.type` (`"navigate"`, `"reload"`, `"back-forward"`, `"prerender"`).

**RUM sanitization:** tidak ada URL query, tidak ada user ID, tidak ada email/phone. Hanya `path`, `metric`, `value`, `rating`, `navigationType`, `deviceClass`, `attribution_json` (JSON yang di-stringify), `captured_at`. Retensi 30 hari (auto-delete via `retention_until = captured_at + 30*24*3600*1000`).

**Batch write per page lifecycle:** vitals di-flush saat `pagehide` atau `visibilitychange:hidden` (sudah ada di `performance-vitals.js:189-192`), endpoint `/api/performance/vitals` (sudah ada) di-extend untuk insert ke `web_vital_metrics` table.

**Baseline protocol:** 3-run median untuk 5 skenario:
1. `/` guest (mobile emulation Pixel 5, Slow 4G, CPU 4x)
2. `/belajar` logged-in (mobile emulation, fresh login)
3. `/belajar` resume (logged-in, tab re-open)
4. `/practice` pilgan (5 soal pertama)
5. `/practice` canvas 5min (gambar tangan + submit)

**Risk:** LOW. **Effort:** 4-5 jam.

---

## 4. Phase 1 — Quick Wins (Tanpa Perubahan Visual)

**Tujuan:** Selesaikan waste terbesar terukur (mentor image 6,2MB, KaTeX eager, Clerk auto-trigger) tanpa sentuh design/UX.

### 4.1 Mentor Image Lazy + Responsive

**File diubah (1):** `src/lobby.jsx:1570`

**Sebelum:**
```jsx
<img src="/assets/landing_mentors_20260607.png" ... />
```

**Sesudah:**
```jsx
<img
  src="/assets/landing_mentors_20260607-mobile.webp"
  srcset="/assets/landing_mentors_20260607-mobile.webp 640w,
          /assets/landing_mentors_20260607-tablet.webp 960w,
          /assets/landing_mentors_20260607-desktop.webp 1280w"
  sizes="(max-width: 768px) 640px, (max-width: 1280px) 960px, 1280px"
  loading="lazy"
  decoding="async"
  ...
/>
```

**Logic:** Karena CSS sembunyikan mentor image di mobile, browser tidak akan lazy-load selama tidak di-scroll ke viewport. Tambahan `loading="lazy"` + `decoding="async"` untuk defensive measure.

**File baru (1):** `scripts/optimize-images.js` — Sharp pipeline:
- Input: `assets/landing_mentors_20260607.png` (6,2MB), `assets/landing_page.png` (5,8MB), `assets/landing/*.jpg` (sudah kecil)
- Output: 3 size variants × 2 format (WebP + AVIF) per asset
- Skip if `<size>` lebih kecil dari original (no double-encoding)
- AVIF q=50 default (aman dari Butteraugli standpoint, akan di-review per-asset di §4.2)

**Effort:** 2-3 jam. **Risk:** LOW. **Saving:** ~10MB (mentor 6,2MB → ~150KB mobile WebP).

### 4.2 Per-Asset Visual Review (Bukan Universal q Value)

**File baru (1):** `docs/perf/image-quality-review.md`

**Workflow:**
1. Generate 5 candidate: AVIF q=50, 60, 65, 70, 75 untuk 10 representative image (10 mentor + landing images)
2. Per image: Butteraugli score + manual side-by-side review di Chrome DevTools mobile viewport
3. Pilih quality **per-image** berdasarkan acceptance:
   - Butteraugli score < 1.0 (imperceptible)
   - Hero image (mentor foto orang) → konservatif (q=65-70)
   - Landing page background → agresif (q=50-55)
   - Icons/illustrations → tidak perlu AVIF (SVG cukup)
4. Doc hasil per-image di `docs/perf/image-quality-review.md` dengan side-by-side screenshot

**Catatan:** Tidak ada satu nilai quality universal. Setiap asset punya profil sendiri (foto manusia = perlu akurasi skin tone; ilustrasi = toleran; ikon = SVG).

**Effort:** 1-2 hari. **Risk:** LOW (additive review, no auto-apply).

### 4.3 KaTeX Lazy

**File diubah (2):** `MAFIKING.html:16,47` + `index.html:16,17`

**Sebelum:**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
...
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
```

**Sesudah:** Hapus kedua tag dari `MAFIKING.html` dan `index.html`. Tambah lazy loader di `src/practice.jsx` (atau modul matematika pertama):

```js
// src/math-loader.js (baru)
let katexLoadingPromise = null;
export function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (katexLoadingPromise) return katexLoadingPromise;
  katexLoadingPromise = Promise.all([
    loadStyle("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"),
    loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"),
  ]).then(() => window.katex);
  return katexLoadingPromise;
}
```

**File baru (1):** `src/math-loader.js`

**File diubah (1):** `src/practice.jsx` (atau modul math pertama) — panggil `loadKatex()` sebelum render math.

**Effort:** 2-3 jam. **Risk:** LOW. **Saving:** ~280KB CSS+JS untuk route non-math (landing, belajar, payment).

### 4.4 Clerk Auto-Trigger Guard

**Root cause:** `src/backend-api.jsx:124-132` `getToken()` selalu trigger `MafikingClerk.load()` yang load Clerk script + UI dari CDN Clerk. Dipanggil untuk **setiap** API call, termasuk guest ke endpoint publik.

**File diubah (1):** `src/backend-api.jsx:124-132`

**Sebelum:**
```js
async function getToken() {
  try {
    const clerk = await load();
    if (!clerk.session || typeof clerk.session.getToken !== "function") return "";
    return await clerk.session.getToken();
  } catch (_) {
    return "";
  }
}
```

**Sesudah:**
```js
async function getToken() {
  // Skip Clerk load untuk endpoint publik + guest
  if (!isLoggedIn()) return "";
  try {
    const clerk = await load();
    if (!clerk.session || typeof clerk.session.getToken !== "function") return "";
    return await clerk.session.getToken();
  } catch (_) {
    return "";
  }
}
```

**Endpoint publik yang tidak perlu Clerk token:** `/api/auth/me` (server pakai session cookie, bukan Clerk Bearer), `/api/landing-media`, `/api/missions` (read-only), `/api/tryout-packages` (read-only), `/api/quiz/init` (session-based).

**File diubah (1):** `src/backend-api.jsx:39-44` (interceptor) — hanya attach `Authorization: Bearer ...` jika token non-empty.

**Catatan:** Clerk script loading dari `clerk.browser.js` (~110KB) + `ui.browser.js` (variable) baru di-trigger saat:
- User click `Masuk`/`Daftar`/Google login
- Logged-in user panggil API yang butuh auth

**Effort:** 1-2 jam. **Risk:** MEDIUM (perlu verify tidak ada endpoint publik yang ternyata butuh Clerk token — audit `routes/` untuk pastikan backend pakai `req.session` atau Clerk Bearer sesuai konteks). **Rollback:** revert `isLoggedIn()` check.

### 4.5 Auth-Aware `/` Boot

**Perubahan routing (existing):**
- `server.js:1075` — `app.get(['/', '/index.html', '/MAFIKING.html'], ...)` sudah ada.
- Server `req.session.userId` di middleware auth (lihat `middleware/clerk-auth.js`) — bisa dipakai untuk initial redirect.

**Strategi optimal (hybrid):**
- **Server-side redirect** (preferred): tambahkan logic di `server.js:1075`:
  ```js
  app.get(['/', '/index.html', '/MAFIKING.html'], (req, res) => {
    if (req.session && req.session.userId) {
      return res.redirect(302, '/belajar');
    }
    // Else serve landing
    return sendAppHtml(res);
  });
  ```
- **Client-side SPA**: `src/app.jsx:940` `parseAppLocation` — jika path `/` dan `isLoggedIn`, set route "belajar" (sudah ada parsial di line 478-482). Update untuk return `{ route: "landing" }` jika path `/landing`.

**File baru (0).** **File diubah (2):** `server.js:1075` (1 baris), `src/app.jsx:940` (route addition).

**Effort:** 1-2 jam. **Risk:** LOW. **Rollback:** revert redirect.

### 4.6 Video Tidak Diubah

`src/lobby.jsx` video sudah optimal (IntersectionObserver + `preload="none"`). Save-Data tetap enhancement, bukan pemicu hilangkan fungsi.

`src/practice.jsx:3014` video pakai `preload="metadata"` — pertahankan (perlu metadata untuk durasi display).

---

## 5. Phase 2 — Incremental Route Splitting

**Tujuan:** Pecah route aktif (landing, practice, payment, tryout, misi, leaderboard, profile) menjadi 1 chunk per route. **1 route per PR**, **full smoke test tiap merge**.

### 5.1 Definisi `window.*` Dependency Contract (Audit Dulu)

**Command:**
```bash
grep -rE "window\.[A-Z][a-zA-Z]+" src/*.jsx | grep -v "// " | sort -u
```

**Output (~50 globals):**
- `window.Icon`, `window.MAPEL_META`, `window.Logo`, `window.SlidingSegmented`, `window.Nav`, `window.Footer`, `window.Skeleton`, `window.ToastContainer`, `window.OfflineBanner` (di `shared.jsx`)
- `window.MafikingAPI`, `window.MafikingClerk` (auth/API)
- `window.Lobby`, `window.Belajar`, `window.Practice`, `window.AnswerBoard`, `window.DrawingCanvas`, `window.CanvasToolbar`, `window.Tryout`, `window.Misi`, `window.Leaderboard`, `window.Profile`, `window.Payment`, `window.PaymentCheckoutModal`, `window.AdminPage`, `window.AdminMonitoringPanel`, `window.AdminPanel`, `window.ProfileOnboardingModal`

**Chunk mapping (incremental):**

| Urutan | Chunk | File | `window.*` yang dibutuhkan | Size (est. gzip) |
|---|---|---|---|---|
| 1 | `route-landing` | `lobby.jsx` (rebrand jadi `landing.jsx`) | `Icon`, `MafikingAPI`, `MafikingClerk`, `Logo`, `SlidingSegmented`, `Nav`, `Footer` | ~50KB |
| 2 | `route-practice` | `practice.jsx` | `AnswerBoard`, `DrawingCanvas`, `CanvasToolbar`, `MafikingAPI`, `MafikingClerk`, `Icon`, `Logo` | ~28KB |
| 3 | `route-payment` | `payment.jsx` | `MafikingAPI`, `MafikingClerk`, `Icon`, `ToastContainer` | ~14KB |
| 4 | `route-tryout` | `tryout.jsx` | `MafikingAPI`, `MafikingClerk`, `Icon`, `SlidingSegmented` | ~22KB |
| 5 | `route-misi` | `misi.jsx` | `MafikingAPI`, `MafikingClerk`, `Icon`, `OfflineBanner` | ~12KB |
| 6 | `route-leaderboard` | `leaderboard.jsx` | `MafikingAPI`, `MafikingClerk`, `Icon` | ~5KB |
| 7 | `route-profile` | `profile.jsx` | `MafikingAPI`, `MafikingClerk`, `Icon`, `SlidingSegmented` | ~18KB |
| (existing) | `route-admin` | `admin.jsx` + `admin-monitoring.jsx` | (sudah terpisah) | ~95KB |

**Strategi splitting:** Karena runtime saat ini adalah globals + Babel-standalone, splitting menggunakan **dynamic `<script>` injection** di MAFIKING.html atau dedicated script loader di `src/app.jsx`. **Bukan** native ES module (lihat §8 Deferred).

**File diubah (1 per chunk):** `src/app.jsx` — tambah `loadRouteChunk(route)` yang inject `<script>` tag untuk chunk yang dibutuhkan. Ganti `React.createElement(window.X)` jadi `useChunkState('landing')` hook.

**File baru (1):** `src/chunk-loader.js` — helper untuk inject script tag + return Promise.

**Prefetch rules:**
- Hanya saat `requestIdleCallback` callback fire
- Hanya jika `navigator.connection?.saveData !== true`
- Hanya jika intent clear (misal: user di `/belajar` melihat list chapter → prefetch practice)
- **Batasi** max 2 chunk prefetch per page (no cascade)

**Effort:** 10-14 jam total (1-2 jam per route, 1 route per PR). **Risk:** MEDIUM. **Rollback:** revert 1 route per PR.

---

## 6. Phase 3 — CSS, Font, Runtime Polish

**Tujuan:** Optimasi non-kritis yang bisa ditambahkan setelah quick wins + splitting stabil.

### 6.1 Font Audit

**Command:**
```bash
grep -E "fonts\.googleapis|fonts\.gstatic" MAFIKING.html index.html src/styles.css
```

Audit weights/subsets yang diminta vs yang dipakai di `src/*.jsx`. Self-host font hanya jika trace menunjukkan font sebagai bottleneck (bukan asumsi).

**Effort:** 2-3 jam. **Risk:** LOW.

### 6.2 Critical CSS Investigation

Eksperimen terukur: inline critical CSS di `<head>`, defer non-critical. Ukur LCP delta. **Jangan sentuh** cache policy private/auth API demi skor.

**Effort:** 3-4 jam. **Risk:** MEDIUM (CLS risk jika salah inline).

### 6.3 BFCache Investigation

Eksperimen: eligibility check `notRestoredReasons` API. Identifikasi alasan HTML/auth/API response di-`no-store` dan evaluasi trade-off.

**Effort:** 2-3 jam. **Risk:** LOW (eksperimen observasional).

### 6.4 `prefers-reduced-motion` Audit + Network/Device Hints

- Audit `src/*.jsx` untuk `prefers-reduced-motion` (mungkin sudah ada di beberapa tempat via `src/shared.jsx`).
- `navigator.connection` + `deviceMemory` = progressive hint, **bukan** pemicu hilangkan fungsi. Contoh: low-end device tetap render UI tapi disable particle effect opsional, bukan disable entire page.

**Effort:** 2-3 jam. **Risk:** LOW.

---

## 7. Phase 4 — Practice & Canvas Memory

**Tujuan:** Trace dan optimasi memory heap untuk practice + canvas session.

### 7.1 Baseline Trace

**Tools:** Chrome DevTools Memory Profiler + Performance Observer `longtask`.

**Skenario:**
- Login → `/belajar` → klik chapter → `/practice` pilgan 5 soal
- `/practice` → "Try Canvas" → gambar tangan 5 menit
- Submit canvas
- Re-navigate ke chapter berbeda (cek listener leak)
- Submit 1 soal pilgan (cek state leak)

**Capture:**
- Heap snapshot per transisi
- Listener count (EventTarget)
- Long tasks (>50ms) dengan attribution
- Retained base64 / canvas backing store size
- ImageData / OffscreenCanvas references

### 7.2 Optimasi Berdasarkan Trace

Optimalkan **hanya** leak/long task yang terbukti:
- Listener tidak dibersihkan di useEffect cleanup
- Retained base64 image di state
- Oversized canvas backing store
- Long task di Babel runtime (transform on demand)

**Effort:** 4-6 jam. **Risk:** MEDIUM.

### 7.3 Acceptance (Bukan Target MB Absolut)

**Acceptance:** Tidak ada pertumbuhan heap monoton setelah warm-up. Heap boleh spike per interaksi (canvas, image load) tapi harus stabil setelah idle.

**Bukan target:** "RAM < 70MB" atau "TTI < 5s" — angka absolut terlalu tergantung device, ganti dengan delta/growth rate.

---

## 8. Deferred & Rejected

### 8.1 Service Worker — DITOLAK

**Alasan:**
- Static assets sudah di-hash dan immutable-cached via `dist/assets/*-{hash}.{js,css,webp,avif}`
- Browser cache sudah memberikan 0ms static load pada returning user
- Service Worker menambah lifecycle risk: bug SW = user stuck di versi lama sampai clear browser data
- Tidak ada requirement offline/PWA eksplisit
- Rollback butuh emergency unregister endpoint + kill switch

**Sumber:** [Workbox deployment pitfalls](https://developer.chrome.com/docs/workbox/service-worker-deployment), [Remove buggy service workers](https://developer.chrome.com/docs/workbox/remove-buggy-service-workers).

### 8.2 `sessionStorage` `currentUser`/Role/Access Cache — DITOLAK

**Alasan:**
- `currentUser.role` cached selama 1 jam = bisa tampilkan authorization UI yang stale (misal: user di-demote, UI masih tampil admin menu)
- `sessionStorage` tidak sinkron lintas tab (per tab isolated) — `storage` event hanya fire untuk **tab lain**, bukan tab yang menulis
- OWASP Web Storage Cheat Sheet: cached state bukan authorization truth
- Tidak ada measured bottleneck yang justify risk ini (returning user TTI 5s ≠ blocker, hanya suboptimal)

**Sumber:** [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html), [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

### 8.3 Full ES-Module Migration — DITUNDA (RFC Terpisah)

**Alasan:**
- Menyentuh seluruh frontend globals (`window.*` ~50+), auth flow, payment flow, practice flow
- AGENTS.md: "Do not introduce module imports inside static `src/*.jsx` files without changing the whole load architecture"
- Incremental splitting di Phase 2 sudah cover use case utama (route-level separation)
- Effort tinggi, risk tinggi, tidak ada measured bottleneck yang require ini

**RFC outline (untuk nanti):**
- Pilih: native ES modules + Vite (replace MAFIKING.html) ATAU tetap globals + dynamic script injection (incremental)
- Trade-off: simplicity vs future maintainability
- Effort RFC: 1-2 hari. Effort execution: 40-60 jam.

### 8.4 Klaim "Dead Code Cleanup = Runtime Perf Gain" — DITOLAK

**Alasan:**
- Dead code yang dihapus dari `src/*.jsx` masih di-load sebagai global script via `MAFIKING.html`
- Menghapus file `.png` yang duplikat dengan `.webp` (misal `card-bg.png` 751KB vs `card-bg.webp` 5.3KB) sudah umum dan tidak butuh plan besar
- Maintenance terpisah, bukan optimasi runtime

---

## 9. Acceptance Criteria (Final)

### 9.1 Functional Acceptance

- [ ] Guest mobile membuka `/` → server 302 ke `/landing` (atau render `/landing` chunk di `/`); mentor image tidak di-fetch sebelum visible
- [ ] Logged-in user membuka `/` → server 302 ke `/belajar`; **tidak download** landing chunk sama sekali
- [ ] `/landing` selalu render marketing (auth-aware: jika `isLoggedIn` di client, tetap render redirect ke `/belajar`)
- [ ] Practice route: KaTeX loaded saat masuk practice, tidak loaded di route lain
- [ ] Backend API guest call (`/api/missions`, `/api/tryout-packages`, `/api/landing-media`) → Clerk script **tidak** di-load
- [ ] Backend API logged-in call → Clerk token di-attach, Clerk script di-load
- [ ] URL payment (`/payment?merchantOrderId=...`) deep-link tetap berfungsi
- [ ] Auth gate (login/signup) tetap berfungsi normal
- [ ] Admin chunk lazy load saat user buka `/admin`
- [ ] Practice canvas 5min session: heap stabil, no monotonic growth

### 9.2 Performance Acceptance (Field p75, 3-Run Median)

| Metric | Baseline | Target | Hard Fail |
|---|---:|---:|---:|
| Landing mobile initial transfer | 7,43MB | ≤ 1,2MB | > 2MB |
| `/belajar` initial transfer | 750KB | ≤ 750KB | > 1MB |
| Initial JS gzip (landing) | 175KB | ≤ 175KB (after Phase 1), ≤ 120KB (after Phase 2) | > 200KB |
| LCP mobile | 5,16s | ≤ 2,5s | > 4s |
| LCP `/belajar` | 5,22s | ≤ 2,5s | > 4s |
| INP | (baseline) | ≤ 200ms | > 500ms |
| CLS | (baseline) | ≤ 0,1 (internal 0,05) | > 0,25 |
| FCP | (baseline) | ≤ 1,8s | > 3s |
| TBT median | 39ms | ≤ 100ms | > 200ms |
| Lighthouse Performance mobile | 76 | ≥ 90 | < 75 |
| Lighthouse Accessibility | (baseline) | ≥ 95 | < 90 |

### 9.3 Non-Regression Acceptance

- [ ] `npm run check` pass
- [ ] `npm run build` pass tanpa warning baru
- [ ] Auth regression: login/signup/logout/Google OAuth/email verification
- [ ] Payment regression: QRIS deep-link, manual transfer, status polling
- [ ] Practice regression: pilgan submit, canvas submit, correction flow
- [ ] Admin regression: dashboard, user management, monitoring, content CRUD
- [ ] No visual regression (Playwright snapshot diff < 1% pixel)
- [ ] Physical low-end Android test (jika device tersedia)

---

## 10. Validation Methodology

### 10.1 Lab Testing

- **Lighthouse CI** (`@lhci/cli`) — di every PR via `npm run perf:audit`
- **WebPageTest** — manual untuk "Moto G4" (Lighthouse default mobile profile)
- **Chrome DevTools** — Performance Insights + CPU throttling 4× + Slow 4G
- **3-run median** untuk menghilangkan Lighthouse variability

### 10.2 Field Testing (RUM)

- `web_vital_metrics` table (Phase 0) — capture field p75 LCP/INP/CLS/FCP
- Retention 30 hari, auto-purge
- Privacy: no query, no user ID, no PII
- Dashboard: extend `/api/performance/summary` untuk admin monitoring

### 10.3 Regression Testing

- **Visual regression** — Playwright snapshot per route, diff threshold < 1% pixel
- **E2E happy path** — Playwright (atau curl-based) untuk routing
- **Bundle size** — `scripts/check-bundle-budget.js` (CI fail jika > budget)
- **Performance contract** — `scripts/test-performance-contract.js` (existing, extend untuk baseline assertion)

### 10.4 Quality Safeguards (3, bukan 5)

| # | Safeguard | Fase | Tujuan | Cara Validasi |
|---|-----------|------|--------|---------------|
| **S1** | **Butteraugli Per-Asset Review** | 1 | Kompresi gambar imperceptible per asset | Butteraugli score < 1.0 per image + manual side-by-side review, doc di `docs/perf/image-quality-review.md` |
| **S2** | **Lighthouse CI Quality Gate** | 0-3 | Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 95 | Automated di PR check, fail = block merge |
| **S3** | **Visual Regression Test Suite** | 1-2 | Layout/UI tidak bergeser setelah optim | Playwright snapshot per route, diff threshold < 1% pixel |

**Ditolak dari `-001`:** S3 Aspect-Ratio Route Skeletons (defer sampai Phase 2 splitting mature), S4 Service Worker Kill Switch (SW ditolak).

---

## 11. AGENTS.md Touch Points (Apply Setelah Exec Selesai)

Section baru yang akan ditambahkan ke `AGENTS.md`:

```markdown
## Performance & Quality Invariants (Phase 0+)

These invariants prevent performance regressions and ensure visual/accessibility quality. Measured baseline collected 2026-06-12.

### Image Optimization
- All landing images served via `<picture>` with AVIF + WebP + JPEG fallback chain.
- All landing images served with 3 responsive size variants (640w, 960w, 1280w).
- Hero images use `loading="lazy"` only if CSS genuinely hides them; otherwise `loading="eager"` + `fetchpriority="high"`.
- New images must pass per-asset visual review in `docs/perf/image-quality-review.md` before commit (S1).
- No universal quality value — each asset has its own Butteraugli profile (photo of person: q=65-70, illustration: q=50-55).

### Lazy Resource Loading
- KaTeX CSS+JS: lazy-loaded on first math component (`src/math-loader.js`). NOT eager in MAFIKING.html/index.html.
- Clerk SDK+UI: lazy-loaded on first auth action (login click, OAuth callback, getToken for auth endpoint). NOT auto-loaded for guest public API calls.
- Practice canvas: `loading="lazy"` for video poster; IntersectionObserver for autoplay decision.

### Performance Budgets
- Bundle initial: ≤175KB gzip (Phase 1), ≤120KB gzip (after Phase 2 splitting)
- LCP element: ≤100KB transferred for mobile viewport
- Total page weight (landing): ≤1.2MB
- Main thread TBT: ≤100ms median
- Lighthouse Performance mobile: ≥90 (enforced in CI)
- Lighthouse Accessibility: ≥95 (enforced in CI)

### Core Web Vitals Targets (p75 field)
- LCP < 2.5s on 4G mobile
- INP < 200ms
- CLS < 0.1 (target: < 0.05)
- FCP < 1.8s

### RUM Data Collection
- Table `web_vital_metrics` captures field p75 metrics with `navigationType` and `deviceClass`.
- 30-day retention, no PII, no URL query, no user ID.
- Use `web-vitals` official package (not custom observer).

### Rejected (do NOT reintroduce)
- ❌ Service Worker (assets already immutable-cached; SW adds risk without clear need)
- ❌ `sessionStorage` currentUser/role/access cache (stale auth UI risk, no cross-tab sync)
- ❌ Dead code cleanup claimed as runtime perf gain
- ❌ Full ES-module migration (separate RFC, not in scope)

### Network-Aware Behavior (Progressive Only)
- `navigator.connection.saveData` → OPTIONAL enhancement (e.g., smaller images), NOT trigger to hide features
- `navigator.deviceMemory < 2` → disable particle effects, NOT disable pages
- `prefers-reduced-motion: reduce` → disable reveal/pop animations, NOT disable functionality
```

**Tidak diubah di AGENTS.md:**
- Section "Verify runtime behavior through the Express server" — tetap
- Section "Keep the frontend load model as globals loaded by MAFIKING.html" — tetap (ESM migration ditunda ke RFC terpisah)
- Section "Production runtime adalah dist/" — tidak ditambah karena incremental plan tidak switch production runtime

---

## 12. Effort Estimate & Execution Order

### 12.1 Effort per Phase

| Phase | Deskripsi | Effort | Risk |
|---|---|---:|---|
| 0 | Measurement Contract (web-vitals, RUM table, baseline protocol) | 4-5 jam | LOW |
| 1 | Quick Wins (mentor image lazy, per-asset AVIF/WebP, KaTeX lazy, Clerk guard, auth-aware boot) | 8-12 jam | LOW-MED |
| 2 | Incremental Route Splitting (1 route per PR, 7 routes) | 10-14 jam | MED |
| 3 | CSS, Font, Runtime Polish | 6-8 jam | LOW-MED |
| 4 | Practice & Canvas Memory Trace + Optim | 4-6 jam | MED |
| **Total** | | **32-45 jam (4-5.5 hari)** | |

vs. `-001`: 48-68 jam (6-8.5 hari). **Saving: ~30% effort** dengan menghapus SW + sessionStorage phase yang tidak perlu.

### 12.2 Execution Order

1. **Phase 0** — setup measurement (4-5 jam)
2. **Phase 1** — quick wins paralel (8-12 jam, paralelkan §4.1-§4.5)
3. **Phase 1.5** — re-measure baseline (3-run median, 2-3 jam)
4. **Phase 2** — incremental splitting, 1 route per PR (10-14 jam, ~7 PR)
5. **Phase 1.6** — re-measure baseline (3-run median, 2-3 jam)
6. **Phase 3** — CSS/font polish (6-8 jam)
7. **Phase 4** — practice memory trace (4-6 jam)
8. **Update AGENTS.md** dengan section 11 (1-2 jam)

**Total: 38-53 jam (5-7 hari kerja @ 8 jam/hari).**

### 12.3 Dependency Graph

```
Phase 0 (measurement) ─┬─> Phase 1 (quick wins) ─┬─> Phase 2 (splitting) ─┬─> Phase 3 (polish)
                        │                          │                        │
                        │                          └─> Phase 4 (memory)     │
                        │                                                   │
                        └─> baseline re-measure (gate before each phase)   │
                                                                            │
                                                          Update AGENTS.md <┘
```

**Critical path:** Phase 0 → Phase 1 → Phase 2. Phase 3 dan 4 bisa paralel setelah Phase 2 stabil.

---

## Status & Next Steps

**Status:** Planned. Belum ada eksekusi. Menunggu approval.

**Direkomendasi langkah pertama:** Phase 0 + Phase 1 paralel. Phase 0 setup measurement (1-2 hari), Phase 1 quick wins (1-2 hari). Total 2-4 hari untuk landing transfer turun dari 7,43MB ke ≤1,2MB.

**Setelah Phase 1 selesai, ukur ulang baseline dengan 3-run median.** Jika median mobile landing transfer ≤ 1,2MB, lanjut ke Phase 2. Jika tidak, iterasi Phase 1.

**Reference ke plan lain:**
- `2026-06-12-001-perf-mobile-perf-optimization-plan.md` — initial draft, speculative estimates, Service Worker + sessionStorage plan, kept as history
- `2026-06-02-001-hardening-p0-security-payment-perf-plan.md` — predecessor plan (P0 hardening + route-aware script loading)
- `docs/security/phase4-summary-2026-06-03.txt` — VPS post-state from Phase 4 apply
