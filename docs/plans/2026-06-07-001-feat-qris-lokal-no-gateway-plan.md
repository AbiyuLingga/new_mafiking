---
title: "feat: Pembayaran QRIS Lokal (Static→Dynamic) Tanpa Payment Gateway Pihak Ketiga"
status: planned
plan_depth: Deep
created: 2026-06-07
origin: User request — generate dynamic QRIS dari QRIS statis pribadi agar tidak perlu daftar payment gateway (Duitku/Midtrans/dst) dengan KYC dan proses approval. Menggunakan multi-channel reconciliation (admin manual + webhook + SMS listener + Mutasiku polling).
---

# feat: Pembayaran QRIS Lokal (Static→Dynamic) Tanpa Payment Gateway Pihak Ketiga

## Problem Frame

Mafiking saat ini menggunakan **Duitku** sebagai payment gateway di `routes/payment.js`. Untuk aktivasi Duitku production perlu:
1. Pendaftaran merchant + KYC bisnis.
2. Proses review BI-compliant (butuh waktu hari-minggu).
3. Konfigurasi callback URL & whitelisting IP server.
4. Biaya MDR per transaksi (0.7%–2.5% tergantung metode).

Owner memiliki **QRIS statis pribadi** (mis. dari GoPay Merchant, DANA Bisnis, atau Blu) yang sudah aktif. Kita bisa:
- Mengonversi QRIS statis → dinamis secara lokal di server (manipulasi string EMVCo TLV) → tidak butuh API payment provider.
- Membangun **multi-channel reconciliation** untuk mendeteksi pembayaran masuk (admin manual + webhook endpoint + SMS listener + Mutasiku polling) agar vendor lock-in nol dan biaya MDR nol.

### Yang Sudah Diketahui Owner (Riset Awal)

1. QRIS di Indonesia mengikuti standar EMVCo TLV (Tag-Length-Value).
2. Tiga Tag yang wajib dimodifikasi:
   - `01` (Point of Initiation): `11` (static) → `12` (dynamic).
   - `54` (Transaction Amount): nominal dalam string numerik.
   - `63` (CRC-16): checksum 4 hex char yang harus dihitung ulang.
3. Library open-source yang tersedia di npm untuk generator.
4. Sistem rekonsiliasi yang umum:
   - **Mutasiku API** (third-party, polling mutasi e-wallet).
   - **Android Notification Listener** (HP kasir listener notifikasi → POST webhook).

### Blindspot yang Saya Temukan di Riset Owner

1. **Rekonsiliasi adalah masalah sebenarnya, bukan generate QR-nya.** Generate QR itu 10 baris kode; yang sulit adalah "bagaimana server tau customer sudah bayar?". Opsi yang disebutkan owner lemah:
   - Mutasiku → third-party + biaya + delay polling.
   - Android listener → butuh HP 24/7, single point of failure.
2. **Unique Suffix pool management belum ditangani.** Suffix 3 digit butuh:
   - Alokasi atomik (no collision).
   - Lock saat order pending.
   - Release saat paid/expired.
   - Concurrency-safe (race condition antara concurrent `create` calls).
3. **Belum ada timeout/auto-expire strategy.** Order pending di-hold berapa lama? Apa yang terjadi jika customer lupa bayar 3 jam lalu bayar dengan nominal+suffix yang sama?
4. **Belum ada audit trail untuk rekonsiliasi multi-channel.** Jika dana masuk dari 4 channel berbeda, tanpa audit log kita tidak bisa jawab "siapa yang mark paid, kapan, via apa".
5. **Library `qrishook` / `qris-eventhub` untuk Android listener** sebetulnya adalah **HTTP client** — dia mengirim POST ke endpoint kita. Artinya dia TIDAK butuh hardware berbeda dari channel webhook lainnya. Yang berbeda hanya **siapa yang trigger**-nya.

### Batasan & Konteks Penting (dari AGENTS.md & `package.json`)

- `"type": "commonjs"` → library harus bisa di-`require()`.
- VPS 957 MB → hindari native dependencies (F-11: `sharp` sudah di-block).
- `better-sqlite3` sudah ter-install (synchronous, cepat, low-memory).
- Express 5, helmet, CSRF protection, rate limiter, audit log sudah ada.
- `qrcode` (1.5+) adalah dependency rendering yang ringan & pure JS.
- Frontend pakai React UMD + Babel runtime — tidak ada module bundler.
- `routes/payment.js` saat ini handle Duitku flow + mock mode. Kita **keep** Duitku sebagai fallback opt-in via env.
- Existing payment table schema di `db/schema.sql` lines 109-122: `payments` table dengan `merchant_order_id`, `amount`, `status` enum (`PENDING|SUCCESS|FAILED`).

---

## Locked Decisions (Final)

| Aspek | Keputusan | Alasan |
|-------|-----------|--------|
| **Library QRIS** | `@prasetya/qris` v0.2.1 + `qrcode` v1.5.4 | Zero deps, dual ESM/CJS, MIT, fresh 21 hari. `qrcode` 2.4jt weekly DL, standar industri. |
| **Reconciliation channels** | 4 channel aktif (Admin + Webhook + SMS + Mutasiku) | Pluggable architecture, masing-masing jadi fallback. |
| **Duitku** | Keep sebagai fallback opt-in via `PAYMENT_PROVIDER` env | Tidak hapus code, tidak ada regresi, A/B test-friendly. |
| **Volume** | 20-100 transaksi/hari | Suffix pool 1-999 cukup, expiry 15-20 menit, polling wajib. |
| **Rollout** | Feature flag via env `PAYMENT_PROVIDER` | Default `qris`, bisa switch ke `duitku` kapan saja. |
| **Testing strategy** | Round-trip script + scan dengan HP asli (GoPay/DANA/OVO) | Wajib lulus sebelum lanjut implementasi. |
| **Suffix pool** | 1-999 (3 digit, configurable via env) | Cukup untuk 20-100/hari, collision-safe dengan `BEGIN IMMEDIATE` transaction. |
| **Expiry** | 15-20 menit (configurable) | Balance antara customer experience & pool availability. |

---

## Arsitektur (Multi-Channel Reconciliation)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (payment.jsx)                       │
│  - Pilih paket → klik "Bayar" → tetap di halaman               │
│  - Lihat QR Code + nominal + countdown timer                   │
│  - Polling status setiap 5 detik                               │
│  - Tombol "Konfirmasi via WhatsApp" jika timeout               │
└─────────────────────┬───────────────────────────────────────────┘
                      │ POST /api/payment/create
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND (routes/payment.js + lib/qris-dynamic.js)  │
│  - Generate suffix unik (1-999) dari pool                      │
│  - Modify Tag 01: "11" → "12"                                   │
│  - Inject Tag 54: base+suffix                                  │
│  - Hitung CRC-16 CCITT baru                                    │
│  - Generate QR PNG via `qrcode` npm                             │
│  - Simpan ke `payments` dengan `expires_at = NOW() + 20 min`    │
│  - Lock suffix di `qris_suffix_locks` table                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Dynamic QR string + image DataURL
                      ▼
        ┌─────────────────────────────────────────┐
        │  Customer scan via GoPay/DANA/OVO/etc   │
        │  Bayar nominal (base + suffix)           │
        └─────────────────┬───────────────────────┘
                          │
                          ▼ (dana masuk ke e-wallet owner)
        ┌─────────────────────────────────────────┐
        │   CHANNEL REKONSILIASI (4 channel):     │
        │                                           │
        │   [1] ADMIN PANEL — manual mark as paid  │ ← paling reliable
        │   [2] WEBHOOK ENDPOINT — HTTP POST       │ ← untuk script/SaaS
        │   [3] SMS LISTENER — qris-eventhub/HTTP   │ ← HP kasir Android
        │   [4] MUTASIKU POLLING — SaaS mutasi     │ ← opsional, paid
        └─────────────────┬───────────────────────┘
                          │ POST /api/payment/reconcile/* atau admin endpoint
                          ▼
        ┌─────────────────────────────────────────┐
        │   STATUS UPDATE                          │
        │   payments.status = 'SUCCESS'            │
        │   paid_at = NOW()                        │
        │   reconciled_via = 'admin'/'webhook'/..  │
        │   suffix_locks.released_at = NOW()       │
        │   → trigger user_access_grants           │
        └─────────────────────────────────────────┘
```

**Kenapa hybrid bukan single-channel?**
- Admin cuti? Webhook dari Mutasiku/email-forwarder covers it.
- HP kasir rusak? Admin panel bisa input manual.
- Mutasiku delay? Customer lapor ke WA admin → admin cek mutasi di HP → mark paid di panel.
- Tidak ada single point of failure.

---

## Detailed Implementation Plan (10 Phases)

### Phase 1: Library Install + Round-Trip Test (Foundation)

**File: `scripts/test-qris-roundtrip.js` (NEW)**

- `npm install @prasetya/qris qrcode`
- Buat script standalone yang:
  1. Ambil `QRIS_STATIC_STRING` dari env
  2. Validate pakai `validateQRIS()`
  3. Convert ke dynamic dengan nominal 25000 + suffix 12 → 25012
  4. Parse hasil, verifikasi Tag 01="12", Tag 54="25012", CRC valid
  5. Render PNG via `qrcode.toDataURL()`
  6. Save PNG ke `/tmp/qris-test.png` untuk di-scan HP
  7. Verifikasi ulang dengan `validateQRIS()` pada hasil

**WAJIB sebelum lanjut**:
- Scan hasil PNG dengan HP asli (GoPay/DANA/OVO)
- Nominal `Rp 25.012` HARUS muncul di app e-wallet
- CRC HARUS valid (e-wallet reject jika tidak)
- Library `validateQRIS()` di-panggil sebagai pre-flight check

**Jika gagal**:
- Cek Tag 26 tidak ter-corrupt (merchant account info utuh)
- Cek Tag 59 tidak ter-modifikasi (merchant name utuh)
- Cek panjang string konsisten
- Pertimbangkan pindah ke library alternatif

### Phase 2: Database Migration

**File: `db/migrations/002_qris_local.sql` (NEW)**

```sql
-- Tambah kolom ke payments untuk QRIS lokal
ALTER TABLE payments ADD COLUMN qris_base_amount INTEGER;
ALTER TABLE payments ADD COLUMN qris_suffix INTEGER;
ALTER TABLE payments ADD COLUMN qris_full_amount INTEGER;
ALTER TABLE payments ADD COLUMN qris_dynamic_string TEXT;
ALTER TABLE payments ADD COLUMN qris_image_data_url TEXT;
ALTER TABLE payments ADD COLUMN expires_at DATETIME;
ALTER TABLE payments ADD COLUMN paid_at DATETIME;
ALTER TABLE payments ADD COLUMN reconciled_via TEXT;
ALTER TABLE payments ADD COLUMN reconciled_by INTEGER REFERENCES users(id);
ALTER TABLE payments ADD COLUMN webhook_secret_hash TEXT;

-- Tabel suffix lock management
CREATE TABLE IF NOT EXISTS qris_suffix_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_amount INTEGER NOT NULL,
    suffix INTEGER NOT NULL,
    merchant_order_id TEXT UNIQUE NOT NULL,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    released_at DATETIME
);

CREATE INDEX idx_suffix_locks_active
    ON qris_suffix_locks(base_amount, suffix)
    WHERE released_at IS NULL;

-- Audit log untuk reconciliation
CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_order_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- 'mark_paid', 'mark_failed', 'auto_expire', 'webhook_received'
    actor_id INTEGER REFERENCES users(id),
    source TEXT NOT NULL,  -- 'admin', 'webhook', 'sms', 'mutasiku', 'sweeper'
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recon_log_order ON payment_reconciliation_log(merchant_order_id, created_at DESC);
```

**File: `db/schema.sql` (MODIFY)**

Append blok migration di atas ke `db/schema.sql` agar fresh install include columns baru.

**Validasi**:
- `node --check` schema syntax
- Smoke: `sqlite3 db/database.sqlite ".schema payments"` → kolom baru muncul

### Phase 3: QRIS Dynamic Adapter

**File: `lib/qris-dynamic.js` (NEW)**

```js
const { convertQRIS, parseQRIS, validateQRIS } = require('@prasetya/qris');
const QRCode = require('qrcode');

function assertValidStaticQris(staticString) {
  const result = validateQRIS(staticString);
  if (!result.valid) {
    const error = new Error(`Invalid QRIS static string: ${result.errors.join('; ')}`);
    error.code = 'INVALID_STATIC_QRIS';
    throw error;
  }
}

async function generateDynamicQRIS({ staticString, baseAmount, suffix }) {
  assertValidStaticQris(staticString);

  const fullAmount = Number(baseAmount) + Number(suffix);
  const dynamicString = convertQRIS(staticString, { amount: fullAmount });

  // Verify output (defense in depth)
  const revalidated = validateQRIS(dynamicString);
  if (!revalidated.valid) {
    const error = new Error(`Generated QRIS failed validation: ${revalidated.errors.join('; ')}`);
    error.code = 'INVALID_DYNAMIC_QRIS';
    throw error;
  }

  // Render PNG
  const dataUrl = await QRCode.toDataURL(dynamicString, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
  });

  return {
    dynamicString,
    fullAmount,
    baseAmount: Number(baseAmount),
    suffix: Number(suffix),
    dataUrl,
  };
}

function parseDynamicString(dynamicString) {
  return parseQRIS(dynamicString);
}

module.exports = {
  generateDynamicQRIS,
  parseDynamicString,
  assertValidStaticQris,
  validateQRIS,
};
```

**Catatan implementasi**:
- `assertValidStaticQris` dipanggil di `server.js` startup, fail-fast jika `QRIS_STATIC_STRING` di env korup.
- `generateDynamicQRIS` async karena `qrcode.toDataURL` adalah async.
- Double-validate (pre + post) untuk catch library bugs.

### Phase 4: Suffix Pool Allocator

**File: `lib/qris-suffix-pool.js` (NEW)**

```js
const SUFFIX_MIN = parseInt(process.env.QRIS_SUFFIX_MIN || '1', 10);
const SUFFIX_MAX = parseInt(process.env.QRIS_SUFFIX_MAX || '999', 10);

class SuffixPoolExhaustedError extends Error {
  constructor(baseAmount) {
    super(`Suffix pool exhausted for base amount ${baseAmount} (range ${SUFFIX_MIN}-${SUFFIX_MAX})`);
    this.code = 'SUFFIX_POOL_EXHAUSTED';
  }
}

function allocateSuffix({ db, baseAmount, merchantOrderId, ttlSeconds }) {
  return db.transaction(() => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Cari suffix yang available
    const taken = db.prepare(`
      SELECT suffix FROM qris_suffix_locks
      WHERE base_amount = ?
        AND released_at IS NULL
        AND expires_at > ?
    `).all(baseAmount, now.toISOString());

    const takenSet = new Set(taken.map((r) => r.suffix));

    for (let s = SUFFIX_MIN; s <= SUFFIX_MAX; s++) {
      if (!takenSet.has(s)) {
        db.prepare(`
          INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(baseAmount, s, merchantOrderId, expiresAt.toISOString());
        return s;
      }
    }
    throw new SuffixPoolExhaustedError(baseAmount);
  })();
}

function releaseSuffix({ db, merchantOrderId }) {
  return db.prepare(`
    UPDATE qris_suffix_locks
    SET released_at = CURRENT_TIMESTAMP
    WHERE merchant_order_id = ? AND released_at IS NULL
  `).run(merchantOrderId);
}

function releaseExpiredSuffixes({ db }) {
  return db.prepare(`
    UPDATE qris_suffix_locks
    SET released_at = CURRENT_TIMESTAMP
    WHERE released_at IS NULL AND expires_at < CURRENT_TIMESTAMP
  `).run();
}

module.exports = {
  allocateSuffix,
  releaseSuffix,
  releaseExpiredSuffixes,
  SuffixPoolExhaustedError,
};
```

**Catatan**:
- Pakai `db.transaction(() => ...)` (synchronous) dari `better-sqlite3` = atomic, no race.
- `expires_at` set pada lock → suffix otomatis "available" setelah expire (query filter `expires_at > NOW`).
- Tidak perlu UNIQUE constraint pada `(base_amount, suffix, released_at IS NULL)` — filter di query cukup untuk atomicy.

### Phase 5: Refactor `routes/payment.js`

**Tambah provider routing di top file:**

```js
const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'qris'; // 'qris' | 'duitku' | 'both'
const QRIS_CONFIG = {
  staticString: process.env.QRIS_STATIC_STRING,
  merchantName: process.env.QRIS_MERCHANT_NAME || 'MAFIKING',
  expiryMinutes: parseInt(process.env.QRIS_EXPIRY_MINUTES || '20', 10),
  adminWhatsapp: process.env.QRIS_ADMIN_WHATSAPP,
};

const { generateDynamicQRIS, assertValidStaticQris } = require('../lib/qris-dynamic');
const { allocateSuffix, releaseSuffix, SuffixPoolExhaustedError } = require('../lib/qris-suffix-pool');
const { markPaymentPaid, markPaymentFailed } = require('../lib/payment-reconciler');
```

**Validate static QRIS saat startup:**
```js
if (PAYMENT_PROVIDER === 'qris' || PAYMENT_PROVIDER === 'both') {
  if (!QRIS_CONFIG.staticString) {
    console.error('PAYMENT_PROVIDER=qris requires QRIS_STATIC_STRING env var');
    process.exit(1);
  }
  try {
    assertValidStaticQris(QRIS_CONFIG.staticString);
    console.log('[payment] QRIS static string validated');
  } catch (err) {
    console.error('[payment] Invalid QRIS_STATIC_STRING:', err.message);
    process.exit(1);
  }
}
```

**Modifikasi `POST /api/payment/create`:**

Existing logic (validate user, resolve item) tetap sama. Tambah branching:

```js
if (PAYMENT_PROVIDER === 'duitku') {
  return handleDuitkuCreate(req, res, item, merchantOrderId);
}

if (PAYMENT_PROVIDER === 'qris' || PAYMENT_PROVIDER === 'both') {
  return handleQrisCreate(req, res, item, merchantOrderId);
}
```

**`handleQrisCreate` baru:**

```js
async function handleQrisCreate(req, res, item, merchantOrderId) {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { email, name } = req.body;

  // Validate
  if (!email || !name) return res.status(400).json({ error: 'email dan name diperlukan' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return res.status(400).json({ error: 'Email pembelian tidak valid' });
  }

  const baseAmount = item.amount;
  const buyerEmail = String(email).trim().substring(0, 255);
  const buyerName = String(name).trim().substring(0, 50);

  // Allocate suffix
  let suffix;
  try {
    suffix = allocateSuffix({
      db,
      baseAmount,
      merchantOrderId,
      ttlSeconds: QRIS_CONFIG.expiryMinutes * 60,
    });
  } catch (err) {
    if (err instanceof SuffixPoolExhaustedError) {
      return res.status(503).json({
        error: 'Slot pembayaran sementara penuh. Coba lagi dalam beberapa menit.',
      });
    }
    throw err;
  }

  // Generate dynamic QR
  let qrResult;
  try {
    qrResult = await generateDynamicQRIS({
      staticString: QRIS_CONFIG.staticString,
      baseAmount,
      suffix,
    });
  } catch (err) {
    releaseSuffix({ db, merchantOrderId });
    return res.status(500).json({ error: 'Gagal generate QR. Hubungi admin.' });
  }

  const expiresAt = new Date(Date.now() + QRIS_CONFIG.expiryMinutes * 60 * 1000);

  // Insert payment row
  db.prepare(`
    INSERT INTO payments (
      user_id, merchant_order_id, amount, product_details, email,
      qris_base_amount, qris_suffix, qris_full_amount,
      qris_dynamic_string, qris_image_data_url,
      status, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(
    userId, merchantOrderId, qrResult.fullAmount, item.productDetails, buyerEmail,
    baseAmount, suffix, qrResult.fullAmount,
    qrResult.dynamicString, qrResult.dataUrl,
    expiresAt.toISOString()
  );

  res.json({
    merchantOrderId,
    provider: 'qris',
    baseAmount,
    suffix,
    fullAmount: qrResult.fullAmount,
    qrImageDataUrl: qrResult.dataUrl,
    qrString: qrResult.dynamicString,
    expiresAt: expiresAt.toISOString(),
    adminWhatsapp: QRIS_CONFIG.adminWhatsapp,
  });
}
```

**Modifikasi `GET /api/payment/status/:merchantOrderId`:**

Tambah field QRIS ke response agar frontend bisa re-render jika user refresh.

```js
res.json({
  status: payment.status,
  merchantOrderId: payment.merchant_order_id,
  amount: payment.amount,
  baseAmount: payment.qris_base_amount,
  suffix: payment.qris_suffix,
  fullAmount: payment.qris_full_amount,
  productDetails: payment.product_details,
  expiresAt: payment.expires_at,
  paidAt: payment.paid_at,
  reconciledVia: payment.reconciled_via,
  qrImageDataUrl: payment.qris_image_data_url,
  createdAt: payment.created_at,
  updatedAt: payment.updated_at,
});
```

**Tambah endpoint baru:**

- `POST /api/payment/reconcile/webhook` — public, HMAC-signed, idempotent
- `GET /api/payment/qris/config` — public, return `{ active, adminWhatsapp, expiryMinutes, merchantName }`
- `POST /api/payment/reconcile/mark-expired` — internal, dipanggil sweeper (tidak perlu public)

### Phase 6: Multi-Channel Reconciler

**File: `lib/payment-reconciler.js` (NEW)**

```js
const crypto = require('crypto');

function logReconciliation(db, { merchantOrderId, action, actorId, source, details }) {
  db.prepare(`
    INSERT INTO payment_reconciliation_log (merchant_order_id, action, actor_id, source, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(merchantOrderId, action, actorId, source, JSON.stringify(details || {}));
}

function markPaymentPaid(db, { merchantOrderId, fullAmount, source, actorId, rawDetails }) {
  return db.transaction(() => {
    const payment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ?').get(merchantOrderId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'SUCCESS') return { alreadyPaid: true };
    if (payment.status === 'EXPIRED') throw new Error('Order expired');
    if (fullAmount && payment.qris_full_amount && Number(fullAmount) !== payment.qris_full_amount) {
      throw new Error(`Amount mismatch: expected ${payment.qris_full_amount}, got ${fullAmount}`);
    }

    db.prepare(`
      UPDATE payments
      SET status = 'SUCCESS', paid_at = CURRENT_TIMESTAMP,
          reconciled_via = ?, reconciled_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(source, actorId, payment.id);

    db.prepare(`
      UPDATE qris_suffix_locks
      SET released_at = CURRENT_TIMESTAMP
      WHERE merchant_order_id = ? AND released_at IS NULL
    `).run(merchantOrderId);

    logReconciliation(db, {
      merchantOrderId, action: 'mark_paid', actorId, source, details: rawDetails,
    });

    return { success: true, payment };
  })();
}

function markPaymentFailed(db, { merchantOrderId, source, actorId, reason }) {
  return db.transaction(() => {
    const payment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ?').get(merchantOrderId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
      return { alreadyTerminal: true };
    }
    db.prepare(`
      UPDATE payments
      SET status = 'FAILED', reconciled_via = ?, reconciled_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(source, actorId, payment.id);

    db.prepare(`
      UPDATE qris_suffix_locks
      SET released_at = CURRENT_TIMESTAMP
      WHERE merchant_order_id = ? AND released_at IS NULL
    `).run(merchantOrderId);

    logReconciliation(db, {
      merchantOrderId, action: 'mark_failed', actorId, source, details: { reason },
    });
  })();
}

function verifyWebhookSignature(secret, body, signature, timestampToleranceSec = 300) {
  if (!signature || !body.timestamp) return false;
  const ts = Number(body.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > timestampToleranceSec) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${body.merchantOrderId}:${body.fullAmount}:${body.timestamp}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

function signWebhookPayload(secret, { merchantOrderId, fullAmount }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${merchantOrderId}:${fullAmount}:${timestamp}`)
    .digest('hex');
  return { signature, timestamp };
}

module.exports = {
  markPaymentPaid,
  markPaymentFailed,
  logReconciliation,
  verifyWebhookSignature,
  signWebhookPayload,
};
```

**File: `lib/reconcilers/admin-manual.js` (NEW)**

Channel 1 — admin klik tombol di panel:

```js
// Digunakan di routes/admin-payments.js
function handleAdminMarkPaid(req, res) {
  const db = req.app.locals.db;
  const { merchantOrderId } = req.params;
  const { fullAmount, note } = req.body;
  const actorId = req.session.userId;

  try {
    const result = markPaymentPaid(db, {
      merchantOrderId,
      fullAmount: fullAmount ? Number(fullAmount) : null,
      source: 'admin',
      actorId,
      rawDetails: { note },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
```

**File: `lib/reconcilers/webhook.js` (NEW)**

Channel 2 — HTTP POST dari external service:

```js
const express = require('express');
const { markPaymentPaid, verifyWebhookSignature } = require('../payment-reconciler');
const router = express.Router();

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('PAYMENT_WEBHOOK_SECRET not set; webhook reconcile disabled');
}

router.post('/webhook', express.json(), (req, res) => {
  if (!WEBHOOK_SECRET) return res.status(503).json({ error: 'webhook disabled' });

  const { signature, timestamp, merchantOrderId, fullAmount, source } = req.body;
  if (!verifyWebhookSignature(WEBHOOK_SECRET, { merchantOrderId, fullAmount, timestamp }, signature)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const db = req.app.locals.db;
  try {
    const result = markPaymentPaid(db, {
      merchantOrderId, fullAmount: Number(fullAmount),
      source: source || 'webhook', actorId: null,
      rawDetails: { ip: req.ip, userAgent: req.get('user-agent') },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
```

**File: `lib/reconcilers/mutasiku.js` (NEW)**

Channel 4 — polling SaaS mutasi (optional):

```js
const MUTASIKU_CONFIG = {
  apiKey: process.env.MUTASIKU_API_KEY,
  accountId: process.env.MUTASIKU_ACCOUNT_ID,
  pollInterval: parseInt(process.env.MUTASIKU_POLL_INTERVAL || '60000', 10),
};

let lastSeenTimestamp = null;

async function pollMutasiku(db) {
  if (!MUTASIKU_CONFIG.apiKey || !MUTASIKU_CONFIG.accountId) return;

  // Implementation depends on Mutasiku API contract
  // Pseudocode:
  // 1. GET /api/v1/mutations?account_id=X&since=lastSeenTimestamp
  // 2. Filter: amount matches any pending payment.qris_full_amount
  // 3. For each match, call markPaymentPaid(..., { source: 'mutasiku' })
  // 4. Update lastSeenTimestamp
}

function startMutasikuPoller(db) {
  if (!MUTASIKU_CONFIG.apiKey) return;
  setInterval(() => pollMutasiku(db).catch(console.error), MUTASIKU_CONFIG.pollInterval);
  console.log(`[mutasiku] poller started (interval ${MUTASIKU_CONFIG.pollInterval}ms)`);
}

module.exports = { startMutasikuPoller };
```

**File: `lib/reconcilers/sms-listener.js` (NEW) — Dokumentasi Only**

Channel 3 — Android listener. **TIDAK ada runtime code**. Hanya dokumentasi setup:

```md
# SMS Listener Setup (qris-eventhub)

1. Install qris-eventhub di HP kasir Android:
   - https://github.com/.../qris-eventhub
   - Login dengan akun e-wallet merchant owner

2. Configure webhook:
   - Webhook URL: https://mafiking.com/api/payment/reconcile/webhook
   - HMAC secret: copy dari .env PAYMENT_WEBHOOK_SECRET
   - Trigger: any incoming payment notification

3. Test:
   - Kirim payment test ke e-wallet
   - Verify qris-eventhub fires POST ke webhook
   - Verify signature valid (timestamp dalam 5 menit)
   - Verify payment status berubah ke SUCCESS
```

### Phase 7: Expiry Sweeper

**File: `lib/payment-expiry-sweeper.js` (NEW)**

```js
function sweepExpiredPayments(db) {
  const now = new Date().toISOString();

  const expired = db.transaction(() => {
    const result = db.prepare(`
      UPDATE payments
      SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PENDING' AND expires_at < ?
    `).run(now);

    db.prepare(`
      UPDATE qris_suffix_locks
      SET released_at = CURRENT_TIMESTAMP
      WHERE released_at IS NULL
        AND merchant_order_id IN (
          SELECT merchant_order_id FROM payments
          WHERE status = 'EXPIRED' AND updated_at >= ?
        )
    `).run(now);

    return result.changes;
  })();

  if (expired > 0) {
    console.log(`[sweeper] expired ${expired} payments`);
  }
  return expired;
}

function startExpirySweeper(db, intervalMs = 60000) {
  setInterval(() => {
    try {
      sweepExpiredPayments(db);
    } catch (err) {
      console.error('[sweeper] error:', err);
    }
  }, intervalMs);
  console.log(`[sweeper] started (interval ${intervalMs}ms)`);
}

module.exports = { sweepExpiredPayments, startExpirySweeper };
```

**Wire ke `server.js`:**
```js
const { startExpirySweeper } = require('./lib/payment-expiry-sweeper');
const { startMutasikuPoller } = require('./lib/reconcilers/mutasiku');

// ... after db initialized ...
if (PAYMENT_PROVIDER === 'qris' || PAYMENT_PROVIDER === 'both') {
  startExpirySweeper(db);
  startMutasikuPoller(db);
}
```

### Phase 8: Admin Endpoints

**File: `routes/admin-payments.js` (NEW)**

```js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { isAdmin } = require('../middleware/admin');
const { markPaymentPaid, markPaymentFailed } = require('../lib/payment-reconciler');
const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(isAdmin, adminLimiter);

// GET pending payments
router.get('/pending', (req, res) => {
  const db = req.app.locals.db;
  const payments = db.prepare(`
    SELECT
      p.id, p.merchant_order_id, p.amount, p.qris_base_amount, p.qris_suffix,
      p.qris_full_amount, p.product_details, p.email, p.expires_at, p.created_at,
      u.display_name, u.username
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'PENDING' AND p.expires_at > CURRENT_TIMESTAMP
    ORDER BY p.created_at DESC
    LIMIT 100
  `).all();
  res.json(payments);
});

// GET all payments with filter
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { status, q, limit = 50 } = req.query;
  let sql = `
    SELECT
      p.id, p.merchant_order_id, p.amount, p.qris_base_amount, p.qris_suffix,
      p.qris_full_amount, p.product_details, p.email, p.status, p.expires_at,
      p.paid_at, p.reconciled_via, p.created_at, p.updated_at,
      u.display_name, u.username
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  if (q) { sql += ' AND (p.merchant_order_id LIKE ? OR p.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 50, 200));

  res.json(db.prepare(sql).all(...params));
});

// POST mark-paid
router.post('/:merchantOrderId/mark-paid', (req, res) => {
  const db = req.app.locals.db;
  const { merchantOrderId } = req.params;
  const { fullAmount, note } = req.body;
  const actorId = req.session.userId;
  try {
    const result = markPaymentPaid(db, {
      merchantOrderId, fullAmount: fullAmount ? Number(fullAmount) : null,
      source: 'admin', actorId, rawDetails: { note },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST mark-failed
router.post('/:merchantOrderId/mark-failed', (req, res) => {
  const db = req.app.locals.db;
  const { merchantOrderId } = req.params;
  const { reason } = req.body;
  const actorId = req.session.userId;
  try {
    const result = markPaymentFailed(db, {
      merchantOrderId, reason, source: 'admin', actorId,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET audit log for one order
router.get('/:merchantOrderId/audit-log', (req, res) => {
  const db = req.app.locals.db;
  const { merchantOrderId } = req.params;
  const logs = db.prepare(`
    SELECT id, action, actor_id, source, details, created_at
    FROM payment_reconciliation_log
    WHERE merchant_order_id = ?
    ORDER BY created_at DESC
  `).all(merchantOrderId);
  res.json(logs);
});

module.exports = router;
```

**Wire ke `server.js`:**
```js
app.use('/api/admin/payments', require('./routes/admin-payments'));
```

### Phase 9: Frontend `src/payment.jsx` Rewrite

**File: `src/payment.jsx` (MODIFY)**

Hapus logic `window.location.href = res.paymentUrl` (kecuali `both` mode). Tambah flow QR display:

```jsx
const Payment = ({ setRoute, currentUser, context }) => {
  const { useState, useEffect, useMemo, useRef } = React;
  // ... existing state ...

  const [qrData, setQrData] = useState(null); // {qrImageDataUrl, fullAmount, suffix, expiresAt, ...}
  const [countdown, setCountdown] = useState(0);
  const [pollingStatus, setPollingStatus] = useState(null);

  // Existing config fetch...
  useEffect(() => {
    MafikingAPI.get("/api/payment/config")
      .then((config) => setGatewayConfig(config))
      .catch(...);
  }, []);

  async function handleBeli() {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const res = await MafikingAPI.post("/api/payment/create", payload);
      if (res.qrImageDataUrl) {
        // QRIS path — show QR inline
        setQrData(res);
        startCountdown(res.expiresAt);
        startPolling(res.merchantOrderId);
      } else if (res.paymentUrl) {
        // Duitku path — redirect
        window.location.href = res.paymentUrl;
      } else {
        setErrors({ form: "Server belum mengirim QR / payment URL." });
      }
    } catch (err) {
      setErrors({ form: err.message || "Gagal membuat pembayaran." });
    } finally {
      setLoading(false);
    }
  }

  function startCountdown(expiresAt) {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining > 0) setTimeout(tick, 1000);
    };
    tick();
  }

  function startPolling(merchantOrderId) {
    // existing PaymentStatus polling logic, but inline
    let attempts = 0;
    const poll = () => {
      MafikingAPI.get(`/api/payment/status/${merchantOrderId}`)
        .then((res) => {
          setPollingStatus(res);
          if (res.status === "SUCCESS") {
            // success state
          } else if (res.status === "PENDING" && attempts < 12) {
            attempts++;
            setTimeout(poll, 5000);
          } else {
            // timeout/error state
          }
        });
    };
    poll();
  }

  if (qrData) {
    return <PaymentQrisView qrData={qrData} countdown={countdown} status={pollingStatus} ... />;
  }

  return /* existing form */;
};

const PaymentQrisView = ({ qrData, countdown, status, adminWhatsapp, onCancel }) => {
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const expired = countdown === 0;

  const waMessage = encodeURIComponent(
    `Halo admin Mafiking, saya sudah bayar pesanan ${qrData.merchantOrderId} sebesar Rp ${qrData.fullAmount.toLocaleString("id-ID")} tapi status masih pending. Mohon dicek.`
  );

  return (
    <div className="bg-paper min-h-screen pb-28 md:pb-0">
      <section>
        <div className="max-w-md mx-auto px-6 md:px-8 pt-12 pb-20">
          <button className="mafiking-back-button mb-8" onClick={onCancel}>
            <Icon.ChevL className="w-4 h-4" /> Kembali
          </button>

          <div className="text-center mb-6">
            <div className="kicker mb-2">Selesaikan Pembayaran</div>
            <h1 className="font-display font-bold text-2xl mb-2">Scan QR di bawah ini</h1>
            <p className="text-sm text-ink/60">
              Buka aplikasi e-wallet (GoPay, DANA, OVO, ShopeePay, mobile banking) dan scan.
            </p>
          </div>

          <div className="card pad-d bg-white border hairline rounded-3xl p-6 mb-6">
            <div className="bg-white p-4 rounded-2xl flex items-center justify-center">
              <img src={qrData.qrImageDataUrl} alt="QRIS Dynamic" className="w-full max-w-xs" />
            </div>

            <div className="mt-6 text-center">
              <div className="text-xs text-ink/50 mb-1">Total Bayar</div>
              <div className="font-display font-bold text-3xl tnum text-ink">
                Rp {qrData.fullAmount.toLocaleString("id-ID")}
              </div>
              <div className="text-xs text-ink/50 mt-2">
                (paket Rp {qrData.baseAmount.toLocaleString("id-ID")} + kode unik {qrData.suffix})
              </div>
            </div>

            {!expired && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <Icon.Clock className="w-4 h-4 text-ink/50" />
                <span className="text-ink/70">
                  Bayar dalam <strong className="tnum">{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong>
                </span>
              </div>
            )}

            {expired && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm text-center">
                QR sudah kadaluarsa. Silakan buat pesanan baru.
              </div>
            )}
          </div>

          <div className="card pad-d bg-white border hairline rounded-3xl p-6 mb-6">
            <h3 className="font-display font-bold text-base mb-3">Detail Pesanan</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-ink/55">Order ID</span>
                <span className="font-mono text-xs">{qrData.merchantOrderId}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-ink/55">Status</span>
                <span>{status?.status || "PENDING"}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 mb-6">
            <button
              className="btn-ghost w-full justify-center"
              onClick={() => navigator.clipboard.writeText(qrData.fullAmount.toString())}
            >
              <Icon.Copy className="w-4 h-4" /> Salin Nominal
            </button>
            {adminWhatsapp && (
              <a
                href={`https://wa.me/${adminWhatsapp}?text=${waMessage}`}
                target="_blank"
                rel="noopener"
                className="btn-ghost w-full justify-center"
              >
                Konfirmasi via WhatsApp Admin
              </a>
            )}
          </div>

          {status?.status === "SUCCESS" && (
            <div className="card pad-d bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center">
              <Icon.CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <h2 className="font-display font-bold text-xl">Pembayaran Berhasil</h2>
              <p className="text-sm text-ink/60 mt-2">Akses sudah aktif.</p>
              <button
                className="btn-ink w-full justify-center mt-4"
                onClick={() => setRoute("belajar")}
              >
                Mulai Belajar <Icon.Arrow />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
```

**Detail styling**:
- `mafiking-back-button`, `card pad-d`, `btn-ink`, `btn-ghost`, `Icon.*`, `kicker` — semua sudah ada (existing).
- Tambah icon `Icon.Copy` jika belum ada → extend `src/shared.jsx` atau inline SVG.

### Phase 10: Admin Panel UI

**File: `src/admin-payments.jsx` (NEW)**

```jsx
const AdminPayments = ({ setRoute, currentUser }) => {
  const { useState, useEffect } = React;
  const [tab, setTab] = useState('pending'); // 'pending' | 'all'
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState({ status: '', q: '' });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [auditLog, setAuditLog] = useState([]);

  useEffect(() => {
    if (tab === 'pending') {
      MafikingAPI.get('/api/admin/payments/pending').then(setPayments);
    } else {
      const qs = new URLSearchParams();
      if (filter.status) qs.set('status', filter.status);
      if (filter.q) qs.set('q', filter.q);
      MafikingAPI.get(`/api/admin/payments?${qs}`).then(setPayments);
    }
  }, [tab, filter]);

  async function handleMarkPaid(order) {
    if (!confirm(`Tandai ${order.merchant_order_id} sebagai LUNAS?`)) return;
    await MafikingAPI.post(`/api/admin/payments/${order.merchant_order_id}/mark-paid`, {
      fullAmount: order.qris_full_amount || order.amount,
    });
    // refresh
  }

  async function showAuditLog(order) {
    setSelectedOrder(order);
    const logs = await MafikingAPI.get(`/api/admin/payments/${order.merchant_order_id}/audit-log`);
    setAuditLog(logs);
  }

  return (
    <div className="bg-paper min-h-screen pb-28 md:pb-0">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={() => setRoute('admin')} className="mafiking-back-button mb-6">
          <Icon.ChevL /> Kembali ke Admin Panel
        </button>

        <h1 className="font-display font-bold text-2xl mb-6">Manajemen Pembayaran</h1>

        <div className="flex gap-2 mb-4">
          <button
            className={`px-4 py-2 rounded-xl font-semibold ${tab === 'pending' ? 'bg-ink text-paper' : 'bg-ink/5'}`}
            onClick={() => setTab('pending')}
          >Pending</button>
          <button
            className={`px-4 py-2 rounded-xl font-semibold ${tab === 'all' ? 'bg-ink text-paper' : 'bg-ink/5'}`}
            onClick={() => setTab('all')}
          >Semua</button>
        </div>

        {tab === 'all' && (
          <div className="flex gap-2 mb-4">
            <input
              placeholder="Status (PENDING/SUCCESS/...)"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="admin-input flex-1"
            />
            <input
              placeholder="Cari Order ID / Email"
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              className="admin-input flex-1"
            />
          </div>
        )}

        <div className="card pad-d bg-white border hairline rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink/[0.03]">
              <tr>
                <th className="text-left p-3">Order ID</th>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Paket</th>
                <th className="text-right p-3">Nominal</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t hairline">
                  <td className="p-3 font-mono text-xs">{p.merchant_order_id}</td>
                  <td className="p-3">{p.display_name || p.username}</td>
                  <td className="p-3">{p.product_details}</td>
                  <td className="p-3 text-right tnum">
                    Rp {(p.qris_full_amount || p.amount).toLocaleString('id-ID')}
                    {p.qris_suffix != null && (
                      <div className="text-xs text-ink/50">({p.qris_base_amount} + {p.qris_suffix})</div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`tag ${p.status === 'SUCCESS' ? '!bg-emerald-100' : p.status === 'EXPIRED' ? '!bg-red-100' : ''}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.status === 'PENDING' && (
                      <div className="flex gap-1">
                        <button onClick={() => handleMarkPaid(p)} className="text-xs text-emerald-600 font-semibold">
                          ✓ Lunas
                        </button>
                        <button onClick={() => showAuditLog(p)} className="text-xs text-ink/50">
                          📋 Log
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <div className="p-10 text-center text-ink/50">Tidak ada data.</div>
          )}
        </div>

        {selectedOrder && (
          <div className="mt-6 card pad-d bg-white border hairline rounded-2xl p-6">
            <h3 className="font-display font-bold text-lg mb-3">
              Audit Log: {selectedOrder.merchant_order_id}
            </h3>
            <div className="space-y-2">
              {auditLog.map((log) => (
                <div key={log.id} className="text-sm border-l-2 border-ink/20 pl-3">
                  <div className="font-mono text-xs text-ink/50">{log.created_at}</div>
                  <div>
                    <strong>{log.action}</strong> via <span className="tag">{log.source}</span>
                    {log.actor_id && ` (actor: ${log.actor_id})`}
                  </div>
                  {log.details && <pre className="text-xs bg-ink/5 p-2 rounded mt-1 overflow-x-auto">{log.details}</pre>}
                </div>
              ))}
              {auditLog.length === 0 && <div className="text-ink/50">Belum ada aktivitas.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

window.AdminPayments = AdminPayments;
```

**Wire ke `src/app.jsx`**:
- Tambah route `admin-payments` (di-handle sebagai sub-page dari admin)
- Update `src/admin.jsx` untuk tambah tombol "Manajemen Pembayaran" di sidebar/dashboard

---

## File Structure Changes

```
new_mafiking/
├── lib/                                  # NEW files
│   ├── qris-dynamic.js                   # NEW
│   ├── qris-suffix-pool.js               # NEW
│   ├── payment-reconciler.js             # NEW
│   ├── payment-expiry-sweeper.js         # NEW
│   └── reconcilers/
│       ├── admin-manual.js               # NEW
│       ├── webhook.js                    # NEW
│       ├── mutasiku.js                   # NEW
│       └── sms-listener.js               # NEW (dokumentasi only)
├── routes/
│   ├── payment.js                        # MODIFY
│   └── admin-payments.js                 # NEW
├── scripts/
│   └── test-qris-roundtrip.js            # NEW
├── db/
│   ├── schema.sql                        # MODIFY (add new columns/tables)
│   └── migrations/
│       └── 002_qris_local.sql            # NEW
├── src/
│   ├── payment.jsx                       # MODIFY (QR display flow)
│   ├── admin.jsx                         # MODIFY (link to admin-payments)
│   └── admin-payments.jsx                # NEW
├── server.js                             # MODIFY (wire sweeper, mutasiku, start validation)
├── package.json                          # MODIFY (add @prasetya/qris, qrcode)
├── .env.example                          # MODIFY (add QRIS_* env vars)
├── README.md                             # MODIFY (new section: Pembayaran QRIS Lokal)
├── ARCHITECTURE.md                       # MODIFY
├── AGENTS.md                             # MODIFY (add QRIS policy notes)
└── docs/
    └── plans/
        └── 2026-06-07-001-feat-qris-lokal-no-gateway-plan.md   # THIS FILE
```

---

## Environment Variables (.env.example additions)

```bash
# ============================================
# Payment Provider Selection
# ============================================
# qris   = Local QRIS (recommended, no third-party)
# duitku = Duitku gateway (legacy, requires DUITKU_* below)
# both   = Show both options to user
PAYMENT_PROVIDER=qris

# ============================================
# QRIS Lokal (No Payment Gateway)
# ============================================
# Paste hasil scan QR statis kamu di sini
# Cara dapat: scan QRIS statis dari GoPay Merchant / DANA Bisnis / Blu
#             pakai aplikasi QR scanner, copy string text yang muncul
#             (diawali dengan 00020101021126...)
QRIS_STATIC_STRING=

# Display name merchant (untuk pesan ke customer)
QRIS_MERCHANT_NAME=MAFIKING SOLUSI

# Order expiry dalam menit (suffix released setelah expire)
QRIS_EXPIRY_MINUTES=20

# Suffix pool range (1-999 = 999 kombinasi unik per nominal)
QRIS_SUFFIX_MIN=1
QRIS_SUFFIX_MAX=999

# WhatsApp admin untuk fallback konfirmasi manual
# Format: 62xxx (kode negara 62, tanpa +)
QRIS_ADMIN_WHATSAPP=6281234567890

# ============================================
# Webhook Reconciliation
# ============================================
# Generate: openssl rand -hex 32
PAYMENT_WEBHOOK_SECRET=

# ============================================
# Mutasiku (Optional — polling SaaS mutasi)
# ============================================
MUTASIKU_API_KEY=
MUTASIKU_ACCOUNT_ID=
MUTASIKU_POLL_INTERVAL=60000

# ============================================
# Duitku (Legacy — only if PAYMENT_PROVIDER=duitku|both)
# ============================================
DUITKU_BASE_URL=https://api-sandbox.duitku.com/api
DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
DUITKU_CALLBACK_URL=
DUITKU_RETURN_URL=
DUITKU_PAYMENT_METHOD=
```

---

## Library Comparison & Final Choice

| Library | Weekly DL | Last Publish | License | Deps | TypeScript | CommonJS | Verdict |
|---------|-----------|--------------|---------|------|------------|-----------|---------|
| `@misterdevs/qris-static-to-dynamic` (user-mentioned) | 18 | 9 bln lalu | ISC | 2 | ❌ | ❌ ESM only | ⚠️ Stale, ESM-only conflict |
| **`@prasetya/qris`** ⭐ CHOSEN | 15 | 21 hari lalu | MIT | **0** | ✅ | ✅ Dual ESM+CJS | 🏆 Best fit |
| `qris-saurus` | 162 | 6 hari lalu | MIT | 1 | ✅ | ❌ Bun-only | Bagus tapi Bun-only |
| `dinamic-qris-maker` | 40 | 4 bln lalu | MIT | 3 | ✅ | ✅ | OK tapi 3 deps |
| `qris-dinamis` (razisek) | 16 | 2 tahun lalu | MIT | 2 | ❌ | ✅ | Stale |
| `qris-dynamicify` | 42 | 8 bln lalu | Apache-2.0 | ? | ❌ | ✅ | OK |

**Alasan pilih `@prasetya/qris`**:

1. **Zero dependencies** ✅ — krusial untuk VPS 957 MB (no transitive vulns, no native build, small footprint).
2. **CommonJS + ESM dual** ✅ — project pakai `"type": "commonjs"`, langsung `require()`. `@misterdevs` ESM-only → refactor ke dynamic import.
3. **Fresh & maintained** ✅ — 21 hari lalu, fork dari `verssache/qris-dinamis` (battle-tested).
4. **Fitur paling lengkap**:
   - `validateQRIS()` — pre-flight check.
   - `convertQRIS()` — idempotent, recompute CRC, preserve tip tags.
   - `parseQRIS()` — post-generation verify.
   - `calculateCRC16()` — manual override untuk test.
5. **Spec compliance ketat**:
   - TLV byte-counted length (max 99).
   - Amount: positive integer ≤13 digit.
   - Fee: rejects exponential notation.
   - UTF-8 byte length, bukan string length.
   - `CRC-16/CCITT-FALSE` (= polynomial 0x1021, init 0xFFFF, no reflect, no xorout — **sama dengan BI spec**).

**`qrcode` (1.5.4)** untuk render PNG:
- 2.4 juta weekly downloads, MIT, pure JS, no native deps.
- Standar industri, sudah dipakai jutaan project.

**Total dependency baru**: 2 packages, **zero transitive**.

---

## Smoke Test Checklist (WAJIB PASS)

- [ ] **HP scan QR** → muncul nominal `base+suffix` di GoPay/DANA/OVO/ShopeePay
- [ ] **Suffix collision test** — buat 5 order simultan nominal Rp 50.000 → 5 suffix unik (1-5)
- [ ] **Admin mark-paid** → status `SUCCESS`, suffix released, `user_access_grants` ter-create
- [ ] **Webhook signed benar** → status berubah, log ter-isi
- [ ] **Webhook tanpa signature** → 401
- [ ] **Webhook signature salah** → 401
- [ ] **Webhook amount mismatch** → 400
- [ ] **Webhook replay attack** (timestamp lama) → 401
- [ ] **Order expired setelah 20 menit** → status `EXPIRED`, suffix released
- [ ] **Audit log ter-isi** untuk setiap mark-paid (admin/webhook/sweeper)
- [ ] **Duitku fallback** — `PAYMENT_PROVIDER=duitku` → existing flow tetap jalan (no regression)
- [ ] **Both mode** — `PAYMENT_PROVIDER=both` → frontend menampilkan kedua opsi
- [ ] **HP tidak scan QR (CRC invalid)** → library pre/post-validate catch
- [ ] **Stress test** — 50 order dalam 5 menit, semua dapat suffix unik
- [ ] **Frontend countdown** — real-time update setiap detik
- [ ] **Frontend WA button** — link benar dengan merchantOrderId ter-encode

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Library `@prasetya/qris` bug / CRC mismatch HP** | Phase 1 wajib scan HP sungguhan. Fallback: tulis manual di `lib/qris.js` dengan referensi EMVCo spec |
| **Suffix pool exhausted (999 lock all pending)** | Rate-limit `POST /api/payment/create` (existing `paymentLimiter` 8/min). Expiry 20 min. Future: expand ke 1-9999 |
| **Admin mark-paid salah order** | UI konfirmasi modal (show nominal + order id + suffix). Audit log. Cross-check `fullAmount` di UI |
| **Webhook replay attack** | Idempotency: cek `status='SUCCESS'` early-return. Rate-limit 60 req/min. HMAC dengan timestamp → reject jika `|now - req.timestamp| > 5 min` |
| **Mutasiku delay/drop** | Status `PENDING` user-facing OK. Admin bisa cross-check. Auto-expire tetap jalan |
| **Customer bayar tanpa suffix (kurang)** | Admin rekonsiliasi: input manual override amount. Audit log mencatat "amount override" |
| **Double pay** (customer bayar 2x karena tidak yakin) | Order pertama matched → status SUCCESS. Pembayaran kedua → admin cek mutasi → manual input sebagai donasi atau refund (di luar scope) |
| **E-wallet fraud detection freeze akun** | Edukasi: nominal kecil per transaksi (< 5jt). Volume harian monitored. Tetapkan threshold warning |
| **Statis QRIS dirotasi/diubah owner** | Re-paste `QRIS_STATIC_STRING` di env + restart server. Future: admin UI paste-string (no restart) |
| **HP kasir SMS listener mati** | Customer lapor via WA admin → admin cek mutasi di HP pribadi → mark paid manual di panel. SLA: 1-2 jam |
| **Server down saat admin mark-paid** | `markPaymentPaid` pakai `db.transaction` → atomic. Retry aman. Audit log tidak akan dobel |
| **Static QRIS bocor** | Risiko rendah (sudah public-facing). Tapi orang lain bisa generate dynamic QR atas nama merchant. Mitigasi: monitor mutasi harian, alert anomali |
| **VPS 957 MB penuh saat render QR** | QR PNG ≤10KB (DataURL base64). Tidak masalah. Tapi kalau 100 concurrent render, monitor memory |

---

## Detailed Sub-Step: Validasi String QRIS Statis

Sebelum di-paste ke env, validasi manual:

1. Buka aplikasi QR scanner di HP (bisa pakai Google Lens atau app QR scanner).
2. Scan QRIS statis dari GoPay Merchant / DANA Bisnis / Blu.
3. Copy string text yang muncul.
4. String **wajib** diawali dengan `000201010211` (header + static initiation).
5. String **wajib** diakhiri dengan `6304XXXX` (4 hex char checksum).
6. Panjang string biasanya 200-400 karakter.
7. Paste ke `QRIS_STATIC_STRING` di `.env` (wrap dengan kutip tunggal untuk hindari masalah escape).

**Test cepat pakai script sebelum lanjut**:
```bash
node -e "const { validateQRIS } = require('@prasetya/qris'); const result = validateQRIS(process.env.QRIS_STATIC_STRING); console.log(result);"
```
Harus output `{ valid: true, errors: [] }`.

---

## Detailed Sub-Step: Setup Webhook HMAC Secret

Generate secret:
```bash
openssl rand -hex 32
# output: 7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a
```

Set di `.env`:
```bash
PAYMENT_WEBHOOK_SECRET=7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a
```

**Test webhook pakai curl**:
```bash
# Generate signature
TS=$(date +%s)
SECRET="your-secret-here"
ORDER="MFK-1-1234567890"
AMOUNT="25012"
SIG=$(echo -n "${ORDER}:${AMOUNT}:${TS}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

# Send
curl -X POST http://localhost:3000/api/payment/reconcile/webhook \
  -H "Content-Type: application/json" \
  -d "{\"merchantOrderId\":\"$ORDER\",\"fullAmount\":$AMOUNT,\"timestamp\":$TS,\"signature\":\"$SIG\",\"source\":\"test\"}"
```

---

## AGENTS.md Updates

Tambah section baru di bawah "Email Verification":

```markdown
## Pembayaran QRIS Lokal (No Third-Party Gateway)

Mafiking dapat berjalan tanpa payment gateway pihak ketiga (Duitku/Midtrans) dengan mengonversi QRIS statis pribadi owner menjadi QRIS dinamis secara lokal. Implementasi:

- **Provider selection**: `PAYMENT_PROVIDER=qris|duitku|both`. Default `qris`.
- **Library**: `@prasetya/qris` (zero-dep, dual ESM/CJS, MIT) + `qrcode` (render PNG).
- **Suffix pool**: 1-999 kode unik per nominal untuk collision-free reconciliation.
- **Reconciliation channels**: 4 channel pluggable (admin manual, webhook signed, SMS listener, Mutasiku polling).
- **Audit log**: `payment_reconciliation_log` table — semua perubahan status di-log dengan source & actor.
- **Auto-expire**: order PENDING > 20 menit → EXPIRED, suffix released. Sweeper setiap 60 detik.

Environment vars yang relevan: `QRIS_STATIC_STRING` (wajib, secret), `QRIS_EXPIRY_MINUTES`, `QRIS_SUFFIX_MIN/MAX`, `QRIS_ADMIN_WHATSAPP`, `PAYMENT_WEBHOOK_SECRET`, `MUTASIKU_*` (optional).

Static QRIS string divalidasi saat server startup — server exit(1) jika invalid. Selalu test generate QR dengan HP asli sebelum deploy production.
```

---

## README.md Updates

Tambah section baru di bawah "## Payment":

```markdown
### Pembayaran QRIS Lokal (Tanpa Payment Gateway)

Mafiking mendukung pembayaran via QRIS dinamis yang di-generate dari QRIS statis pribadi owner. Tidak perlu daftar ke Duitku/Midtrans/dll. Detail di `docs/plans/2026-06-07-001-feat-qris-lokal-no-gateway-plan.md`.

Quick start:
1. Scan QRIS statis owner pakai HP, copy string (diawali `000201...`).
2. Set `QRIS_STATIC_STRING=<string>` di `.env`.
3. Set `PAYMENT_PROVIDER=qris` di `.env`.
4. Generate `PAYMENT_WEBHOOK_SECRET` dengan `openssl rand -hex 32`.
5. Test scan QR dengan HP asli (GoPay/DANA/OVO).
6. (Optional) Set `QRIS_ADMIN_WHATSAPP` untuk fallback konfirmasi.
7. (Optional) Set `MUTASIKU_*` untuk auto-polling mutasi.
8. (Optional) Setup `qris-eventhub` Android app untuk SMS listener.
```

---

## Future Enhancements (Out of Scope)

- [ ] Frontend: deep-link ke e-wallet apps (GoPay, DANA, OVO) untuk one-tap open
- [ ] Suffix pool configurable range (1-9999) via env
- [ ] Email notification ke admin saat ada order baru
- [ ] Webhook untuk trigger external system (Discord/Telegram bot)
- [ ] OCR/parser notifikasi Android di server (tanpa HP listener)
- [ ] Auto-reconcile via BI SNAP API
- [ ] Multi-merchant support (beberapa QRIS statis)
- [ ] Refund flow (di luar scope MVP)
- [ ] Customer self-service "cancel order" (release suffix lebih awal)

---

## Open Items / Notes

- Static QRIS string sensitive — JANGAN commit ke git. `.env` sudah di-ignore (verified di AGENTS.md).
- Pastikan test QR scan berhasil sebelum merge ke `main`.
- Webhook endpoint rate-limited — kalau pakai Mutasiku dengan polling agresif, mungkin perlu naikkan limit atau pakai API key.
- Admin UI untuk paste `QRIS_STATIC_STRING` (no restart) bisa di Phase 2+ — saat ini restart server setelah update env.

---

## Validation Commands

Setelah implementasi selesai:

```bash
# 1. Library check
npm install @prasetya/qris qrcode
node -e "require('@prasetya/qris')"
node -e "require('qrcode')"

# 2. Static QRIS validation
node -e "const {validateQRIS} = require('@prasetya/qris'); const r = validateQRIS(process.env.QRIS_STATIC_STRING); if (!r.valid) { console.error(r.errors); process.exit(1); } console.log('OK');"

# 3. Round-trip test (WAJIB scan HP dulu)
node scripts/test-qris-roundtrip.js

# 4. Syntax check
npm run check

# 5. End-to-end smoke
PORT=3001 PAYMENT_PROVIDER=qris npm start
curl -s -X POST http://localhost:3001/api/payment/create \
  -H "Content-Type: application/json" \
  -b "session=..." \
  -d '{"packageId":"bulanan","email":"test@test.com","name":"Test User"}'
# Verify response has qrImageDataUrl, suffix, fullAmount
# Scan returned QR with HP

# 6. Duitku regression (no break)
PORT=3001 PAYMENT_PROVIDER=duitku npm start
# Test existing Duitku flow
```

---

## Sign-off

Plan ini menunggu approval owner untuk eksekusi. Semua keputusan sudah locked:
- ✅ Library: `@prasetya/qris` + `qrcode`
- ✅ Reconciliation: 4 channels (admin, webhook, SMS, Mutasiku)
- ✅ Duitku: kept as fallback opt-in via env
- ✅ Volume: 20-100/hari (suffix pool 1-999, expiry 20 min)
- ✅ Rollout: feature flag `PAYMENT_PROVIDER`
- ✅ Testing: round-trip + scan HP asli

**Status**: Planned, menunggu eksekusi.

**Execution akan dimulai dari Phase 1**: install library + buat round-trip script yang harus discan dengan HP asli sebelum lanjut.
