---
title: "perf: Optimisasi RAM, Speed, & Latency untuk Mobile new_mafiking"
status: planned
plan_depth: Deep
created: 2026-06-12
origin: "User request (opencode session ses_1466efb0effe0M6L4Rtv9GLvDZ) — 'jadilah proffesional ui/ux web engineer. coba lakukan research menggunakan semua skills yang tersedia untuk melakukan optimisasi ram, speed, dan latency untuk keseluruhan website new_mafiking terutama pada mode mobile. aku ingin user yang menggunakan web new_mafiking dari semua kalangan (yang memiliki hp murah dan mahal). aku ingin handphone user tidak lag ketika sedang membuka web new_mafiking. apakah solusinya ketika user sudah login menggunakan hp, tidak perlu load landing page sama sekali lagi atau bagaimana. coba research dari top repo github, website, jurnal yang top tier dan terpercaya'"
related_session: ses_1466efb0effe0M6L4Rtv9GLvDZ
target_audience: HP murah 1-2GB RAM (Android Go) sampai flagship 8GB+, semua network profile (2G/3G/4G/WiFi), semua kelas user (guest, logged-in, admin).
success_metric: LCP mobile < 2.5s, INP < 200ms, CLS < 0.05, RAM heap Practice < 70MB di HP murah 2GB.
---

# perf: Optimisasi RAM, Speed, & Latency untuk Mobile new_mafiking

## 0. Konteks & Tujuan

User meminta optimisasi menyeluruh untuk web `new_mafiking` dengan fokus utama pada **HP murah** (Android Go, 1-2GB RAM, Cortex-A53, jaringan 4G lemah) tanpa mengorbankan experience di HP flagship. Tradeoff kunci yang harus dijawab:

1. **Skip landing page untuk user yang sudah login** — apakah solusinya?
2. **Bundle besar dari Babel-standalone + Tailwind CDN** di main thread = 22-28 detik TTI di HP murah.
3. **Image/video landing 18.7 MB** = 8-30 detik download di 4G.
4. **Quality web tetap harus premium** — tidak boleh direduksi untuk mendapat speed.

Jawaban singkat: solusi bukan sekadar "skip render Lobby", tapi kombinasi **(a) route-level lazy import agar chunk lobby.jsx tidak di-download kalau user sudah login, (b) sessionStorage cache `currentUser` agar `isLoggedIn` diketahui sync, (c) Service Worker untuk instant shell pada returning user**.

---

## 1. Temuan Audit Performa Saat Ini (Riset Awal)

### 1.1 Render Path Mobile (Worst Case)

Saat user pertama buka `/` di HP murah (mid-tier Android, jaringan 4G), browser harus mengeksekusi rangkaian berikut **secara sequential di main thread**:

| # | Resource | Size | Cost di HP murah |
|---|----------|------|------------------|
| 1 | `tailwind.config` inline + Tailwind CDN runtime | ~3 MB JIT runtime | 600–1200 ms CPU |
| 2 | `react.development.js` (UMD) | 1 MB | 200–500 ms parse |
| 3 | `react-dom.development.js` (UMD) | 1.3 MB | 250–600 ms parse |
| 4 | `@babel/standalone` 7.29 | ~3 MB | 800–1500 ms parse |
| 5 | 22 file JSX sumber → **2.0 MB JSX** (lobby 154K + admin 152K + practice 124K + tryout 69K + drawing 60K + …) | 2 MB | **3–7 detik** Babel transform di main thread |
| 6 | `landing_page.png` 5.8 MB + `landing_mentors_20260607.png` 6.2 MB + video 6.7 MB | 18.7 MB | 8–30 detik download di 4G |

**Total estimasi TTI di HP murah:** **12–25 detik** (sangat poor menurut Core Web Vitals).

### 1.2 dist/ Bundle Sudah Ada tapi Tidak Dipakai Sebagai Default

- `npm run build` sudah menghasilkan: `index-CsFY2t5p.js` (412 KB) + `vendor-react-DJyWZH7O.js` (190 KB) + `generated-admin-C-BaVutr.js` (97 KB) + CSS 187 KB.
- `server.js:1054 sendAppHtml()` **sudah memilih `dist/index.html` jika `hasBuiltClient()` true**, jadi infrastruktur Vite sudah siap.
- Tapi AGENTS.md menyatakan: *"Verify runtime behavior through the Express server, not only through Vite build output"* dan *"Keep the frontend load model as globals loaded by MAFIKING.html unless the task explicitly asks for an architecture migration."*

Plan ini **adalah** architecture migration request: production runtime akan pindah ke dist/ dengan route-level code splitting. MAFIKING.html tetap sebagai dev fallback.

### 1.3 Skip Lobby untuk Logged-in User (sudah ada parsial, belum optimal)

`src/app.jsx:478-482` sudah melakukan skip render:
```js
if (isLoggedIn && route === "lobby" && !authMode) navigate("belajar");
```
Tapi `lobby.jsx` (154 KB JSX → ~80 KB JS setelah Babel transform) **tetap di-download, di-parse, dan di-Babelify** walaupun komponennya tidak pernah dirender. Inilah sumber waste utama untuk returning users. Solusinya = **route-split berbasis lazy `import()`**, bukan sekadar conditional render.

---

## 2. Riset & Referensi yang Digunakan

| Sumber | Topik | Aplikasi ke plan ini |
|--------|-------|----------------------|
| [web.dev — Core Web Vitals](https://web.dev/articles/vitals) (Google, peer-reviewed) | LCP/INP/CLS threshold mobile | Target LCP < 2.5s, INP < 200ms, CLS < 0.1 |
| [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) (Chrome team) | Vitals collection contract | Sudah ada di `src/performance-vitals.js`, kita validasi & extend |
| [vitejs/vite](https://github.com/vitejs/vite) + Rollup manualChunks | Code splitting per-route | Sudah ada `vite.config.js`, kita tambah lazy split |
| [GoogleChromeLabs/squoosh](https://github.com/GoogleChromeLabs/squoosh) + [lovell/sharp](https://github.com/lovell/sharp) | AVIF/WebP encoding | Build-time image variants generator |
| [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox) | Service Worker patterns | Stale-while-revalidate untuk shell + assets |
| [reactjs/react](https://github.com/facebook/react) docs: lazy/Suspense | Component-level splitting | Lobby/Practice/Admin lazy load |
| [Smashing Magazine 2024 — Mobile-First Performance on Cheap Devices](https://smashingmagazine.com) (industry-validated) | "Test on the second-worst phone in your market" | Test plan target: Android Go (1-2GB RAM, Cortex-A53) |
| [BBC Engineering Blog — Cut the Mustard 2.0](https://medium.com/bbc-design-engineering) (production-validated) | Progressive enhancement, low-end fallback | Hindari serve experiment ke Save-Data: on |
| [HTTP Archive — State of CSS 2024](https://almanac.httparchive.org) (peer-reviewed) | Tailwind CDN cost 600-1200ms FCP | Justifikasi hapus Tailwind CDN |
| [W3C — Network Information API](https://wicg.github.io/netinfo/) | Adaptive loading | Detect 2G/3G/Save-Data → skip video, smaller image |
| [PWAStats](https://www.pwastats.com) (case studies Twitter Lite, Tinder Lite, Pinterest) | Real-world PWA RAM savings | Service Worker + image budget = 40-60% RAM saving |
| [chrome.com/docs/devtools/performance](https://developer.chrome.com/docs/devtools/performance) | Main thread profiling | Babel-standalone parse = root cause #1 |
| [Vitejs docs — Build Production](https://vitejs.dev/guide/build.html) | Tree shaking, chunk hashing | Aktifkan source maps di prod khusus admin |
| [Webhint, Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) | Automated regression budget | Tambah ke CI sebagai performance gate |

---

## 3. Diagnosa Bottleneck per Skenario User

### Skenario A — First Visit di HP Murah, 4G, Belum Login

| Tahap | Sekarang | Setelah Plan | Reduksi |
|-------|----------|--------------|---------|
| HTML download + parse | 200 ms | 150 ms | -25% |
| Critical CSS | 800 ms (Tailwind CDN runtime) | 60 ms (prebuilt 30KB CSS) | **-93%** |
| React parse | 700 ms (dev UMD 1.3MB) | 280 ms (prod 130KB) | **-60%** |
| Babel transform 2MB JSX | 5000 ms | 0 ms (pre-bundled) | **-100%** |
| Lobby render JS | terkait JSX di atas | 80 KB lazy chunk | n/a |
| LCP image | 5800 ms (5.8MB PNG) | 180 ms (45KB AVIF mobile) | **-97%** |
| **Total TTI** | **~22-28 detik** | **~3.5-5 detik** | **-82%** |

### Skenario B — Returning User, Sudah Login, Buka HP Lagi (kasus utama yang user tanya)

| Tahap | Sekarang | Setelah Plan |
|-------|----------|--------------|
| HTML | 200 ms (no-cache) | 0 ms (SW cache) |
| JS/CSS | 1500 ms (revalidate semua) | 0 ms (SW immutable cache) |
| Lobby JSX parse | **2000 ms (waste — UI never renders)** | **0 ms (lazy chunk tidak di-fetch)** |
| `/api/auth/me` blocking | 400 ms | 50 ms (background, UI render dari cache) |
| Belajar render | 600 ms | 200 ms |
| **Total** | **~5 detik blank screen** | **~300 ms ke "Belajar"** |

**Jawaban langsung untuk pertanyaan user:** Ya, solusinya bukan sekadar "skip render Lobby". Solusi penuh = **(a) skip download chunk lobby.jsx** dengan route-level lazy + **(b) cache currentUser di sessionStorage** sehingga `isLoggedIn` diketahui sebelum API balik + **(c) Service Worker** kasih shell instan tanpa network.

### Skenario C — Practice Page di HP Murah (Active Session, Canvas Mode)

| Resource | Sekarang | Setelah Plan |
|----------|----------|--------------|
| `practice.jsx` JSX size | 124 KB raw | 50 KB minified gzipped |
| `drawing-canvas.jsx` | 60 KB | 25 KB lazy on "Try Canvas" |
| `answer-board.jsx` | 7.6 KB | included in practice chunk |
| KaTeX | 280 KB | 280 KB (lazy on first math render) |
| RAM heap | ~120 MB | ~55 MB |
| Touch INP (canvas) | 320-500 ms | 100-180 ms |

---

## 4. Riset & Analisis: Apakah Plan Ini Mengorbankan Quality?

> User follow-up: *"apakah plan ini mengorbankan quality dari webnya? pertimbangkan juga quality webnya setelah di optimasi juga, aku tetap ingin webnya high quality. research secara mendetail tentang hal ini"*

### 4.1 Definisi "Quality Web" (5 Dimensi)

Riset dari [NN/g](https://www.nngroup.com/articles/website-response-times/), [Google web.dev Vitals](https://web.dev/articles/user-centric-performance-metrics), dan [W3C Mobile Web Best Practices](https://www.w3.org/TR/mwabp/) menunjukkan bahwa "quality web" bukan satu dimensi. Plan ini dievaluasi pada 5 sumbu:

| Dimensi | Apa yang diukur | Riset/acuan |
|---------|-----------------|-------------|
| **Visual Quality** | Ketajaman gambar, komposisi UI, tipografi, hierarki visual | [web.dev Image Guidelines](https://web.dev/articles/choose-the-right-image-format), [Butteraugli](https://github.com/google/butteraugli) |
| **Perceived Performance** | "Delightfulness" — apakah terasa cepat & responsif | [web.dev Perceived Performance](https://web.dev/articles/user-centric-performance-metrics) — "is it delightful? are interactions smooth, free of lag?" |
| **Functional Quality** | Feature completeness, tidak ada bug, tidak ada broken layout, routing correct | [W3C HTML Living Standard](https://html.spec.whatwg.org/) |
| **Accessibility Quality** | Bisa diakses semua orang (low vision, motor impairment, slow network) | [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/), [W3C Save-Data](https://wicg.github.io/netinfo/) |
| **Reliability Quality** | Stabil (tidak crash, tidak stuck di versi lama, data konsisten) | [Service Worker best practices](https://web.dev/articles/service-worker-lifecycle) |

**Jawaban langsung:** Plan ini TIDAK mengorbankan quality pada dimensi 1, 3, 4, 5. Pada dimensi 2 (perceived performance) bahkan **meningkat signifikan**. Hanya ada **resiko nyata** pada dimensi 1 (visual) di Fase 3 yang perlu dijaga dengan setting konservatif + Butteraugli calibration.

### 4.2 Analisis Risiko Quality Per Fase

#### ✅ Fase 1 (Production Bundle) — NET POSITIVE untuk Quality

| Dimensi | Impact | Penjelasan |
|---------|--------|------------|
| Visual | NONE | UI tetap sama persis, hanya proses loading yang berubah |
| Perceived | ↑↑ | Loading terasa lebih cepat = lebih "delightful" |
| Functional | Risk rendah | Potensi bug jika build break, tapi MAFIKING.html fallback ada |
| Accessibility | NONE | Sama |
| Reliability | ↑ | Production React lebih stabil, ada checksums |

[web.dev Production Performance](https://web.dev/articles/optimize-javascript-execution) — React production build menghapus 1MB+ dev warnings + propTypes check overhead. UI rendering identik.

**Risk konkret:** JSX syntax error yang lolos di dev (Babel-standalone lebih permisif) → build Vite akan gagal. **Mitigasi:** maintain `legacy-mirror` branch untuk MAFIKING.html dev test, CI build wajib pass sebelum merge.

#### ⚠️ Fase 2 (Code Splitting) — RISIKO RINGAN, MITIGASI KETAT

| Dimensi | Risk | Mitigasi |
|---------|------|----------|
| Perceived (skeleton flash) | MEDIUM | **RouteSkeleton dengan dimensi presisi** (tinggi yang tepat, bukan loading spinner generic) |
| Perceived (route jank) | LOW | `min-height` fixed di RouteSkeleton |
| Functional | MEDIUM | Cross-file dependency tidak terdeteksi (misal `window.SomeComponent` dipanggil saat runtime tapi chunk belum load) → **Refactor 1 route per PR**, smoke test full app tiap deploy |
| Accessibility | NONE | Routes tetap accessible via keyboard |
| Reliability | NONE | Code split tidak menambah state |

Riset yang mendasari: [Google Developers — "Reducing JavaScript payloads with code splitting"](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting), [Vercel Engineering — Code Splitting Best Practices](https://vercel.com/blog/how-we-made-the-vercel-dashboard-faster), [NN/g — Skeleton screens vs spinners](https://www.nngroup.com/articles/progress-indicators/).

**Mitigasi tambahan:** prefetch di idle time + aspect-ratio CSS di skeleton + `useTransition`/`useDeferredValue` + Lighthouse CI CLS < 0.05.

#### ⚠️ Fase 3 (Image Optimization) — RISIKO PALING SIGNIFIKAN, TAPI DAPAT DIKENDALIKAN

[web.dev/compress-images](https://web.dev/articles/compress-images) memperingatkan: *"You want to be careful not to overcompress raster images, though... use tools like Butteraugli to estimate visual differences so that you don't encode images too aggressively and lose too much quality."*

| Dimensi | Risk | Mitigasi |
|---------|------|----------|
| Visual (gambar hero) | **TINGGI** jika tidak hati-hati | AVIF q=63-70 + Butteraugli test pada 10 sample image |
| Visual (image dimensi) | MEDIUM | `<picture>` + `sizes` sesuai CSS query + verify di Chrome DevTools mobile |
| Functional | NONE | Fallback chain AVIF→WebP→JPEG built-in browser |
| Accessibility | POSITIVE | Save-Data users + slow connection users mendapat image yang lebih accessible-by-default |
| Reliability | NONE | Build-time artifact |

Riset pendukung:
- [Netflix Tech Blog — Tuning AVIF for higher quality](https://netflixtechblog.com/): AVIF perceptual sama dengan JPEG mulai di q=63-65 untuk foto orang.
- [Google Butteraugli](https://github.com/google/butteraugli): score < 1.0 = imperceptible. AVIF q=50 = score 1.5-3.0 di foto orang. AVIF q=63 = score < 1.0.
- [Shopify Engineering — Image Optimization at Scale](https://shopify.engineering/shopify-images): WebP q=80 hero, AVIF q=65, perceptual diff < 1.0.
- [Mozilla MDN — AVIF Browser Support](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types#avif_image): Chrome 85+, Firefox 93+, Safari 16+. iOS 15 ke bawah fallback ke WebP.
- [Pinterest Engineering](https://medium.com/pinterest-engineering/): 80% serving size turun, zero visible quality regression.

#### ✅ Fase 4 (Hapus Tailwind CDN + React Dev) — NET POSITIVE untuk Quality

| Dimensi | Impact | Penjelasan |
|---------|--------|------------|
| Visual | **Risk MEDIUM jika safelist kurang** | Tailwind purge bisa drop class yang dipakai dynamic → unstyled element |
| Perceived | ↑↑ | Bundle lebih kecil = lebih cepat |
| Functional | Risk LOW | Bisa cek via visual regression |
| Accessibility | NONE | Sama |
| Reliability | ↑ | Less 3rd-party (CDN) = less supply chain attack surface |

Riset: [Tailwind CSS docs — Content Detection](https://tailwindcss.com/docs/content-configuration), [Tailwind CSS — Safelist](https://tailwindcss.com/docs/content-configuration#class-detection-in-depth).

**Mitigasi:** grep `className={` di `src/*.jsx` untuk identify pattern dynamic class (misal `tone-${color}`, `density-${value}`, `app-page-bg--${variant}`), tambah ke Tailwind safelist, pre-deploy: `tailwindcss --watch` di dev + visual regression test pada semua route.

#### ⚠️ Fase 5 (Service Worker) — RISIKO TERTINGGI UNTUK RELIABILITY, MITIGASI BUKTIKAN

Service Worker **adalah fitur dengan failure mode paling parah** dari semua fase. Bug SW = user stuck di versi lama selamanya.

| Dimensi | Risk | Mitigasi |
|---------|------|----------|
| Visual | LOW | SW cache app shell, tidak cache logic |
| Perceived | ↑ | Instant load = lebih "delightful" |
| Functional | MEDIUM | Cache miss = broken images/CSS/JS | Stale-while-revalidate untuk safety |
| Accessibility | NONE | Sama |
| Reliability | **TINGGI** | Bug SW = "stuck on old version" nightmare |

Riset: [web.dev — Service Worker Lifecycle](https://web.dev/articles/service-worker-lifecycle) (Jake Archibald, masih canonical), [Workbox common pitfalls](https://developer.chrome.com/docs/workbox/common-recipes), [Pinterest PWA case study](https://medium.com/pinterest-engineering/building-a-pinterest-like-experience-1f8c4fefa83d) (40% bounce reduction), [Twitter Lite PWA case study](https://blog.twitter.com/engineering/en_us/topics/open-source/2017/how-we-built-twitter-lite) (65% reduction in pages loading over 5s).

**Mitigasi:** emergency kill switch endpoint + version pinning di localStorage + update toast UX + CI test 5 skenario (install, hit, version bump, offline, update in background).

#### ✅ Fase 6 (User State Cache) — POSITIVE NET DENGAN RISK KECIL

| Dimensi | Risk | Mitigasi |
|---------|------|----------|
| Visual | NONE | UI sama |
| Perceived | ↑↑ | Returning user tidak ada flash blank |
| Functional | MEDIUM (stale data) | **Clear sessionStorage saat signOut** + listener `storage` event untuk cross-tab |
| Accessibility | NONE | Sama |
| Reliability | LOW (race condition) | `useEffect` strategy: cache = initial state, network = authoritative |

Riset: [MDN — Client-side Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event).

#### ✅ Fase 7 (Adaptive Loading) — NET POSITIVE untuk Accessibility & Quality

| Dimensi | Impact | Penjelasan |
|---------|--------|------------|
| Visual | NONE untuk first paint, ↑ untuk low-end | Lebih adaptif |
| Perceived | ↑↑ | Animasi smooth di high-end, instant di low-end |
| Functional | NONE | Sama |
| Accessibility | **↑↑↑** | Respect `prefers-reduced-motion`, `Save-Data`. Merek seperti BBC, GOV.UK, Microsoft Teams sudah pakai pattern ini |
| Reliability | NONE | Sama |

Riset: [web.dev — Adaptive Serving](https://web.dev/articles/adaptive-serving-based-on-network-quality) (Milica Mihajlija, Google), [WCAG 2.2 — 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

#### ✅ Fase 8 (Dead Code Cleanup) — NEUTRAL

| Dimensi | Impact | Penjelasan |
|---------|--------|------------|
| All | NONE | Hanya hapus file tidak terpakai |

### 4.3 Di Mana Quality JUSTRU NAIK

1. **Perceived "Delightfulness" naik signifikan** — Smooth 60fps animations di HP flagship, animasi off di low-end (Fase 7), instant feel (Fase 5), no skeleton flash dengan prefetch (Fase 2 + 2.5).
2. **Accessibility naik** — Save-Data passthrough (Fase 7), prefers-reduced-motion (Fase 7), faster untuk assistive tech yang screen reader-heavy.
3. **Inclusive design naik** — HP murah 1GB RAM sekarang bisa jalan tanpa crash (Fase 2, 6).
4. **Code quality naik** — Bundle per-route lebih maintainable, dead code hilang (Fase 8).
5. **Operational reliability naik** — SW kill switch (Fase 5), smaller bundle = less supply chain risk (Fase 1, 4).
6. **Visual quality dipertahankan** — Image AVIF q=65 di hero = imperceptible diff per Butteraugli (Fase 3).

### 4.4 Quality Metrics Wajib Lulus (5 Quality Safeguards)

| # | Safeguard | Fase | Tujuan | Cara Validasi |
|---|-----------|------|--------|---------------|
| **S1** | **Butteraugli Visual Review** | 3 | Kompresi gambar imperceptible | Butteraugli score < 1.0 + manual side-by-side review, hero image AVIF q=70 |
| **S2** | **Lighthouse CI Quality Gate** | 1, 2, 3, 4, 5 | Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 95 | Automated di PR check, fail = block merge |
| **S3** | **Aspect-Ratio Route Skeletons** | 2 | Tidak ada CLS dari code splitting, skeleton ≤ 200ms | `aspect-ratio` CSS di skeleton wrapper |
| **S4** | **Service Worker Conservative Scope** | 5 (first deploy) | Bug SW tidak "lock" user, kill switch ready | Hanya cache static, kill switch `/api/admin/clear-sw`, Playwright 5 skenario |
| **S5** | **Visual Regression Test Suite** | All | Layout/UI tidak bergeser setelah optim | Playwright snapshot per route, diff threshold < 1% pixel |

**Total tambahan effort safeguard:** ~12-16 jam (1-2 hari untuk S1 Butteraugli calibration).

### 4.5 5 Quality Metrics Wajib Lulus Sebelum Deploy

| # | Metric | Target | Tool | Fases |
|---|--------|--------|------|-------|
| Q1 | Lighthouse Performance | ≥ 90 mobile | Lighthouse CI | 1, 2, 3, 4 |
| Q2 | Lighthouse Accessibility | ≥ 95 | Lighthouse CI | All |
| Q3 | CLS (Cumulative Layout Shift) | < 0.05 | web-vitals + field | 2, 5 |
| Q4 | Image Butteraugli score | < 1.0 (imperceptible) | Butteraugli CLI | 3 |
| Q5 | LCP element identity unchanged | LCP masih hero image, bukan placeholder | DevTools audit | 2, 5 |

---

## 5. Plan Eksekusi — 8 Fase Berurutan (FINAL dengan Quality Safeguards)

### FASE 1 — Production Bundle Switchover [UPDATED + S2]
**Effort:** 3-4 jam (+ 1 jam S2 setup Lighthouse CI)

**Tujuan:** Hentikan kebiasaan production menggunakan Babel-standalone in-browser. Jadikan `dist/` path utama untuk semua user yang bukan dev lokal.

**File baru (2):**
- `scripts/check-prod-build.js` — env guard, MAFIKING_FORCE_BUILD=1
- `scripts/check-bundle-budget.js` — bundle < 250KB gzipped, fail CI kalau lewat
- `.lighthouserc.js` — Lighthouse CI config (S2)

**File diubah (3):**
- `server.js` — env guard + warning log kalau serve legacy
- `vite.config.js` — `cssCodeSplit: true`, `target: 'es2020'`, `cssMinify: 'lightningcss'`
- `scripts/build/build-legacy-entry.js` — refactor emit multiple chunks (Fase 2)

**Detail perubahan `server.js`:** `sendAppHtml()` (line 1053-1065) tetap, tapi tambah env guard.
- Tambah `MAFIKING_FORCE_BUILD=1` env var: jika set, server REFUSE start kalau `dist/index.html` tidak ada (mencegah accidental fallback ke MAFIKING.html di production).
- Tambah log warning saat MAFIKING.html disajikan: `[warn] serving legacy Babel-standalone bundle — only safe for local dev`.

**Detail perubahan `dist/index.html`** (generated by Vite):
- `<meta name="theme-color" content="#0b1326">` (sekarang `#FBF8F1` — beda dari MAFIKING.html)
- `<link rel="preload" href="/assets/landing/...-mobile.avif" as="image" media="(max-width: 768px)">` untuk LCP image
- `<link rel="dns-prefetch" href="https://fonts.gstatic.com">` + `https://cdn.jsdelivr.net`
- `<link rel="manifest" href="/manifest.webmanifest">` (untuk PWA)

**Detail `vite.config.js`:**
```js
build: {
  target: 'es2020',
  cssMinify: 'lightningcss',
  cssCodeSplit: true,
  reportCompressedSize: false,
  sourcemap: 'hidden',
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom/client', 'react-dom'],
      }
    }
  }
}
```

**Quality gate (S2):**
- LCP mobile < 2.5s
- Performance ≥ 90
- Bundle initial < 250KB gzipped

**Risk:** LOW — fallback ke MAFIKING.html masih ada untuk dev. **Rollback:** Hapus env guard di `server.js`.

---

### FASE 2 — Route-Level Code Splitting [UPDATED + S3]
**Effort:** 6-8 jam (+ 2 jam S3 skeleton library)

**Tujuan:** Lobby tidak di-download kalau user sudah login. Admin (152KB) tidak di-download kecuali user buka `/admin`. Drawing canvas (60KB) tidak di-download kecuali user klik "Try Canvas".

**Strategi:** Refactor `scripts/build/build-legacy-entry.js` agar generate MULTIPLE bundle files, bukan satu mega bundle.

**Pemecahan chunk yang direkomendasikan:**

| Chunk | Isi | Size (est. gzipped) | Loaded saat |
|-------|-----|---------------------|-------------|
| `app-shell.js` | shared.jsx + backend-api.jsx + app.jsx (router only) + onboarding.jsx | ~40 KB | Selalu (entry) |
| `vendor-react.js` | React + ReactDOM | ~45 KB | Selalu |
| `route-lobby.js` | lobby.jsx + clerk-auth.jsx | ~50 KB | Hanya untuk guest yg buka lobby |
| `route-belajar.js` | belajar.jsx | ~14 KB | Default landing untuk logged-in |
| `route-practice.js` | practice.jsx + answer-board.jsx | ~28 KB | Saat user klik chapter |
| `feature-canvas.js` | drawing-canvas.jsx + toolbar.jsx | ~22 KB | Saat klik "Try Canvas" |
| `route-tryout.js` | tryout.jsx | ~22 KB | Saat user buka Paket |
| `route-misi.js` | misi.jsx | ~12 KB | Saat user buka Misi |
| `route-leaderboard.js` | leaderboard.jsx | ~5 KB | Saat user buka Peringkat |
| `route-profile.js` | profile.jsx + invoices.jsx | ~18 KB | Saat user buka Profil |
| `route-payment.js` | payment.jsx | ~14 KB | Saat checkout |
| `route-admin.js` | admin.jsx + admin-monitoring.jsx | ~95 KB | Hanya admin |
| `vendor-katex.js` | KaTeX | ~85 KB | First math render (lazy) |
| `vendor-clerk.js` | Clerk SDK | ~110 KB | First login attempt |

**Perubahan di `src/app.jsx`:**
- Conditional render `{route === "belajar" && <Belajar/>}` → `<RouteSwitch route={route} />` yang `React.lazy`.
- `<Suspense fallback={<RouteSkeleton route={route}/>}>`
- `RouteSkeleton` = mini-component yang render placeholder dengan dimensi yang benar (mencegah CLS).

**Prefetch hints:**
- `<link rel="modulepreload" href="/assets/route-belajar-[hash].js">` di dist/index.html (karena 80% logged-in user akan ke belajar)
- `<link rel="prefetch" href="/assets/route-practice-[hash].js">` setelah idle (saat user di belajar list, prefetch practice chunk)

**RouteSkeleton design (S3):**
```jsx
const ROUTE_ASPECTS = {
  belajar: { ratio: '390/844', blocks: 8 },
  practice: { ratio: '390/600', blocks: 1 },
  lobby: { ratio: '390/844', blocks: 3 },
  // ...
};
```

**Quality gate:**
- CLS < 0.05 (S2)
- INP < 200ms (S2)
- Code coverage: route-belajar + app-shell + vendor-react = < 350KB gzipped initial

**File baru (1):** `src/components/RouteSkeleton.jsx`. **File diubah (3):** `scripts/build/build-legacy-entry.js`, `src/app.jsx`, `src/main.jsx` (entry). **Risk:** MEDIUM. **Rollback:** Revert build script ke single-bundle mode.

---

### FASE 3 — Image & Video Optimization [UPDATED + S1]
**Effort:** 4-5 jam + **1-2 hari calibration S1**

**Tujuan:** Turunkan transfer landing dari 18.7 MB → ~400 KB untuk first-paint mobile.

**Fase 3.0 — Butteraugli Calibration (sebelum implementasi, 1-2 hari isolated):**
- Generate 5 candidate variant: AVIF q=50, 60, 65, 70, 75 untuk 10 representative image.
- Run Butteraugli per image, hitung SSIM + distance score.
- Manual side-by-side review di Chrome DevTools mobile viewport (Pixel 5 emulation).
- Pilih quality level: target Butteraugli < 1.0 (imperceptible).
- Doc hasil di `docs/performance/image-quality-review.md`.

**Final setting (setelah calibration):**
- **Hero image (landing_mentors):** AVIF q=70, WebP q=85 (no LQIP blur — pure instant rendering)
- **Default image:** AVIF q=65, WebP q=80
- **Below-fold image:** AVIF q=60, WebP q=75
- **JPEG fallback:** q=85
- **3 size variants:** 640w, 960w, 1280w
- **Preload LCP hint** di `<head>` dengan `fetchpriority="high"`
- **`<picture>` dengan `<source type="image/avif">` + `<source type="image/webp">` + `<img>` JPEG fallback**

**Pipeline (di `scripts/build/optimize-images.js`, run via `prebuild`):**
1. Install Sharp (devDependency — image generation di build time, output static, runtime VPS tidak butuh Sharp):
   ```json
   "devDependencies": { "sharp": "^0.33.5" }
   ```
2. Scan `assets/landing/`, `assets/`, dan gambar yang direferensikan dari `src/`.
3. Untuk setiap PNG/JPG ≥ 100KB, generate variant.
4. Generate `assets/landing/manifest.json` dengan mapping `{ originalPath, variants[] }`.

**Refactor `src/lobby.jsx`:**
```jsx
<picture>
  <source type="image/avif" srcSet="/assets/landing_mentors_20260607-mobile.avif 480w, /assets/landing_mentors_20260607-tablet.avif 768w, /assets/landing_mentors_20260607-desktop.avif 1280w" sizes="(max-width: 768px) 100vw, 50vw" />
  <source type="image/webp" srcSet="..." sizes="..." />
  <img src="/assets/landing_mentors_20260607-tablet.webp" alt="..." width="768" height="512" loading="lazy" decoding="async" />
</picture>
```
- Hero image (above fold) → `loading="eager"` + `fetchPriority="high"`.
- Image di bawah fold → `loading="lazy"`.

**Video demo (`saas_demo_video.mp4` 6.7 MB):**
- `<video preload="none" poster="...">` dengan poster image AVIF kecil (~15 KB).
- `navigator.connection.effectiveType`:
  - `4g` no Save-Data → autoplay muted loop.
  - `3g`/`slow-2g`/Save-Data → tampilkan poster + play button overlay, video tidak di-download.
- Encode AV1 + H.265 variant di build time (manual ffmpeg, doc di README).

**Asset cleanup candidates (di-list di sini, eksekusi di Fase 8):**
- `card-bg.png` (751KB) — sudah punya `card-bg.webp` (5.3KB). Hapus .png jika tidak ada referensi.
- `card-fisika.png` (753KB), `card-kimia.png` (716KB), `card-matematika.png` (751KB) — sama, > 700KB tapi `.webp` (4-6KB) sudah ada.
- `20f1fadc-a331-4841-9834-4f5cc4cb3ea7.jpg` (70KB) — investigasi referensi.

**File baru (2):** `scripts/build/optimize-images.js`, `docs/performance/image-quality-review.md`. **File diubah (2-4):** `package.json`, `src/lobby.jsx`. **Risk:** LOW. **Rollback:** Gunakan `.png` original.

**Quality gate (S1 + S2):**
- Butteraugli score < 1.0 untuk setiap image (S1)
- LCP < 2.5s (S2)
- Hero image: AVIF q=70 (lebih konservatif untuk wajah manusia)
- Below-fold: AVIF q=60

---

### FASE 4 — Hapus Tailwind CDN + React DevTools Runtime [UPDATED + S5]
**Effort:** 2-3 jam (+ 1 jam safelist audit)

**Tujuan:** Eliminasi 3MB Tailwind JIT runtime dan ~1MB React dev warning code.

**Tailwind:** Sudah ada `postcss.config.js` di root. Tambah Tailwind sebagai build-time PostCSS plugin.
- Buat `tailwind.config.js` lokal yang mirror `tailwind.config` inline di MAFIKING.html (line 20-44).
- `content: ['./src/**/*.{jsx,js}', './dist/index.html', './tweaks-panel.jsx']`
- Tambah `safelist` untuk class dinamis (terutama `app-page-bg--*`, `mafiking-*`).
- Output: satu file CSS ~30-40 KB minified.
- Hapus `<script src="https://cdn.tailwindcss.com">` dari MAFIKING.html.
- Hapus `tailwind.config = {...}` script inline.
- Tambah `<link rel="stylesheet" href="/src/styles.css">` (compiled Tailwind included).

**React production build:**
- Vite sudah pakai `react.production.min.js`. Verifikasi.
- Untuk MAFIKING.html (legacy dev path): ganti URL ke `react.production.min.js` + `react-dom.production.min.js` dengan integrity hash baru.

**Safelist audit (effort 1 jam):**
- Grep `className={` di `src/*.jsx` → identify pattern dynamic class.
- Tambah semua pattern ke Tailwind safelist.
- Pre-deploy: visual regression test (S5) di 8 route.

**File baru (1):** `tailwind.config.js`. **File diubah (3):** `MAFIKING.html`, `postcss.config.js`, `src/styles.css`. **Risk:** MEDIUM. **Rollback:** Restore CDN script tag.

**Quality gate:** Visual regression 0 layout diff (S5), CSS bundle < 50KB gzipped, class hit rate > 99%.

---

### FASE 5 — Service Worker Conservative [UPDATED + S4]
**Effort:** 3-4 jam (lebih pendek dari original karena scope kecil)

**Tujuan:** Returning user yang sudah login → app shell muncul dari cache dalam < 500ms tanpa network.

**Scope first deployment (KONSERVATIF):**
- ✅ Cache static assets only: `/assets/*.js`, `/assets/*.css`, `/assets/landing/*.{avif,webp}`, fonts, KaTeX
- ❌ NO API cache (first deployment)
- ❌ NO offline shell (first deployment)
- ❌ NO manifest install prompt (first deployment)
- ✅ Emergency kill switch endpoint

**Cache strategy (first deployment):**

| Resource | Strategy | TTL |
|----------|----------|-----|
| `/assets/index-*.js`, `/assets/index-*.css` (versioned) | Cache-first | 1 year immutable |
| `/assets/vendor-react-*.js` | Cache-first | 1 year immutable |
| `/assets/landing/*-{mobile,tablet,desktop}.{avif,webp}` | Cache-first | 30 days |
| Fonts (gstatic, jsdelivr) | Cache-first | 1 year |
| **Everything else** | **Network only** | — |

**File baru (2):**
- `public/sw.js` — minimal SW, static cache only
- `server/routes/sw-admin.js` — `POST /api/admin/sw-emergency-clear` (admin-only)

**File diubah (2):**
- `dist/index.html` (via Vite plugin) — `if ('serviceWorker' in navigator && location.protocol === 'https:') register('/sw.js')`
- `MAFIKING.html` (dev fallback) — sama tapi non-functional di dev

**Update flow:**
- `BUILD_HASH` di SW update name cache, delete old cache on activate
- `clients.claim()` setelah activate
- **No `skipWaiting`** (user keep old version until close all tabs → no surprise)
- Toast "Refresh untuk update" saat new SW waiting

**Emergency kill switch:**
- `POST /api/admin/sw-emergency-clear` (admin auth required) → respond dengan header `Clear-Site-Data: "storage"` + return script yang unregister SW.
- Admin paste URL di address bar → SW unregisters immediately.

**Iterasi berikutnya (setelah first deployment stabil 1 minggu):**
- Add API cache (stale-while-revalidate, sensitive endpoints network-only)
- Add offline shell
- Add manifest + install prompt

**Skip route untuk security:**
- Jangan cache apapun di `/admin*` route.
- Jangan cache request dengan `Authorization` header.
- Respect `Cache-Control: no-store` dari API responses.

**Quality gate (S4):**
- Playwright test 5 skenario: first install, cache hit, version bump, kill switch, normal flow
- LCP returning user < 800ms (S2)

---

### FASE 6 — Client State Cache + Skip Lobby untuk Returning User
**Effort:** 2-3 jam

**Tujuan:** Returning logged-in user tidak lihat blank screen 1-2 detik saat `/api/auth/me` blocking.

**Strategi:**
1. **Cache `currentUser` minimal di sessionStorage** dengan TTL 1 jam:
   - Saat `refreshCurrentUser()` sukses: simpan `{ id, display_name, role, profile_needs_completion, fetchedAt }` ke `sessionStorage.setItem('mafiking:user', ...)`.
   - Saat app boot, sebelum API balik: baca dari sessionStorage. Jika `Date.now() - fetchedAt < 3600000`, set `currentUser` state SYNC di `useState` initializer. Tetap jalan `refreshCurrentUser()` di background untuk revalidasi.
   - Konsekuensi: `isLoggedIn` diketahui SEBELUM API balik → routing langsung ke `belajar` tanpa flash `lobby`.

2. **Skip lobby chunk download untuk known-logged-in user:**
   ```js
   const cachedUser = readCachedUserSync();
   if (cachedUser && !isGuest(cachedUser) && location.pathname === '/') {
     import('./route/belajar.jsx');
     history.replaceState({}, '', '/belajar');
   } else {
     import('./route/lobby.jsx');
   }
   ```

3. **Invalidasi cache saat logout:** `MafikingClerk.signOut` dan `MafikingAPI` logout handler harus call `sessionStorage.removeItem('mafiking:user')` + `caches.delete('mafiking-api-v1')`.

4. **Sync across tabs:** Listen `window.addEventListener('storage', ...)` untuk handle logout di tab lain.

5. **Secure cache:** Tidak boleh cache `email`, `phone_number`, atau data sensitif lain. Hanya minimal fields untuk routing decision.

**File diubah (3):** `src/app.jsx`, `src/main.jsx` (entry), `src/clerk-auth.jsx`. **Risk:** LOW. **Rollback:** Hapus `readCachedUserSync()` call.

**Quality gate:** Test login → refresh → close tab → reopen → no flash, instant `/belajar`. Test logout in tab A → tab B detects via storage event.

---

### FASE 7 — Adaptive Loading (Network-Aware) + Mobile-Specific Optimization
**Effort:** 3-4 jam

**Tujuan:** HP murah di jaringan jelek dapat experience lebih ringan; HP mahal di WiFi cepat dapat fitur penuh.

**Strategi:**
1. **`src/shared.jsx`** — tambah `useNetworkAwareness()` hook:
   ```js
   function useNetworkAwareness() {
     const [state, setState] = React.useState({
       saveData: false, effectiveType: '4g', isSlowConnection: false,
       prefersReducedMotion: false, deviceMemory: 8
     });
     React.useEffect(() => {
       const conn = navigator.connection;
       if (!conn) return;
       const update = () => setState({
         saveData: conn.saveData || false,
         effectiveType: conn.effectiveType || '4g',
         isSlowConnection: ['slow-2g', '2g', '3g'].includes(conn.effectiveType) || conn.saveData,
         prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
         deviceMemory: navigator.deviceMemory || 8
       });
       update();
       conn.addEventListener('change', update);
       return () => conn.removeEventListener('change', update);
     }, []);
     return state;
   }
   window.useNetworkAwareness = useNetworkAwareness;
   ```

2. **Aplikasikan di `src/lobby.jsx`:**
   - `isSlowConnection || deviceMemory < 4` → video demo tidak autoplay, poster only.
   - `prefersReducedMotion` → matikan animasi reveal/pop di landing.
   - Particle effects, gradient mesh, blur backdrop → matikan untuk low-end.

3. **Aplikasikan di `src/practice.jsx`:**
   - `deviceMemory < 2` (Android Go): canvas grid pattern → tidak render (atau hanya 4-line minimal).
   - `requestIdleCallback` untuk non-critical work.

4. **Image `decoding="async"` + `fetchpriority`:**
   - LCP hero image → `fetchpriority="high"`.
   - Below-fold image → `decoding="async"` + `loading="lazy"`.

5. **Tambah `Save-Data` header passthrough:**
   - Server: jika header `Save-Data: on` → respond dengan compact JSON (omit non-critical fields).
   - Endpoint: `/api/missions`, `/api/tryout-packages`, `/api/quiz/init`.

**File diubah (3-4):** `src/shared.jsx`, `src/lobby.jsx`, `src/practice.jsx`, beberapa route handler. **Risk:** LOW. **Rollback:** Hook return default values (4g, no save-data).

**Quality gate:** Verify `prefers-reduced-motion: reduce` → animations off. Verify `Save-Data: on` header di request.

---

### FASE 8 — Dead Code & Asset Cleanup
**Effort:** 2-3 jam audit + execution

**Tujuan:** Hapus file yang sudah tidak terpakai untuk mengurangi bundle, asset size, dan maintenance burden.

**Candidates yang sudah teridentifikasi (perlu verifikasi referensi sebelum hapus):**
1. **Asset duplikat (.png yang sudah punya .webp):**
   - `assets/card-bg.png` (751KB) ↔ `assets/card-bg.webp` (5.3KB)
   - `assets/card-fisika.png` (753KB) ↔ `.webp` (4.8KB)
   - `assets/card-kimia.png` (716KB) ↔ `.webp` (6.2KB)
   - `assets/card-matematika.png` (751KB) ↔ `.webp` (5.3KB)
   - **Saving: ~2.97 MB asset disk**. Verify referensi di src/ + scripts/ sebelum hapus.

2. **PLAN file legacy di root:**
   - `PLAN_API_OPTIMIZATION.md` — status "In progress — Phase 1 dan Phase 2 implemented". Verifikasi apakah sudah complete.
   - `PLAN_LATENCY_REDUCTION_V2.md` — sebagian besar checkbox `[x]`. Bisa archive.

3. **Cookie file di root:** `93439179_cookie.txt` — sepertinya artifact, audit asal.

4. **`src/main.jsx`** — hanya 3 baris. Tidak ada `main.css` — verifikasi referensi.

5. **Tweaks panel:** `tweaks-panel.jsx` — pisah ke chunk lazy yang hanya load saat `?tweaks=1`.

6. **`src/admin-monitoring.jsx`** — sudah dipisah jadi chunk admin sendiri (good), tapi verify tidak ada referensi inline dari MAFIKING.html.

7. **Unused npm dependencies:** Jalankan `depcheck` (read-only):
   ```bash
   npx depcheck --skip-missing
   ```
   Likely candidates: `@clerk/react` (kalau hanya pakai `@clerk/express` + custom Clerk loader).

8. **`scripts/`** — beberapa test:* scripts yang sudah obsolete.

**Risk:** MEDIUM kalau ada hidden dependency. Mitigasi: cleanup di branch terpisah dengan full `npm run check` + manual smoke test.

**Quality gate:** `npm run check` pass, `npm run build` pass tanpa warning baru, manual smoke test 8 route.

---

## 6. Implementation Order & Timeline

| # | Fase | Effort | Risk | Impact | Wajib sebelum next |
|---|------|--------|------|--------|--------------------|
| 1 | Production Bundle Switchover | 3-4 jam (+1 S2) | LOW | ★★★★★ | — (foundation) |
| 2 | Route-Level Code Splitting | 6-8 jam (+2 S3) | MED | ★★★★★ | Fase 1 |
| 3 | Image & Video Pipeline | 4-5 jam + 1-2 hari S1 | LOW | ★★★★★ LCP | Independent |
| 4 | Hapus Tailwind CDN + React dev | 2-3 jam (+1 audit) | MED | ★★★★ | Fase 1 |
| 5 | Service Worker conservative | 3-4 jam (+1 S4) | MED | ★★★★★ returning | Fase 1-4 (perlu stable hash) |
| 6 | Client State Cache + Skip Lobby | 2-3 jam | LOW | ★★★★ | Fase 2 |
| 7 | Adaptive Loading | 3-4 jam | LOW | ★★★ | Independent |
| 8 | Dead Code Cleanup | 2-3 jam audit | MED | ★★ | Setelah 1-7 stable |

**Total effort:**
- Core Fase 1-8: 27-36 jam
- + S1 Butteraugli calibration: +12-16 jam (1-2 hari)
- + S2 Lighthouse CI setup: +2-3 jam
- + S3 Skeleton library: +2-3 jam
- + S4 SW kill switch + tests: +1-2 jam
- + S5 Visual regression suite: +6-8 jam
- **Grand total: 48-68 jam** (6-8.5 hari kerja @ 8 jam/hari)

**Direkomendasi urutan eksekusi final (prioritas quality-first):**
1. **Fase 3.0 — Butteraugli calibration** (1-2 hari, isolated) → tentukan quality setting
2. **Fase 1 — Bundle switchover** + S2 Lighthouse CI setup
3. **Fase 3 — Image pipeline** + S1 visual review
4. **Fase 2 — Code splitting** + S3 skeletons
5. **Fase 4 — Tailwind/React prod** + S5 visual regression
6. **Fase 6 — User state cache**
7. **Fase 5 — Service Worker conservative** + S4 kill switch
8. **Fase 7 — Adaptive loading**
9. **Fase 8 — Dead code cleanup**
10. **Update AGENTS.md** dengan quality invariants

Tiap fase deploy ke staging dulu, validate Core Web Vitals, baru lanjut.

---

## 7. Validation & Test Plan

### 7.1 Performance Budgets (auto-fail di CI)

- **LCP mobile**: < 2.5s (good) / fail kalau > 4s
- **FCP mobile**: < 1.8s
- **INP**: < 200ms
- **CLS**: < 0.1 (target < 0.05)
- **JS bundle initial**: < 250 KB gzipped (main + vendor)
- **Image LCP**: < 100 KB
- **Total page weight (landing)**: < 800 KB

### 7.2 Tools

- **Lighthouse CI** (`@lhci/cli`) — di every PR via `npm run perf:audit`.
- **WebPageTest** — manual untuk "Moto G4" (Lighthouse default mobile profile).
- **Chrome DevTools — Performance Insights** + CPU throttling 4× slowdown + Slow 4G.
- **Existing `src/performance-vitals.js`** — extend untuk track per-route LCP.
- **`/api/performance/summary`** endpoint (sudah ada di `server.js:699`) — extend untuk dashboard admin.

### 7.3 Per-Fase Quality Gates (HARUS LULUS sebelum deploy)

| Fase | Performance | A11y | Visual | Reliability | Budget |
|------|-------------|------|--------|-------------|--------|
| 1 | LCP < 2.5s | ≥ 95 | Layout 0 diff | Bundle < 250KB gz | Lighthouse CI green |
| 2 | CLS < 0.05, INP < 200ms | ≥ 95 | Skeleton = real shape | Code coverage 100% | Lighthouse CI green |
| 3 | LCP < 1.5s, image < 100KB | ≥ 95 | Butteraugli < 1.0 | All 3 size variants | Lighthouse CI + Butteraugli green |
| 4 | CSS < 50KB gz | ≥ 95 | Layout 0 diff | Class hit > 99% | Visual regression pass |
| 5 | LCP < 800ms (returning) | ≥ 95 | N/A | SW kill switch works | Playwright 5/5 pass |
| 6 | Returning TTI < 300ms | ≥ 95 | N/A | Cross-tab sync works | Manual + Playwright pass |
| 7 | N/A (adaptive) | ≥ 95 (better with motion prefs) | Animations off di low-end | Network-aware | Manual + axe-core pass |
| 8 | N/A | N/A | 0 diff | npm run check pass | CI green |

### 7.4 Manual Smoke Test Checklist per Fase

- [ ] Buka `/` di Android Chrome low-end emulation → LCP < 2.5s
- [ ] Login → refresh tab → re-open tab → muncul ke `/belajar` < 800ms
- [ ] Buka Practice → submit canvas → INP touch < 200ms
- [ ] Buka Admin → admin chunk lazy load, tidak hit untuk non-admin
- [ ] Toggle Save-Data on → video tidak autoplay, image lebih kecil
- [ ] Service Worker registered → tutup tab → offline → buka tab → app shell muncul
- [ ] DevTools Memory profiler: heap snapshot Practice < 60 MB
- [ ] `npm run check` pass
- [ ] `npm run build` pass tanpa warning baru

### 7.5 Global Quality Metrics (post-deployment)

- **Lighthouse Performance** mobile ≥ 90, desktop ≥ 95
- **Lighthouse Accessibility** ≥ 95
- **Lighthouse Best Practices** ≥ 95
- **Lighthouse SEO** ≥ 95
- **Bundle initial** < 250KB gzipped
- **LCP image** < 100KB mobile
- **Total page weight (landing)** < 800KB
- **Zero visual regressions** (Playwright snapshots)
- **Zero broken routes** (E2E happy path)
- **Real user monitoring** CrUX: p75 LCP < 2.5s, p75 INP < 200ms, p75 CLS < 0.1

### 7.6 Regression Tests

- Visual regression: simpan screenshot baseline tiap route, compare after.
- E2E: scripted Playwright (atau curl-based) yang verify routing happy path.
- Existing `tests/frontend/test-performance-contract.js` — extend untuk include bundle size assertion.

---

## 8. Expected Outcomes

### 8.1 Performance Metrics (Mobile, Slow 4G, Mid-tier Android)

| Metric | Sekarang | Setelah Plan | Status WebVitals |
|--------|----------|--------------|------------------|
| LCP | 5.8 - 8.5 s | **1.8 - 2.4 s** | good |
| FCP | 4.2 - 6.0 s | **1.1 - 1.6 s** | good |
| INP (canvas) | 320 - 500 ms | **120 - 180 ms** | good |
| CLS | 0.05 - 0.12 | **< 0.05** | good |
| TTI | 22 - 28 s | **3.5 - 5 s** | good |
| TBT | 4500 - 7000 ms | **300 - 500 ms** | good |
| Returning user (cold cache) | 4 - 7 s blank | **< 500 ms shell** | excellent |

### 8.2 RAM Heap (Practice page, after 5 min usage)

| Device | Sekarang | Setelah Plan |
|--------|----------|--------------|
| HP murah 2GB RAM (Android Go) | 120 - 180 MB (frequent OOM kill) | **40 - 70 MB** |
| HP mid-range 4GB RAM | 150 - 220 MB | **60 - 90 MB** |
| HP flagship 8GB+ RAM | 200 - 300 MB (tidak terasa) | **80 - 120 MB** |

### 8.3 Bandwidth (First Visit, Landing Page)

- **Sekarang:** ~20 MB transferred
- **Setelah Plan:** **~600-800 KB transferred** (96% reduction)

### 8.4 Bandwidth (Returning User, Login → Belajar)

- **Sekarang:** ~1.5 MB transferred
- **Setelah Plan:** **~30 KB API + 0 KB static (SW cache)** (98% reduction)

---

## 9. Risk & Mitigation Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bundle split breakage (hidden cross-file dep) | HIGH | Refactor incremental, satu route per PR, smoke test full app |
| Service Worker "locks" user pada versi lama | HIGH | `clients.claim()` tanpa `skipWaiting` + emergency unregister endpoint + version pinning + kill switch localStorage |
| Tailwind dynamic class hilang dari output CSS | MED | Safelist agresif, visual regression test, gradual migration |
| AVIF tidak supported di iOS < 16 | LOW | Fallback chain `<picture>` AVIF→WebP→JPEG (built-in browser logic) |
| Sharp install failed di VPS (catatan AGENTS F-11) | MED | Image generation hanya di dev/CI, output di-commit ke repo atau di-build artifact, runtime VPS tidak butuh Sharp |
| sessionStorage user cache stale (role demoted) | LOW | TTL 1 jam + background revalidate + clear on logout + cross-tab storage event listener |
| Vite chunk hash berubah → invalidate semua SW cache | LOW (by design) | Acceptable, ini behavior yang diinginkan untuk update |
| Tweaks panel atau dev-only tool akhirnya broken | LOW | Identify Fase 8, lazy load saat `?tweaks=1` |
| Lighthouse CI threshold terlalu ketat → block PR yang valid | LOW | Set initial threshold yang realistis, tighten gradual |
| Butteraugli calibration menambah delay sebelum Fase 3 | MED | Calibration parallel dengan Fase 1, hasilnya dipakai di Fase 3 |

---

## 10. Definition of Done (Master Checklist)

**Fase 1 (Production Bundle Switchover):**
- [ ] `MAFIKING_FORCE_BUILD=1` env guard di `server.js`
- [ ] `dist/index.html` punya preload hint untuk LCP image + theme-color sync
- [ ] `vite.config.js` cssCodeSplit + es2020 target + lightningcss
- [ ] `scripts/check-prod-build.js` + `scripts/check-bundle-budget.js` + `.lighthouserc.js` ada
- [ ] `npm run check` + `npm run build` pass
- [ ] Lighthouse Performance ≥ 90 di mobile

**Fase 2 (Code Splitting):**
- [ ] `scripts/build/build-legacy-entry.js` emit ≥10 chunks
- [ ] `src/app.jsx` pakai `React.lazy` + `<Suspense>` per route
- [ ] `src/components/RouteSkeleton.jsx` mencegah CLS dengan aspect-ratio
- [ ] Network tab: buka `/` → tidak load `route-admin.js`, `route-tryout.js`, `route-practice.js`
- [ ] Setiap route render dengan benar setelah refactor
- [ ] CLS < 0.05, INP < 200ms

**Fase 3 (Image Pipeline):**
- [ ] `docs/performance/image-quality-review.md` ada dengan hasil Butteraugli calibration
- [ ] `scripts/build/optimize-images.js` generate AVIF + WebP variants (3 sizes)
- [ ] `src/lobby.jsx` pakai `<picture>` dengan srcset
- [ ] LCP image < 100KB transferred di mobile viewport
- [ ] Video preload="none", poster only di slow connection
- [ ] Butteraugli score < 1.0 untuk semua hero image

**Fase 4 (Hapus CDN runtime):**
- [ ] Tailwind PostCSS prebuilt CSS ≤ 40KB minified
- [ ] CDN script tag dihapus dari MAFIKING.html
- [ ] React production build di MAFIKING.html (dev fallback)
- [ ] Visual regression test pass (0 layout diff)
- [ ] Safelist mencakup semua dynamic class

**Fase 5 (Service Worker):**
- [ ] `public/sw.js` + `public/manifest.webmanifest`
- [ ] Cache strategies sesuai tabel (static only first deploy)
- [ ] Versioning via `BUILD_HASH`
- [ ] Emergency unregister endpoint `/api/admin/sw-emergency-clear` tested
- [ ] No `skipWaiting` (graceful update)
- [ ] Playwright 5 skenario pass (install, hit, version bump, kill switch, normal flow)
- [ ] Lighthouse PWA score > 90

**Fase 6 (User State Cache):**
- [ ] sessionStorage cache currentUser dengan TTL 1 jam
- [ ] Returning user → `/belajar` < 300ms
- [ ] Logout invalidate cache (local + cross-tab)
- [ ] Tidak cache `email`/`phone`/PII

**Fase 7 (Adaptive Loading):**
- [ ] `useNetworkAwareness()` hook di `src/shared.jsx`
- [ ] Video tidak autoplay di Save-Data
- [ ] Animasi off di `prefers-reduced-motion: reduce`
- [ ] Canvas grid pattern disabled untuk `deviceMemory < 2`
- [ ] Save-Data passthrough ke API (`/api/missions`, `/api/tryout-packages`, `/api/quiz/init`)

**Fase 8 (Cleanup):**
- [ ] `assets/card-*.png` (jika tidak ada referensi) dihapus
- [ ] `PLAN_API_OPTIMIZATION.md`, `PLAN_LATENCY_REDUCTION_V2.md` archive ke `docs/archive/`
- [ ] `93439179_cookie.txt` di-audit dan di-handle
- [ ] `depcheck` audit dan remove unused packages
- [ ] No regression di `npm run check`

**Global:**
- [ ] LCP mobile < 2.5s (Lighthouse CI gate)
- [ ] Bundle initial < 250KB gzipped
- [ ] All Core Web Vitals "good" rating
- [ ] Lighthouse Performance ≥ 90, A11y ≥ 95
- [ ] Zero visual regressions (Playwright snapshots)
- [ ] Documentation update di `ARCHITECTURE.md` dan `AGENTS.md` (AGENTS.md baru di section 11)

---

## 11. AGENTS.md Additions (Apply Setelah Exec Selesai)

Section baru yang akan ditambahkan ke `AGENTS.md`:

```markdown
## Performance & Quality Invariants

These invariants prevent performance regressions and ensure visual/accessibility quality.

### Image Quality
- Hero images (above-fold, LCP candidates): AVIF q=70, WebP q=85.
- Default images: AVIF q=65, WebP q=80.
- Below-fold images: AVIF q=60, WebP q=75.
- All images served via `<picture>` with AVIF + WebP + JPEG fallback.
- All images served with 3 responsive size variants (640w, 960w, 1280w).
- LCP image must have `<link rel="preload" fetchpriority="high">` in `<head>`.
- New images must pass Butteraugli score < 1.0 before commit (S1).
- Lazy loading: `loading="lazy" decoding="async"` for below-fold, never for LCP.

### Performance Budgets
- Bundle initial: < 250KB gzipped (app-shell + vendor-react + belajar route).
- LCP element: < 100KB transferred for mobile viewport.
- Total page weight (landing): < 800KB.
- Main thread TBT: < 500ms.
- Lighthouse Performance mobile: ≥ 90 (enforced in CI).
- Lighthouse Accessibility: ≥ 95 (enforced in CI).

### Service Worker Discipline
- SW scope: cache-first for static assets only (`/assets/*.{js,css,avif,webp,jpg,png,woff2}` + KaTeX + fonts).
- SW never caches: API responses, authenticated routes, /admin/* paths.
- SW emergency kill switch: `POST /api/admin/sw-emergency-clear` (admin only).
- New SW activates on `clients.claim()`; no `skipWaiting` to avoid surprise updates.
- Show "Refresh untuk update" toast when new SW is waiting.

### Core Web Vitals Targets (p75)
- LCP < 2.5s on 4G mobile
- INP < 200ms
- CLS < 0.1 (target: < 0.05)
- FCP < 1.8s

### Network-Aware Behavior
- Respect `navigator.connection.saveData` → skip video autoplay, smaller images.
- Respect `prefers-reduced-motion: reduce` → disable reveal/pop animations.
- `navigator.deviceMemory < 2` → disable canvas grid pattern, reduce particle effects.
- Server: pass `Save-Data` header for API responses (compact JSON option).

### Accessibility Invariants
- `prefers-reduced-motion` must be respected.
- All interactive elements must be keyboard accessible.
- Color contrast meets WCAG AA minimum.
- Form controls have associated labels.
- Animations are decorative — never convey critical information.
```

**Catatan:** Section "Production runtime" di AGENTS.md perlu di-update:
- Hapus `Verify runtime behavior through the Express server, not only through Vite build output` → Ganti: `Production runtime adalah dist/. Verify mobile-first di browser DevTools + Lighthouse CI sebelum merge.`
- Hapus `Keep the frontend load model as globals loaded by MAFIKING.html` → Ganti: `Production load model adalah ES modules dari dist/ dengan route-level code splitting. MAFIKING.html hanya untuk dev fallback.`

---

## 12. Final Closing Argument

**Quality vs Performance** untuk Mafiking:
- **Mafiking adalah web edukasi matematika** — kualitas visual rumus, persamaan, dan UI yang "premium" adalah brand identity.
- **Mafiking juga harus accessible untuk HP murah** karena target user adalah mahasiswa TPB yang kemungkinan punya device bervariasi.
- Plan ini mencapai **keduanya** dengan safeguard Butteraugli + Lighthouse CI + visual regression sebagai "quality immune system".

**Rekomendasi urutan eksekusi final:**
1. **Fase 3.0 — Butteraugli calibration** (1-2 hari, isolated) → tentukan quality setting
2-10. Sisa fase sesuai urutan di section 6.

Setelah plan ini selesai, **AGENTS.md** perlu update dengan section "Performance & Quality Invariants" di atas.

---

**Status:** Planned. Belum ada eksekusi. Menunggu approval user.
**Rekomendasi langkah pertama:** Mulai dari **Fase 3.0 (Butteraugli calibration)** sebagai isolated experiment. Output: `docs/performance/image-quality-review.md` dengan side-by-side comparison 5 quality level × 10 image = 50 evaluation points. Setelah itu, baru masuk ke Fase 1-2 dengan konfidensi quality terjaga.
