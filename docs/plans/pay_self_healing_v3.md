# Plan: `pay_self_healing_v3.md` — Self-Healing QRIS Auto-Verify + Real-Time Push

## 0. Metadata

```yaml
title: "feat: Self-Healing QRIS Auto-Verify + SSE Push + Admin Bulk Resolver"
status: approved
plan_depth: Deep
created: 2026-06-12
origin: "User feedback: masih ada minus dari plan_security_payment.md — admin masih harus intervensi sering, maintenance masih sering, konfirmasi user masih lambat"
supersedes: auto-verification-collector-matching-engine.md (fase-fase yang sudah selesai, akan direstrukturisasi)
execution_mode: parallel-2-tracks
target_estimate: 3-4 hari kerja (parallel)
```

## 1. Latar Belakang & Konteks

### 1.1 Recap: Apa yang sudah selesai (dari `plan_security_payment.md`)

| Phase | Status | Bukti |
|---|---|---|
| 0: Baseline & freeze | ✅ DONE | `MUTATION_COLLECTOR_ENABLED=false` default, `scripts/security/baseline-audit.js` |
| 1: Ledger invariants | ✅ DONE | `payment_webhook_events`, `payment_idempotency_keys`, unique constraints |
| 2: Webhook & reconciliation | ✅ DONE | `checkAndRecordWebhookEvent`, `validateProviderStatus`, strict match |
| 3: Supply chain | ✅ DONE | `@prasetya/qris@0.2.1` & `qris-mutasi@2.0.0` exact pin, SBOM, audit |
| 4: Isolated collector | ✅ DONE | `server/workers/collector.js`, `POST /api/payment/reconcile/mutation-batch` signed |
| 5: AppSec web & admin | ✅ DONE | `server/security/ip-allowlist.js`, per-action rate limit, CSP migration check |
| 6: Server & operational | ✅ DONE | `server/payments/payment-alerts.js`, `scripts/security/rotate-secrets.js`, audit immutability |
| 7: Monitoring & IR | ✅ DONE | `docs/security/payment-runbook.md`, `GET /api/admin/payments/dashboard` |

47 test baru sudah ada.

### 1.2 Konfirmasi owner (2026-06-12)

- ❌ **Hapus** semua kode Mutasiku (sudah tidak dipakai)
- ❌ **Hapus** semua kode Duitku & Midtrans (sudah tidak dipakai)
- ✅ **Pertahankan** QRIS lokal + qris-mutasi sebagai satu-satunya payment source
- ✅ **Real-time push** ke user via Server-Sent Events (SSE)
- ✅ **Email notifikasi** sebagai backup push
- ✅ **Full overhaul**: backend + frontend + admin UX

### 1.3 Risiko keputusan ini

- Single point of failure: kalau `merchant.qris.id` down/berubah, semua auto-verify mati
- Mitigasi: collector self-healing, admin manual mark-paid sebagai fallback terakhir, plan B = raw HTTP scraping tanpa library

## 2. Analisis Minus Poin (Detail)

### Minus #1 — Default `MUTATION_COLLECTOR_ENABLED=false` ⇒ 100% manual

**Evidence:** `server.js:443-481`, `scripts/security/baseline-audit.js:67-72`, `server/payments/mutation-collector.js:80`

**Dampak:** Setiap user bayar QRIS → admin harus standby, klik mark-paid manual. Untuk 50 transaksi/hari, admin butuh ~30-60 menit/hari.

### Minus #2 — Library `qris-mutasi` punya risk signal lemah

**Evidence (webfetch npmjs.com):** 12 weekly downloads, 2 tahun tidak update, 1 maintainer, dependency `cheerio` (3M+ DL/wk).

**Dampak:** Bug fix lambat saat dashboard `merchant.qris.id` berubah HTML.

### Minus #3 — Cookie management rapuh (chdir hack)

**Evidence (`server/payments/providers/QrisMutasiProvider.js:22-25, 60-75`):**
- `process.chdir(this.cookieDir)` — TIDAK di-restore
- Library ignore `cookieDir` param, hard-code path relatif ke `process.cwd()`

**Dampak:** Race condition, working directory bocor.

### Minus #4 — Tidak ada auto re-login saat sesi expired

**Evidence (`server/payments/providers/QrisMutasiProvider.js:60-75`):** `_ensureClient()` hanya cek `this.qris == null`, tidak deteksi 401/login form.

**Dampak:** Setelah cookie expired, collector diam-diam 0 matched/jam. Admin restart manual.

### Minus #5 — Client polling 5s + server collector 15s = 20s latency

**Evidence:** `src/payment.jsx:182-204` (5s), `server/payments/mutation-collector.js:4` (15s). Worst case 20-22s.

**Dampak:** User bingung setelah bayar karena UI masih "Menunggu".

### Minus #6 — Matching ambigu pada nominal kecil

**Evidence (`server/payments/mutation-matcher.js:39-79`):** Exact amount only, multiple match → ambiguous queue.

**Dampak:** 2 user checkout paket sama di menit sama → salah satu bayar → admin handle.

### Minus #7 — Dead code Mutasiku/Duitku/Midtrans

**Evidence:** `server/routes/payment.js:36-44, 350-389, 672-712, 885-929`, `lib/reconcilers/mutasiku.js` (205 baris).

**Dampak:** Cognitive load, security audit surface luas.

### Minus #8 — Tidak ada email notifikasi saat auto-verify sukses

**Evidence:** `server/notifications/mailer.js` ada tapi `markPaymentPaid` tidak panggil mailer.

### Minus #9 — Admin dashboard tidak bisa bulk + tidak ada ambiguous resolver UI

**Evidence (`server/routes/admin-payments.js:102-115, 18-25`):** Endpoint mark-paid single, rate limit 10/5min.

### Minus #10 — Tidak ada real-time collector health di admin

**Evidence:** `server/payments/mutation-collector.js:85-92` `getStats()` ada tapi tidak real-time.

## 3. Target Outcomes (Metrik Konkret)

| KPI | Baseline | Target | Cara ukur |
|---|---|---|---|
| Admin manual mark-paid rate | 100% | ≤ 5% | log `source='admin'` ÷ total paid |
| Avg user confirmation latency | 15-20s | < 3s | EventSource timestamp vs markPaymentPaid |
| Collector uptime | ~70% est | ≥ 99% | lastSuccessAt delta |
| Ambiguous resolution time | hours | < 5 min | queue created_at to resolved_at |
| Maintenance check frequency | daily | weekly | calendar + automated check |
| Code surface area | 3 paths + Mutasiku | 1 path | LOC |
| Test coverage | 47 tests | +50 tests | npm test count |

## 4. Arsitektur Target

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser User (pembeli)                                          │
│  ┌────────────────────────────────────────┐                     │
│  │  Payment modal → QRIS di-scan          │                     │
│  │       │                                │                     │
│  │       ▼ EventSource("/api/payment/    │ ← SSE push          │
│  │          stream?orderId=...")         │   (< 3 detik)       │
│  │       │ fallback                       │                     │
│  │       ▼ setTimeout(check, 5000)        │                     │
│  └────────────────────────────────────────┘                     │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  Express server (main app)                                       │
│  ┌─────────────────┐   ┌──────────────────┐                     │
│  │ POST /payment/  │   │ /payment/stream  │ SSE endpoint         │
│  │   create        │   │  (per-order)     │ + per-user channel   │
│  └────────┬────────┘   └─────────┬────────┘                     │
│           │                      ▲                               │
│  ┌─────────────────┐   ┌─────────┴────────┐                     │
│  │ qris-suffix-    │   │ PaymentBroadcaster│ publish ke SSE    │
│  │ pool            │   │ (in-memory pub/sub)│                   │
│  └─────────────────┘   └─────────┬────────┘                     │
│  ┌─────────────────────────────────────────┐                    │
│  │  markPaymentPaid()                       │                    │
│  │   ├→ SQLite write + release suffix       │                    │
│  │   ├→ PaymentBroadcaster.publish()        │                    │
│  │   └→ mailer.sendPaymentSuccess()         │ ← email backup    │
│  └─────────────────┬───────────────────────┘                    │
│                    ▼                                            │
│  /api/payment/reconcile/mutation-batch (HMAC signed ingest)     │
└────────────────────┼────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│  Isolated Collector Process (server/workers/collector.js)              │
│  ┌────────────────────────────────────────┐                     │
│  │  SelfHealingCollector                  │                     │
│  │   ├─ circuit breaker (3-state)         │                     │
│  │   ├─ exponential backoff w/ jitter      │                     │
│  │   ├─ auto re-login on session-expired   │                     │
│  │   ├─ 3-tier adaptive polling:           │                     │
│  │   │    hot  (3s) saat ada pending      │                     │
│  │   │    warm (10s) normal               │                     │
│  │   │    cold (60s) idle                 │                     │
│  │   └─ health heartbeat ke main app      │                     │
│  └────────┬───────────────────────────────┘                     │
│  ┌────────────────────────────────────────┐                     │
│  │  QrisMutasiProvider (wrapper)         │                     │
│  │   ├─ atomic cookie dir per-instance     │                     │
│  │   └─ session-expired detection         │                     │
│  └────────┬───────────────────────────────┘                     │
└───────────┼─────────────────────────────────────────────────────┘
            ▼
   merchant.qris.id (DANA/OVO/GoPay dashboard)
```

## 5. Eksekusi: 2 Parallel Tracks

### Track 1: User-Facing & Cleanup (worktree: `wt-cleanup-sse-admin`)
- **Phase A**: Cleanup (hapus Mutasiku/Duitku) — 4-6 jam
- **Phase D**: SSE + Email push — 8-10 jam
- **Phase E**: Admin Dashboard upgrade — 10-14 jam

### Track 2: Backend Reliability (worktree: `wt-heal-matching-flags`)
- **Phase B**: Self-Healing Collector — 8-12 jam
- **Phase C**: Smart Matching + Confidence — 8-12 jam
- **Phase F**: Observability & Rollback — 4-6 jam

Track 1 dan Track 2 tidak share dependency kuat. Bisa di-merge di akhir.

## 6. PHASE A — Cleanup & Simplification (Track 1)

### 6.1 Tujuan
Hapus semua code path Mutasiku, Duitku, Midtrans agar codebase fokus ke QRIS lokal.

### 6.2 Detailed Actions

#### A.1 Hapus Mutasiku poller
```bash
git rm lib/reconcilers/mutasiku.js
git rm scripts/test-mutasiku-reconciler.js
```

Edit `server.js:440`:
```diff
- startMutasikuPoller(db);
```

Edit `server/routes/payment.js:25`:
```diff
- const { handleMutasikuWebhook } = require('../lib/reconcilers/mutasiku');
```

Edit `server/routes/payment.js:986-1018` (entire `/reconcile/mutasiku-webhook` route):
```diff
- // POST /api/payment/reconcile/mutasiku-webhook — Mutasiku signed webhook.
- router.post('/reconcile/mutasiku-webhook', (req, res) => { ... });
```

#### A.2 Hapus Duitku code path
Edit `server/routes/payment.js`:
- L36-44 (DUITKU_* constants) — hapus
- L65-78 (createDuitkuSignature, safeSignatureCompare, verifyCallbackSignature) — hapus
- L80-89 (hasDuitkuCredentials) — hapus
- L91-94 (normalizePaymentProvider): return `['manual', 'qris']`
- L350-389 (buildDuitkuInvoicePayload): hapus
- L665-712 (Duitku API call): hapus
- L789-821 (Duitku status check): hapus
- L885-929 (Duitku callback route): hapus

#### A.3 Lock provider ke `qris`
Edit `server/routes/payment.js:91-94`:
```js
function normalizePaymentProvider(env = process.env) {
    const provider = String(env.PAYMENT_PROVIDER || 'qris').trim().toLowerCase();
    return ['manual', 'qris'].includes(provider) ? provider : 'qris';
}
```

#### A.4 Update `.env.example`
Hapus: `DUITKU_*`, `MUTASIKU_*`.
Tambah: `MUTATION_COLLECTOR_ENABLED=true` (default), `MUTATION_POLL_INTERVAL_MS=10000`, `MUTATION_POLL_HOT_INTERVAL_MS=3000`, `MUTATION_POLL_COLD_INTERVAL_MS=60000`.

#### A.5 Update `package.json` scripts
Hapus: `test:mutasiku-reconciler`.

#### A.6 Tests
**File baru:** `tests/payment/test-cleanup-deps.js`

Test cases:
1. `mutasiku.js` file tidak ada di `lib/reconcilers/`
2. `server/payments/payment-reconciler.js` tidak import mutasiku
3. `server/routes/payment.js` tidak ada string `duitku`, `Duitku`, `DUITKU_`
4. `server/routes/payment.js` tidak ada route `/callback` (Duitku callback)
5. `.env.example` tidak ada `DUITKU_*`, `MUTASIKU_*`
6. `grep -r "midtrans" src/ server/routes/ lib/ scripts/ --include="*.js" --include="*.jsx"` returns 0 matches

### 6.3 Validasi Phase A
- `npm run check` exit 0
- `npm run test:cleanup-deps` exit 0
- `npm start` jalan tanpa error
- `GET /api/payment/config` return `{ provider: "qris", autoVerifyEnabled: true, ... }`
- Smoke test: buat order Rp 500, scan QRIS, manual mark-paid (admin) masih bekerja

## 7. PHASE B — Self-Healing Collector (Track 2)

### 7.1 Tujuan
Collector tidak boleh mati diam-diam, harus recover otomatis dari cookie/sesi expired, dan adaptif terhadap volume transaksi.

### 7.2 Detailed Design

#### B.1 Circuit Breaker 3-state

State machine: CLOSED → OPEN (failure threshold) → HALF_OPEN (recovery probe) → CLOSED (success) atau OPEN (failure).

```js
// server/payments/self-healing-collector.js
class CircuitBreaker {
    constructor({ failureThreshold = 3, recoveryTimeoutMs = 300000 }) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.failureThreshold = failureThreshold;
        this.recoveryTimeoutMs = recoveryTimeoutMs;
        this.openedAt = 0;
    }

    canRequest() {
        if (this.state === 'CLOSED') return true;
        if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.recoveryTimeoutMs) {
            this.state = 'HALF_OPEN';
            return true;
        }
        return false;
    }

    recordSuccess() {
        this.state = 'CLOSED';
        this.failures = 0;
    }

    recordFailure() {
        this.failures += 1;
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.openedAt = Date.now();
        }
    }
}
```

#### B.2 Adaptive 3-tier Polling

```js
function getAdaptiveInterval({ pendingCount, lastActivityAt }) {
    const now = Date.now();
    const idleMs = now - (lastActivityAt || 0);
    if (pendingCount >= 1) return HOT_INTERVAL_MS;       // 3000ms
    if (idleMs >= COLD_AFTER_MS) return COLD_INTERVAL_MS; // 60000ms
    return WARM_INTERVAL_MS;                              // 10000ms
}
```

#### B.3 Session-Expired Detection

```js
// server/payments/providers/QrisMutasiProvider.js
function isSessionExpiredError(error, responseHtml) {
    const errMsg = String(error?.message || '').toLowerCase();
    if (errMsg.includes('login') || errMsg.includes('session') || errMsg.includes('unauthorized')) return true;
    if (responseHtml && /<input[^>]+type=["']password["']/i.test(responseHtml)) return true;
    return false;
}
```

#### B.4 Atomic Cookie Dir

Ganti chdir hack dengan try/finally restore:

```js
async _ensureClient() {
    if (!this.qris) {
        if (!this.cookieDir) throw new Error('Cookie dir unavailable');
        const originalCwd = process.cwd();
        try {
            process.chdir(this.cookieDir);
            this.qris = new Qris(this.email, this.password);
        } finally {
            process.chdir(originalCwd); // ALWAYS restore
        }
    }
}
```

#### B.5 Health Heartbeat

Collector emit heartbeat setiap 30 detik ke main app via `POST /api/internal/collector-heartbeat`.

### 7.3 File Changes

| File | Action |
|---|---|
| `server/payments/self-healing-collector.js` | NEW |
| `server/payments/mutation-collector.js` | deprecated, wrap ke self-healing |
| `server/payments/providers/QrisMutasiProvider.js` | atomic cookie, session detection |
| `server/routes/admin-payments.js` | add heartbeat endpoint |
| `server.js` | wire self-healing collector |
| `tests/payment/test-self-healing-collector.js` | NEW — 10 test cases |

### 7.4 Test Cases

1. CircuitBreaker: CLOSED → 3 failures → OPEN → recovery → HALF_OPEN → success → CLOSED
2. CircuitBreaker: HALF_OPEN → failure → OPEN
3. Adaptive interval: pending=0 + idle < 5min → WARM
4. Adaptive interval: pending=0 + idle >= 5min → COLD
5. Adaptive interval: pending >= 1 → HOT
6. Session detection: error "Login required" → re-init
7. Session detection: HTML dengan `<input type=password>` → re-init
8. Session detection: normal HTML → no re-init
9. Cookie atomicity: 2 parallel `_ensureClient` tidak overwrite
10. Heartbeat: collector emit, main app menerima

## 8. PHASE C — Smart Matching + Confidence Scoring (Track 2)

### 8.1 Algoritma Confidence Scoring

```js
function scoreCandidate({ mutation, payment, transactedAt, userActivity, otherPendingSameAmount }) {
    let score = 0;

    // 1. Amount match (wajib, +100)
    if (payment.qris_full_amount === mutation.amount) score += 100;
    else return 0;

    // 2. Time window proximity (max +50)
    const minutesSinceCreated = (transactedAt - new Date(payment.created_at + 'Z').getTime()) / 60000;
    if (minutesSinceCreated >= 0 && minutesSinceCreated <= 30) {
        score += 50 - Math.min(50, Math.floor(minutesSinceCreated));
    } else if (minutesSinceCreated < 0) {
        score += 30;
    }

    // 3. User recent active session (max +30)
    if (userActivity && userActivity.lastActiveAt) {
        const minutesSinceActive = (transactedAt - new Date(userActivity.lastActiveAt + 'Z').getTime()) / 60000;
        if (minutesSinceActive >= -5 && minutesSinceActive <= 60) {
            score += 30 - Math.min(30, Math.floor(Math.abs(minutesSinceActive)));
        }
    }

    // 4. No collision (max +50)
    if (otherPendingSameAmount === 0) score += 50;
    else if (otherPendingSameAmount === 1) score += 20;

    return score;
}
```

Threshold: `score >= 180` → auto-match, `100-179` → ambiguous queue, `< 100` → unmatched log.

### 8.2 Ambiguous Queue Migration

```sql
-- db/migrations/006_ambiguous_queue.sql
CREATE TABLE IF NOT EXISTS payment_ambiguous_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id INTEGER NOT NULL,
    merchant_order_id TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    transacted_at DATETIME NOT NULL,
    amount INTEGER NOT NULL,
    payer_name_masked TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by TEXT,
    resolution TEXT,
    resolution_details TEXT,
    FOREIGN KEY (mutation_id) REFERENCES incoming_mutations(id)
);

CREATE INDEX idx_ambiguous_unresolved
    ON payment_ambiguous_queue(created_at)
    WHERE resolved_at IS NULL;
```

### 8.3 Test Cases (`tests/learning/test-confidence-matching.js`)

1. Single pending, exact amount, recent → score 230 → auto-match
2. Single pending, exact amount, no recent activity → 200 → auto-match
3. Two pending, exact amount same, one recently active → that one matches
4. Two pending, exact amount, neither active → both 180, ambiguous
5. Mutation time before payment created (clock skew) → edge case
6. Mutation time >30 min after payment created → low time score
7. Amount mismatch → 0 score, unmatched
8. Other pending same amount = 0 → +50
9. Other pending same amount = 1 → +20
10. Other pending same amount = 2 → 0, ambiguous
11. User active in last 5 min → +30
12. User active 1 hour ago → +0
13. Payment already EXPIRED → not a candidate
14. Payment already SUCCESS → not a candidate
15. Mutation FAILED → not considered

## 9. PHASE D — SSE + Email Push (Track 1)

### 9.1 PaymentBroadcaster (in-memory pub/sub)

```js
// server/payments/payment-broadcaster.js
const { EventEmitter } = require('events');

class PaymentBroadcaster extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(1000);
    }

    publish(merchantOrderId, payload) {
        this.emit(`paid:${merchantOrderId}`, payload);
        this.emit('paid:any', { merchantOrderId, payload });
    }

    subscribe(merchantOrderId, fn) {
        const event = `paid:${merchantOrderId}`;
        this.on(event, fn);
        return () => this.off(event, fn);
    }
}

module.exports = new PaymentBroadcaster();
```

### 9.2 SSE Endpoint

```js
router.get('/stream/:merchantOrderId', (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).end();

    const { merchantOrderId } = req.params;
    const payment = req.app.locals.db.prepare(
        'SELECT user_id, status FROM payments WHERE merchant_order_id = ?'
    ).get(merchantOrderId);
    if (!payment || payment.user_id !== userId) return res.status(403).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`event: status\ndata: ${JSON.stringify({ status: payment.status })}\n\n`);

    const unsubscribe = paymentBroadcaster.subscribe(merchantOrderId, (payload) => {
        res.write(`event: paid\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 15000);

    req.on('close', () => {
        unsubscribe();
        clearInterval(heartbeat);
    });
});
```

### 9.3 Hook di `markPaymentPaid`

```js
setImmediate(() => {
    const broadcaster = require('./payment-broadcaster');
    broadcaster.publish(payment.merchant_order_id, { status: 'SUCCESS', paidAt: now, grantId });
});

setImmediate(async () => {
    try {
        const user = db.prepare('SELECT email, display_name FROM users WHERE id = ?').get(payment.user_id);
        if (user && user.email) {
            const mailer = require('./mailer');
            const emailTpl = require('./email-templates');
            await mailer.send({
                to: user.email,
                subject: 'Pembayaran Mafiking Berhasil',
                html: emailTpl.paymentSuccess({ user, payment }),
            });
        }
    } catch (err) {
        console.error('[mailer] payment success email failed:', err.message);
    }
});
```

### 9.4 Frontend EventSource

```jsx
useEffect(() => {
    if (!qrData?.merchantOrderId) return undefined;
    let cancelled = false;
    let eventSource = null;
    let pollFallback = null;

    function startSSE() {
        eventSource = new EventSource(`/api/payment/stream/${qrData.merchantOrderId}`);
        eventSource.addEventListener('status', (e) => {
            if (cancelled) return;
            const data = JSON.parse(e.data);
            setPollingStatus((s) => ({ ...(s || {}), ...data }));
        });
        eventSource.addEventListener('paid', (e) => {
            if (cancelled) return;
            const data = JSON.parse(e.data);
            setPollingStatus({ status: 'SUCCESS', ...data });
        });
        eventSource.onerror = () => {
            if (cancelled) return;
            eventSource.close();
            startPollingFallback();
        };
    }

    function startPollingFallback() {
        if (pollingStatus?.status === 'SUCCESS') return;
        pollFallback = setTimeout(async () => {
            try {
                const res = await MafikingAPI.get(`/api/payment/status/${qrData.merchantOrderId}`);
                if (!cancelled) {
                    setPollingStatus(res);
                    if (res.status === 'PENDING') startPollingFallback();
                }
            } catch (err) {
                if (!cancelled) startPollingFallback();
            }
        }, 5000);
    }

    startSSE();
    return () => {
        cancelled = true;
        if (eventSource) eventSource.close();
        if (pollFallback) clearTimeout(pollFallback);
    };
}, [qrData?.merchantOrderId]);
```

### 9.5 Email Template

```js
// server/notifications/email-templates.js
function paymentSuccess({ user, payment }) {
    return {
        subject: 'Pembayaran Mafiking Berhasil',
        html: `<p>Halo ${user.display_name},</p>
<p>Pembayaran untuk <strong>${payment.product_details}</strong> telah berhasil.</p>
<p>Order ID: <code>${payment.merchant_order_id}</code></p>
<p>Nominal: Rp ${Number(payment.amount).toLocaleString('id-ID')}</p>
<p><a href="https://mafiking.com/tryout">Mulai Try Out →</a></p>`,
    };
}
```

### 9.6 Test Cases (`tests/payment/test-payment-broadcaster.js`)

1. Broadcaster: publish ke subscriber match merchantOrderId
2. Subscriber lain tidak terima event
3. Multiple subscriber untuk 1 order, semua dapat
4. `paid:any` listener dapat SEMUA event
5. SSE endpoint: send current status immediately
6. SSE endpoint: publish → SSE stream kirim event
7. SSE endpoint: connection close → unsubscribe
8. Email: markPaymentPaid → mailer.send dipanggil

## 10. PHASE E — Admin Dashboard Upgrade (Track 1)

### 10.1 Backend Endpoints

```js
// Ambiguous list
router.get('/ambiguous', (req, res) => { /* ... */ });

// Ambiguous resolve
router.post('/ambiguous/:mutationId/resolve', (req, res) => { /* ... */ });

// Bulk mark-paid
router.post('/bulk-mark-paid', adminBulkMarkPaidLimiter, (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0 || items.length > 50) return res.status(400).json({ error: 'items 1-50 required' });
    const results = [];
    const errors = [];
    for (const item of items) {
        try {
            const result = markPaymentPaid(req.app.locals.db, {
                merchantOrderId: item.merchantOrderId,
                fullAmount: item.fullAmount,
                source: 'admin_bulk',
                actorId: req.session.userId,
            });
            results.push({ merchantOrderId: item.merchantOrderId, ok: true, ...result });
        } catch (err) {
            errors.push({ merchantOrderId: item.merchantOrderId, error: err.message });
        }
    }
    res.json({ ok: true, results, errors });
});

// Resend email
router.post('/:merchantOrderId/resend-email', (req, res) => { /* ... */ });

// Metrics
router.get('/metrics', (req, res) => { /* ... */ });
```

### 10.2 Frontend UI

- **Ambiguous Tab** di admin payment dashboard
- **Bulk Actions** checkbox per row
- **Collector Health Widget** auto-refresh 30s

### 10.3 Test Cases (`tests/admin/test-admin-ambiguous-resolver.js`)

1. Ambiguous list: 5 unresolved, 2 resolved → return 5
2. Resolve ambiguous: choose orderId → queue resolved, PAID
3. Resolve to wrong order: audit log warning
4. Bulk mark-paid: 10 valid → all PAID
5. Bulk mark-paid: 3 valid, 2 not found → 3 PAID, 2 errors
6. Bulk rate limit: 6th call in 5min → 429
7. Resend email: status SUCCESS → mailer dipanggil
8. Metrics endpoint: returns last 24h stats

## 11. PHASE F — Observability & Rollback (Track 2)

### 11.1 Metrics Endpoint

```js
router.get('/metrics', (req, res) => {
    const db = req.app.locals.db;
    const last24h = "datetime('now', '-24 hours')";
    const result = {
        last24h: {
            auto_paid: db.prepare(`SELECT COUNT(*) c FROM payment_reconciliation_log WHERE action='mark_paid' AND source='auto_verify' AND created_at > ${last24h}`).get().c,
            manual_paid: db.prepare(`SELECT COUNT(*) c FROM payment_reconciliation_log WHERE action='mark_paid' AND source='admin' AND created_at > ${last24h}`).get().c,
            // ... dll
        },
        collector: {
            uptime: app.locals.collectorHeartbeat ? (Date.now() - app.locals.collectorHeartbeat.startedAt) / 1000 : null,
            lastSuccessAt: app.locals.collectorHeartbeat?.lastSuccessAt,
            // ... dll
        },
    };
    res.json(result);
});
```

### 11.2 Feature Flags

```js
// server/config/feature-flags.js
const flags = {
    SSE_PAYMENT_PUSH: process.env.SSE_PAYMENT_PUSH !== 'false',
    ADAPTIVE_POLLING: process.env.ADAPTIVE_POLLING !== 'false',
    BULK_ADMIN: process.env.BULK_ADMIN !== 'false',
    CONFIDENCE_MATCHING: process.env.CONFIDENCE_MATCHING !== 'false',
    SELF_HEALING_COLLECTOR: process.env.SELF_HEALING_COLLECTOR !== 'false',
    PAYMENT_SUCCESS_EMAIL: process.env.PAYMENT_SUCCESS_EMAIL !== 'false',
};

function isEnabled(flag) { return Boolean(flags[flag]); }
module.exports = { isEnabled, flags };
```

### 11.3 Test Cases (`tests/payment/test-feature-flags.js`)

1. Default flags: all ON
2. `SSE_PAYMENT_PUSH=false` env → flag is false
3. `isEnabled('BULK_ADMIN')` returns true
4. Unknown flag → throw or false (decide & test)

## 12. Test Matrix (Total ~50 test baru + 47 existing)

| Test Script | Phase | Cases |
|---|---|---|
| `test:cleanup-deps` | A | 5 |
| `test:self-healing-collector` | B | 10 |
| `test:confidence-matching` | C | 15 |
| `test:payment-broadcaster` | D | 8 |
| `test:admin-ambiguous-resolver` | E | 8 |
| `test:feature-flags` | F | 4 |
| **Test baru total** | | **50** |
| Existing tests (preserve) | — | 47 |
| **Total tests** | | **97** |

## 13. Final Validation

- `npm run check` exit 0
- Semua 50 test baru exit 0
- Semua 47 test existing exit 0 (zero regression)
- `npm run audit:baseline` tidak ada regression
- `npm run audit:supply-chain` masih clean
- Smoke test manual 10 langkah lulus
- `GET /api/admin/payments/metrics` menampilkan `collectorHealth.green = true`
- Email payment success terkirim dalam 5 detik
- SSE latency < 3 detik

## 14. Risiko & Mitigasi (Ringkas)

| Risiko | Prob | Impact | Mitigasi |
|---|---|---|---|
| `qris-mutasi` mati total | Medium | High | self-healing + alert, plan B: raw HTTP + cheerio |
| `merchant.qris.id` rate-limit | Low | High | adaptive polling + cookie reuse |
| SSE bocor (tab close) | Medium | Low | heartbeat 15s, max 1 conn/user |
| Email SMTP gagal | Low | Low | SSE primary, email best-effort |
| Confidence match salah | Low | Critical | threshold tinggi 180, admin resolver |
| Rollback cepat | Low | Medium | feature flag per-phase |

## 15. Out of Scope

1. ❌ Migrasi ke payment gateway resmi (Duitku/Midtrans) — owner sudah hapus
2. ❌ Native mobile push notification
3. ❌ Cryptocurrency
4. ❌ Multi-currency
5. ❌ Refund flow otomatis
6. ❌ KYC/AML
7. ❌ QRIS display nominal custom
8. ❌ Scheduled/drip payment
9. ❌ Affiliate/referral tracking
10. ❌ Multi-tenant

## 16. File Impact Summary

### File Baru (12)
- `server/payments/self-healing-collector.js`
- `server/payments/payment-broadcaster.js`
- `server/config/feature-flags.js`
- `lib/user-activity-tracker.js`
- `db/migrations/006_ambiguous_queue.sql`
- `tests/payment/test-cleanup-deps.js`
- `tests/payment/test-self-healing-collector.js`
- `tests/learning/test-confidence-matching.js`
- `tests/payment/test-payment-broadcaster.js`
- `tests/admin/test-admin-ambiguous-resolver.js`
- `tests/payment/test-feature-flags.js`
- `docs/plans/pay_self_healing_v3.md` (this file)

### File Diubah (12)
- `server.js`
- `server/routes/payment.js`
- `server/routes/admin-payments.js`
- `server/payments/payment-reconciler.js`
- `server/payments/mutation-matcher.js`
- `server/payments/mutation-collector.js`
- `server/payments/providers/QrisMutasiProvider.js`
- `server/notifications/email-templates.js`
- `src/payment.jsx`
- `src/admin.jsx`
- `src/generated-admin.jsx`
- `.env.example`
- `package.json`
- `docs/security/payment-runbook.md`

### File Dihapus (4)
- `lib/reconcilers/mutasiku.js`
- `docs/plans/auto-verification-collector-matching-engine.md` (setelah merge)
- `scripts/test-mutasiku-reconciler.js`
- `tests/payment/test-qris-payment-route.js` (jika test Duitku-only)

## 17. Effort Estimate (Revisi)

| Phase | Effort | Track | Dependencies |
|---|---|---|---|
| A. Cleanup | 4-6 jam | 1 | — |
| B. Self-healing | 8-12 jam | 2 | A |
| C. Smart matching | 8-12 jam | 2 | A |
| D. SSE + email | 8-10 jam | 1 | A |
| E. Admin UI | 10-14 jam | 1 | C, D |
| F. Observability | 4-6 jam | 2 | B, C, D, E |
| **Track 1 (A+D+E)** | **22-30 jam** | | |
| **Track 2 (B+C+F)** | **20-30 jam** | | |
| **Total parallel** | **22-30 jam** | | |
| **Real time** | **~3-4 hari kerja** | | |

## 18. Approval & Next Step

1. Tulis plan file ✓
2. Setup 2 git worktree dari `main` lokal
3. Eksekusi Track 1 paralel Track 2
4. Merge ke `main` setelah smoke test lulus
5. Update `docs/security/payment-runbook.md` (Phase F)
6. Update `README.md` + `ARCHITECTURE.md` jika ada perubahan setup
