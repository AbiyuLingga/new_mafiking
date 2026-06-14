---
title: "feat: Auto-Verification Payment Collector + Matching Engine (Phase 1 + 2)"
status: approved
plan_depth: Deep
created: 2026-06-10
origin: User request — build automated payment verification using unofficial DANA API via qris-mutasi library, with in-process collector and matching engine.
library: qris-mutasi v2.0.0
node_version: v22.22.0
---

# Auto-Verification Payment Collector + Matching Engine

## 1. Problem Statement

Saat ini, pembayaran QRIS di new_mafiking membutuhkan **konfirmasi manual** dari admin untuk menandai order sebagai PAID. Channel rekonsiliasi yang aktif:

1. **Admin manual** — admin klik "Lunas" di panel
2. **Webhook HMAC** — endpoint generic, butuh external trigger
3. **Mutasiku polling** — butuh akun Mutasiku (third-party SaaS)

Tidak ada channel yang **otomatis mendeteksi mutasi masuk dari DANA** tanpa intervensi manusia atau layanan pihak ketiga berbayar.

**Tujuan:** Membangun sistem yang secara otomatis:
1. Polling mutasi masuk dari DANA (via QRIS merchant dashboard)
2. Mencocokkan mutasi dengan pending payments berdasarkan nominal unik (base + suffix)
3. Auto mark-paid jika match tunggal dan valid
4. Masuk manual review jika ambigu

---

## 2. Library Choice: `qris-mutasi` v2.0.0

### Alasan Pemilihan

| Kriteria | `qris-mutasi` | `autoft-orkut` | `orkuthidebot` |
|----------|---------------|----------------|----------------|
| RAM usage | ~15-25MB | ~50-100MB+ | ~20-30MB |
| Dependencies | 1 (cheerio) | 3 (incl. native canvas) | 3 |
| Code audit | Readable | Obfuscated | Readable |
| VPS 957MB | YES | NO | YES |
| CommonJS | YES (dual CJS/ESM) | YES | YES |
| License | MIT | Proprietary | MIT |
| Last updated | Jul 2024 | Jan 2026 | Jul 2025 |

### Cara Kerja `qris-mutasi`

Library ini scrape dashboard merchant QRIS di `merchant.qris.online`:

```
Login (email + password)
  -> Extract secret_token dari HTML
  -> POST login dengan secret_token
  -> Cookie disimpan di file

Fetch mutasi
  -> POST ke /m/kontenr.php?idir=pages/historytrx.php
  -> Parse HTML dengan cheerio
  -> Return array transaksi
```

### Data yang Dikembalikan

```js
{
  id: 12345,                    // Transaction ID
  timestamp: 1718000000,        // Unix timestamp (seconds)
  tanggal: "2026-06-10 14:00:00",
  nominal: 50137,               // Integer rupiah
  status: "SUCCESS",            // Transaction status
  inv_id: 67890,                // Invoice ID
  tanggal_settlement: "2026-06-10",
  asal_transaksi: "DANA",       // Brand pengirim (DANA, OVO, GoPay, dll)
  nama_costumer: "Budi S",      // Nama customer
  rrn: "ABC123DEF456"           // Retrieval Reference Number
}
```

### Risiko dan Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| `merchant.qris.online` ubah HTML | Fail-closed: return `[]`, log error, alert admin |
| Cookie expired | Re-login otomatis sebelum setiap fetch |
| Dashboard down | Backoff exponential + circuit breaker |
| Cookie file di filesystem | Simpan di `/tmp` dengan permission `0600` |
| Supply chain (cheerio) | Cheerio adalah library well-known, 3M+ weekly DL |

---

## 3. Architecture

```
+------------------------------------------------------------------+
|                         server.js                                  |
|                                                                    |
|  +-----------------------+                                         |
|  | startMutationCollector |  <-- setInterval 15 detik              |
|  | (lib/mutation-        |                                         |
|  |  collector.js)        |                                         |
|  +----------+------------+                                         |
|             |                                                      |
|             v                                                      |
|  +-----------------------+     +----------------------------+     |
|  | QrisMutasiProvider    |---->| merchant.qris.online       |     |
|  | (lib/providers/       |     | (QRIS merchant dashboard)  |     |
|  |  QrisMutasiProvider)  |     +----------------------------+     |
|  +----------+------------+                                        |
|             | NormalizedMutation[]                                 |
|             v                                                      |
|  +-----------------------+     +----------------------------+     |
|  | MutationIngester      |---->| incoming_mutations table   |     |
|  | (lib/mutation-        |     | (dedupe via content_hash)  |     |
|  |  ingester.js)         |     +----------------------------+     |
|  +----------+------------+                                        |
|             | inserted mutation IDs                                |
|             v                                                      |
|  +-----------------------+     +----------------------------+     |
|  | MutationMatcher       |---->| payments table             |     |
|  | (lib/mutation-        |     | (PENDING -> SUCCESS)       |     |
|  |  matcher.js)          |     +----------------------------+     |
|  +----------+------------+                                        |
|             |                                                      |
|             v                                                      |
|  +-----------------------+                                         |
|  | markPaymentPaid()     |  <-- existing function                 |
|  | (lib/payment-         |                                         |
|  |  reconciler.js)       |                                         |
|  +-----------------------+                                         |
|                                                                    |
|  Background Timers (existing):                                     |
|  - startExpirySweeper(db, 60s)    -> PENDING -> EXPIRED            |
|  - startMutasikuPoller(db, 60s)   -> Mutasiku API -> reconcile    |
|  - startMutationCollector(db, 15s) -> QRIS dashboard -> reconcile | <-- NEW
+------------------------------------------------------------------+
```

### Design Principles

1. **Fail-closed**: Error di collector TIDAK crash server, TIDAK auto-mark-paid
2. **Idempotent**: Duplicate mutation tidak menyebabkan double-paid
3. **Isolated**: Provider tidak punya akses ke database
4. **Auditable**: Setiap match/unmatch tercatat di `payment_reconciliation_log`
5. **Feature-flagged**: Default OFF, enable via env var

---

## 4. Database Schema

### Migration: `db/migrations/003_incoming_mutations.sql`

```sql
CREATE TABLE IF NOT EXISTS incoming_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'qris_merchant',
    provider_mutation_id TEXT,
    content_hash TEXT UNIQUE NOT NULL,

    direction TEXT NOT NULL DEFAULT 'IN',
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    transacted_at DATETIME NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    payer_name_masked TEXT,
    payer_id_hash TEXT,
    note_masked TEXT,

    matched_order_id TEXT,
    matched_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_mutations_unmatched
    ON incoming_mutations(amount, status, transacted_at)
    WHERE matched_order_id IS NULL AND direction = 'IN' AND status = 'SUCCESS';

CREATE INDEX IF NOT EXISTS idx_mutations_provider_id
    ON incoming_mutations(provider_mutation_id)
    WHERE provider_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_matched
    ON incoming_mutations(matched_order_id)
    WHERE matched_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_received
    ON incoming_mutations(received_at);
```

### Design Decisions

| Kolom | Alasan |
|-------|--------|
| `content_hash UNIQUE` | Deduplication di level DB. `INSERT OR IGNORE` skip jika hash sudah ada |
| `provider_mutation_id` | ID unik dari dashboard QRIS (field `id` atau `rrn`). Fallback dedupe |
| `payer_name_masked` | Nama customer yang sudah di-mask: "Budi Santoso" -> "B*** S***" |
| `payer_id_hash` | HMAC-SHA256 dari identifier pengirim dengan HASH_PEPPER |
| `matched_order_id` | NULL = belum di-match. Filled = sudah di-match ke payment |
| Index `WHERE matched_order_id IS NULL` | Matcher hanya scan unmatched mutations. Performant |
| Tidak ada `raw_json` | Prinsip minimisasi data. Data sensitif tidak disimpan mentah |

### Append ke `db/schema.sql`

Blok migration di atas ditambahkan ke akhir `db/schema.sql` agar fresh install include tabel baru.

---

## 5. File Structure

### New Files (8 files)

```
new_mafiking/
+-- lib/
|   +-- providers/
|   |   +-- PaymentMutationProvider.js    # Interface + typedef
|   |   +-- QrisMutasiProvider.js         # qris-mutasi adapter
|   |   +-- MockMutationProvider.js       # Mock untuk testing
|   +-- mutation-ingester.js              # Dedupe + hash + store
|   +-- mutation-matcher.js               # Matching engine
|   +-- mutation-collector.js             # In-process polling worker
+-- db/
|   +-- migrations/
|       +-- 003_incoming_mutations.sql    # Schema migration
+-- scripts/
    +-- test-auto-verification.js         # Integration test
```

### Modified Files (4 files)

```
new_mafiking/
+-- server.js                             # Wire collector startup
+-- db/schema.sql                         # Append migration 003
+-- .env.example                          # Add new env vars
+-- package.json                          # Add qris-mutasi dependency
```

---

## 6. Detailed Implementation

### Step 1: Provider Interface

**File: `lib/providers/PaymentMutationProvider.js`**

Module dokumentasi yang mendefinisikan kontrak interface. Tidak ada runtime code yang kompleks, hanya typedef dan validasi helper.

```js
/**
 * @typedef {Object} NormalizedMutation
 * @property {string}   provider              - 'qris_merchant' | 'mock'
 * @property {string}   [providerMutationId]  - ID unik dari provider
 * @property {'IN'|'OUT'} direction           - Arah transaksi
 * @property {number}   amount                - Nominal rupiah (integer positif)
 * @property {'SUCCESS'|'PENDING'|'FAILED'|'UNKNOWN'} status
 * @property {Date}     transactedAt          - Waktu transaksi terjadi
 * @property {string}   [payerName]           - Nama pengirim (akan di-mask oleh ingester)
 * @property {string}   [payerId]             - ID pengirim (akan di-hash oleh ingester)
 * @property {string}   [note]                - Catatan transaksi (akan di-mask oleh ingester)
 */

function validateNormalizedMutation(m) {
    if (!m || typeof m !== 'object') return false;
    if (!Number.isSafeInteger(m.amount) || m.amount <= 0) return false;
    if (m.direction !== 'IN' && m.direction !== 'OUT') return false;
    if (!(m.transactedAt instanceof Date) || isNaN(m.transactedAt.getTime())) return false;
    if (!['SUCCESS', 'PENDING', 'FAILED', 'UNKNOWN'].includes(m.status)) return false;
    return true;
}

module.exports = { validateNormalizedMutation };
```

**Rules:**
- Provider TIDAK boleh akses database
- Provider TIDAK boleh membuat keputusan PAID
- Provider HARUS return `NormalizedMutation[]`
- Provider HARUS fail-closed: error -> return `[]`, bukan throw

---

### Step 2: QrisMutasiProvider

**File: `lib/providers/QrisMutasiProvider.js`**

Adapter yang membungkus `qris-mutasi` library.

```js
const QrisMutasi = require('qris-mutasi');
const { validateNormalizedMutation } = require('./PaymentMutationProvider');

class QrisMutasiProvider {
    constructor({ email, password, cookieDir, timeout }) {
        this.email = email;
        this.password = password;
        this.cookieDir = cookieDir || '/tmp';
        this.timeout = timeout || 15000;
        this.qris = null;
    }

    async _ensureClient() {
        if (!this.qris) {
            this.qris = new QrisMutasi(this.email, this.password);
        }
    }

    async fetchLatestMutations() {
        try {
            await this._ensureClient();

            const today = new Date();
            const fromDate = today.toISOString().slice(0, 10);
            const toDate = fromDate;

            const data = await this.qris.mutasi(
                'all',      // filter: all transactions
                fromDate,
                toDate,
                50          // limit
            );

            if (!Array.isArray(data)) return [];

            return data
                .filter(row => row && row.nominal > 0)
                .map(row => ({
                    provider: 'qris_merchant',
                    providerMutationId: String(row.rrn || row.id || ''),
                    direction: 'IN',
                    amount: Number(row.nominal),
                    status: String(row.status || '').toUpperCase() === 'SUCCESS'
                        ? 'SUCCESS' : 'UNKNOWN',
                    transactedAt: new Date(
                        (Number(row.timestamp) || 0) * 1000 || row.tanggal
                    ),
                    payerName: String(row.nama_costumer || ''),
                    payerId: String(row.rrn || ''),
                    note: String(row.asal_transaksi || ''),
                }))
                .filter(validateNormalizedMutation);

        } catch (error) {
            console.error('[QrisMutasiProvider] fetch error:', error.message);
            return []; // fail-closed
        }
    }
}

module.exports = { QrisMutasiProvider };
```

**Key behaviors:**
- Lazy initialization: client dibuat saat pertama kali fetch
- Cookie management: `qris-mutasi` handle login + cookie otomatis
- Filter: hanya nominal > 0 dan status SUCCESS
- Mapping: konversi field `qris-mutasi` -> `NormalizedMutation`
- Fail-closed: catch semua error, return `[]`

---

### Step 3: MockMutationProvider

**File: `lib/providers/MockMutationProvider.js`**

Provider palsu untuk testing dan development.

```js
class MockMutationProvider {
    constructor() {
        this._mutations = [];
    }

    addMutation(mutation) {
        this._mutations.push(mutation);
    }

    clear() {
        this._mutations = [];
    }

    async fetchLatestMutations() {
        const result = [...this._mutations];
        this._mutations = []; // consume after fetch
        return result;
    }
}

module.exports = { MockMutationProvider };
```

---

### Step 4: Mutation Ingester

**File: `lib/mutation-ingester.js`**

Bertugas menerima `NormalizedMutation[]`, melakukan deduplication via content hash, masking data sensitif, dan menyimpan ke `incoming_mutations`.

```js
const crypto = require('crypto');

function maskName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    return trimmed
        .split(/\s+/)
        .map(part => part[0] + '***')
        .join(' ');
}

function hashPayerId(payerId, pepper) {
    if (!payerId) return null;
    return crypto
        .createHmac('sha256', String(pepper || ''))
        .update(String(payerId))
        .digest('hex');
}

function computeContentHash(mutation, pepper) {
    const parts = [
        String(mutation.provider || ''),
        String(mutation.providerMutationId || ''),
        String(mutation.direction || ''),
        String(mutation.amount || 0),
        String(mutation.status || ''),
        String(Math.floor((mutation.transactedAt || new Date()).getTime() / 1000)),
        hashPayerId(mutation.payerId, pepper) || '',
        String(mutation.payerName || '').toLowerCase().trim(),
    ];
    return crypto
        .createHmac('sha256', String(pepper || 'default-pepper'))
        .update(parts.join('|'))
        .digest('hex');
}

function ingestMutation(db, mutation, pepper) {
    const contentHash = computeContentHash(mutation, pepper);

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO incoming_mutations (
            provider, provider_mutation_id, content_hash,
            direction, amount, status, transacted_at,
            payer_name_masked, payer_id_hash, note_masked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        String(mutation.provider || 'unknown'),
        String(mutation.providerMutationId || '') || null,
        contentHash,
        String(mutation.direction || 'IN'),
        Number(mutation.amount) || 0,
        String(mutation.status || 'UNKNOWN'),
        mutation.transactedAt.toISOString().slice(0, 19).replace('T', ' '),
        maskName(mutation.payerName),
        hashPayerId(mutation.payerId, pepper),
        maskName(mutation.note)
    );

    const inserted = result.changes > 0;

    if (inserted) {
        db.prepare(`
            INSERT INTO payment_reconciliation_log
                (merchant_order_id, action, actor_id, source, details)
            VALUES ('', 'mutation_ingested', NULL, ?, ?)
        `).run(
            String(mutation.provider || 'unknown'),
            JSON.stringify({
                contentHash,
                amount: mutation.amount,
                providerMutationId: mutation.providerMutationId || '',
                transactedAt: mutation.transactedAt.toISOString(),
            })
        );
    }

    const row = db.prepare(
        'SELECT id FROM incoming_mutations WHERE content_hash = ?'
    ).get(contentHash);

    return {
        inserted,
        mutationId: row ? row.id : null,
        contentHash,
    };
}

function ingestBatch(db, mutations, pepper) {
    const ingest = db.transaction(() => {
        const results = [];
        for (const mutation of mutations) {
            results.push(ingestMutation(db, mutation, pepper));
        }
        return results;
    });
    return ingest();
}

module.exports = {
    computeContentHash,
    hashPayerId,
    ingestBatch,
    ingestMutation,
    maskName,
};
```

**Key behaviors:**
- `INSERT OR IGNORE` -> jika `content_hash` sudah ada, skip (idempotent)
- `maskName("Budi Santoso")` -> `"B*** S***"`
- `hashPayerId` -> HMAC-SHA256 dengan pepper dari env
- `computeContentHash` -> gabungan 8 field, floor timestamp ke second
- Batch dalam SQLite transaction untuk atomicity
- Return `{ inserted, mutationId }` agar matcher tahu mana yang baru

---

### Step 5: Matching Engine

**File: `lib/mutation-matcher.js`**

Inti dari auto-verification. Mencocokkan mutasi masuk dengan pending payments.

```js
const { markPaymentPaid } = require('./payment-reconciler');

function matchMutation(db, mutationId) {
    const mutation = db.prepare(
        'SELECT * FROM incoming_mutations WHERE id = ?'
    ).get(mutationId);

    if (!mutation) return null;
    if (mutation.direction !== 'IN') return null;
    if (mutation.status !== 'SUCCESS') return null;
    if (mutation.matched_order_id) return null;

    const candidates = db.prepare(`
        SELECT *
        FROM payments
        WHERE status = 'PENDING'
          AND COALESCE(qris_full_amount, amount) = ?
          AND created_at <= ?
          AND (expires_at IS NULL OR expires_at >= ?)
        ORDER BY created_at ASC
        LIMIT 5
    `).all(
        mutation.amount,
        mutation.transacted_at,
        mutation.transacted_at
    );

    if (candidates.length === 0) {
        logMatchDecision(db, {
            mutationId: mutation.id,
            action: 'auto_verify_unmatched',
            details: {
                amount: mutation.amount,
                transactedAt: mutation.transacted_at,
                reason: 'no_pending_payment',
            },
        });
        return null;
    }

    if (candidates.length > 1) {
        logMatchDecision(db, {
            mutationId: mutation.id,
            action: 'auto_verify_ambiguous',
            details: {
                amount: mutation.amount,
                candidateCount: candidates.length,
                candidateOrderIds: candidates.map(c => c.merchant_order_id),
                reason: 'multiple_pending_payments_same_amount',
            },
        });
        return null;
    }

    const payment = candidates[0];

    const result = markPaymentPaid(db, {
        merchantOrderId: payment.merchant_order_id,
        fullAmount: mutation.amount,
        source: 'auto_verify',
        rawDetails: {
            mutationId: mutation.id,
            provider: mutation.provider,
            providerMutationId: mutation.provider_mutation_id || '',
            transactedAt: mutation.transacted_at,
            payerNameMasked: mutation.payer_name_masked || '',
        },
    });

    db.prepare(`
        UPDATE incoming_mutations
        SET matched_order_id = ?, matched_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(payment.merchant_order_id, mutation.id);

    logMatchDecision(db, {
        mutationId: mutation.id,
        merchantOrderId: payment.merchant_order_id,
        action: 'auto_verify_matched',
        details: {
            amount: mutation.amount,
            provider: mutation.provider,
            providerMutationId: mutation.provider_mutation_id || '',
        },
    });

    return { ok: true, merchantOrderId: payment.merchant_order_id, ...result };
}

function matchPendingMutations(db) {
    const unmatched = db.prepare(`
        SELECT id
        FROM incoming_mutations
        WHERE matched_order_id IS NULL
          AND direction = 'IN'
          AND status = 'SUCCESS'
        ORDER BY transacted_at ASC
        LIMIT 50
    `).all();

    let matched = 0;
    let unmatched_count = 0;

    for (const row of unmatched) {
        const result = matchMutation(db, row.id);
        if (result && result.ok) matched++;
        else {
            const mutation = db.prepare(
                'SELECT * FROM incoming_mutations WHERE id = ?'
            ).get(row.id);
            if (mutation && !mutation.matched_order_id) unmatched_count++;
        }
    }

    return { matched, unmatched: unmatched_count, checked: unmatched.length };
}

function logMatchDecision(db, { mutationId = null, merchantOrderId = '', action, details = {} }) {
    db.prepare(`
        INSERT INTO payment_reconciliation_log
            (merchant_order_id, action, actor_id, source, details)
        VALUES (?, ?, NULL, 'auto_verify', ?)
    `).run(
        String(merchantOrderId || ''),
        String(action || ''),
        JSON.stringify({ ...details, mutationId })
    );
}

function processNewMutations(db, mutations, pepper) {
    const { ingestBatch } = require('./mutation-ingester');

    const ingestResults = ingestBatch(db, mutations, pepper);

    let matched = 0;
    let errors = 0;

    for (const result of ingestResults) {
        if (!result.inserted || !result.mutationId) continue;
        try {
            const matchResult = matchMutation(db, result.mutationId);
            if (matchResult && matchResult.ok) matched++;
        } catch (error) {
            errors++;
            console.error('[matcher] error matching mutation', result.mutationId, ':', error.message);
        }
    }

    return {
        ingested: ingestResults.filter(r => r.inserted).length,
        duplicates: ingestResults.filter(r => !r.inserted).length,
        matched,
        errors,
    };
}

module.exports = {
    matchMutation,
    matchPendingMutations,
    processNewMutations,
};
```

**Matching rules:**
1. Amount HARUS exact match: `COALESCE(qris_full_amount, amount) = mutation.amount`
2. Mutation time HARUS dalam window: `payment.created_at <= mutation.transacted_at <= payment.expires_at`
3. Hanya `SUCCESS` mutation yang di-match
4. Hanya `PENDING` payment yang bisa di-match
5. Jika 0 candidates -> log `unmatched`, return null
6. Jika 1 candidate -> `markPaymentPaid()`, update `matched_order_id`
7. Jika >1 candidates -> log `ambiguous`, return null (manual review)
8. `markPaymentPaid()` sudah idempotent (cek status sebelum update)

---

### Step 6: Mutation Collector

**File: `lib/mutation-collector.js`**

In-process polling worker. Pola sama dengan `startMutasikuPoller` dan `startExpirySweeper`.

```js
const { processNewMutations, matchPendingMutations } = require('./mutation-matcher');

function startMutationCollector(db, provider, options = {}) {
    const intervalMs = Math.max(10000, Number(options.intervalMs) || 15000);
    const maxConsecutiveErrors = Number(options.maxConsecutiveErrors) || 5;
    const pepper = String(options.pepper || process.env.HASH_PEPPER || '');

    if (!pepper) {
        console.error('[collector] HASH_PEPPER not set — collector disabled for safety');
        return null;
    }

    let consecutiveErrors = 0;
    let backoffMs = 0;
    let lastPollAt = 0;
    let totalMatched = 0;
    let totalChecked = 0;

    async function poll() {
        const now = Date.now();

        if (backoffMs > 0 && now - lastPollAt < backoffMs) return;

        try {
            const mutations = await provider.fetchLatestMutations();

            if (!Array.isArray(mutations)) {
                throw new Error(`Provider returned non-array: ${typeof mutations}`);
            }

            const result = processNewMutations(db, mutations, pepper);
            const pendingResult = matchPendingMutations(db);

            totalChecked += mutations.length;
            totalMatched += result.matched + pendingResult.matched;

            if (result.matched > 0 || pendingResult.matched > 0) {
                console.log(
                    `[collector] matched ${result.matched + pendingResult.matched} payment(s)` +
                    ` (total: ${totalMatched})`
                );
            }

            if (result.ingested > 0) {
                console.log(
                    `[collector] ingested ${result.ingested} new mutation(s),` +
                    ` ${result.duplicates} duplicate(s)`
                );
            }

            consecutiveErrors = 0;
            backoffMs = 0;
            lastPollAt = now;

        } catch (error) {
            consecutiveErrors++;
            backoffMs = Math.min(300000, (backoffMs || 5000) * 2);

            console.error(
                `[collector] poll error (${consecutiveErrors}/${maxConsecutiveErrors}):`,
                error.message
            );

            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error(
                    '[collector] ALERT: max consecutive errors reached.' +
                    ' Collector will retry with extended backoff.'
                );
            }

            lastPollAt = Date.now();
        }
    }

    poll();

    const timer = setInterval(poll, intervalMs);
    timer.unref?.();

    console.log(`[collector] started (interval ${intervalMs}ms, provider: ${provider.constructor.name})`);

    return {
        timer,
        stop: () => clearInterval(timer),
        getStats: () => ({
            totalChecked,
            totalMatched,
            consecutiveErrors,
            backoffMs,
            lastPollAt,
        }),
    };
}

module.exports = { startMutationCollector };
```

**Key features:**
- **Backoff exponential**: 5s -> 10s -> 20s -> ... -> max 5 menit
- **Circuit breaker**: log alert jika >5 error berturut-turut
- **Fail-closed**: error di provider tidak crash server
- **`.unref()`**: tidak mencegah process exit
- **Stats**: expose `getStats()` untuk monitoring
- **HASH_PEPPER guard**: refuse to start jika pepper kosong

---

### Step 7: Server Integration

**File: `server.js` (modify)**

Tambah di bagian startup, setelah `startExpirySweeper` dan `startMutasikuPoller`:

```js
// --- Auto-verification collector ---
const MUTATION_COLLECTOR_ENABLED = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MUTATION_COLLECTOR_ENABLED || '').toLowerCase()
);

if (MUTATION_COLLECTOR_ENABLED) {
    const { startMutationCollector } = require('./lib/mutation-collector');
    const providerName = String(process.env.MUTATION_PROVIDER || 'mock').toLowerCase();

    let provider;
    if (providerName === 'qris_merchant') {
        const { QrisMutasiProvider } = require('./lib/providers/QrisMutasiProvider');
        provider = new QrisMutasiProvider({
            email: process.env.QRIS_MERCHANT_EMAIL,
            password: process.env.QRIS_MERCHANT_PASSWORD,
            cookieDir: process.env.QRIS_COOKIE_DIR || '/tmp',
        });
    } else {
        const { MockMutationProvider } = require('./lib/providers/MockMutationProvider');
        provider = new MockMutationProvider();
    }

    const collector = startMutationCollector(db, provider, {
        intervalMs: Number(process.env.MUTATION_POLL_INTERVAL_MS) || 15000,
        maxConsecutiveErrors: Number(process.env.MUTATION_MAX_ERRORS) || 5,
        pepper: process.env.HASH_PEPPER,
    });

    if (collector) {
        app.locals.mutationCollector = collector;
    }
} else {
    console.log('[collector] MUTATION_COLLECTOR_ENABLED not set — auto-verify is OFF');
}
```

Juga tambahkan `autoVerifyEnabled` ke response `GET /api/payment/config`:

```js
// Di routes/payment.js, function paymentGatewayState()
// Tambah field:
autoVerifyEnabled: MUTATION_COLLECTOR_ENABLED,
```

---

### Step 8: Environment Variables

**File: `.env.example` (append)**

```env
# ============================================
# Auto-Verification Collector
# ============================================
# Enable/disable auto-verification (default: false)
# Set to 'true' setelah testing selesai
MUTATION_COLLECTOR_ENABLED=false

# Provider: 'qris_merchant' | 'mock'
MUTATION_PROVIDER=mock

# Polling interval (ms), minimum 10000
MUTATION_POLL_INTERVAL_MS=15000

# Max consecutive errors before alert
MUTATION_MAX_ERRORS=5

# QRIS Merchant Dashboard credentials (for qris_merchant provider)
# Daftar di merchant.qris.online
QRIS_MERCHANT_EMAIL=
QRIS_MERCHANT_PASSWORD=

# Directory for cookie storage (default: /tmp)
QRIS_COOKIE_DIR=/tmp

# Hash pepper for payer ID hashing and content hash
# Generate: openssl rand -hex 32
HASH_PEPPER=
```

---

### Step 9: Database Schema Update

**File: `db/schema.sql` (append)**

Tambahkan blok migration 003 di akhir file:

```sql
-- Migration 003: incoming_mutations for auto-verification
CREATE TABLE IF NOT EXISTS incoming_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'qris_merchant',
    provider_mutation_id TEXT,
    content_hash TEXT UNIQUE NOT NULL,
    direction TEXT NOT NULL DEFAULT 'IN',
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    transacted_at DATETIME NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    payer_name_masked TEXT,
    payer_id_hash TEXT,
    note_masked TEXT,
    matched_order_id TEXT,
    matched_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_mutations_unmatched
    ON incoming_mutations(amount, status, transacted_at)
    WHERE matched_order_id IS NULL AND direction = 'IN' AND status = 'SUCCESS';

CREATE INDEX IF NOT EXISTS idx_mutations_provider_id
    ON incoming_mutations(provider_mutation_id)
    WHERE provider_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_matched
    ON incoming_mutations(matched_order_id)
    WHERE matched_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_received
    ON incoming_mutations(received_at);
```

---

### Step 10: Test Script

**File: `tests/payment/test-auto-verification.js`**

Integration test dengan in-memory SQLite.

```
Test cases:

 1. Happy path: mutation IN Rp50.137 -> pending payment Rp50.137 -> auto PAID
 2. Duplicate mutation -> tidak double paid (content_hash dedupe)
 3. Mutation amount cocok tapi di luar time window -> tidak match
 4. Mutation status FAILED -> tidak match
 5. Mutation direction OUT -> tidak match
 6. Dua pending payment amount sama -> ambiguous, tidak auto-match
 7. Payment sudah EXPIRED -> tidak auto-match
 8. Provider error -> collector tetap jalan, tidak crash
 9. Provider return non-array -> collector skip, log error
10. Empty mutations -> collector skip, no error
11. Matched mutation tidak di-process ulang
12. Suffix released setelah auto-match
13. Access grant created setelah auto-match
14. Audit log tercatat untuk setiap match/unmatch/ambiguous
15. maskName works correctly
16. hashPayerId is deterministic with same pepper
17. contentHash is deterministic for same input
18. contentHash differs for different input
19. ingestBatch is atomic (all or nothing)
20. processNewMutations returns correct summary
```

---

## 7. Security Analysis

### Threat Model

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Attacker kirim mutation palsu | Provider isolation, fail-closed, no DB access | DONE |
| Duplicate mutation -> double paid | `content_hash UNIQUE` + `INSERT OR IGNORE` + idempotent `markPaymentPaid` | DONE |
| Payer data leak | `maskName()` + `hashPayerId()` sebelum simpan | DONE |
| Provider error crash server | try/catch + backoff + circuit breaker + `.unref()` | DONE |
| False positive match | Exact amount + time window + ambiguity guard (>1 = skip) | DONE |
| HASH_PEPPER kosong | Fail-fast: collector refuse to start | DONE |
| Cookie file compromise | Simpan di `/tmp` dengan permission `0600`, auto-expire | DONE |
| Library compromised | `qris-mutasi` = 1 dep (cheerio, 3M+ DL/wk), readable code | DONE |
| Dashboard HTML change | Fail-closed: return `[]`, log error | DONE |
| Replay attack | `content_hash` dedupe + `provider_mutation_id` | DONE |

### Data Classification

| Data | Kategori | Perlakuan |
|------|----------|-----------|
| `amount` | Financial | Simpan plaintext di `incoming_mutations` |
| `payerName` | Personal | `maskName()` -> simpan masked |
| `payerId` (RRN) | Identifier | `hashPayerId()` -> simpan hash |
| `note` (asal_transaksi) | Metadata | `maskName()` -> simpan masked |
| `contentHash` | Integrity | HMAC-SHA256 dengan pepper |
| `provider_mutation_id` | Reference | Simpan plaintext (needed for dedupe) |

---

## 8. Execution Order

| Step | File | Depends On | Est. Time |
|------|------|-----------|-----------|
| 1 | `npm install qris-mutasi` | - | 1 min |
| 2 | `db/migrations/003_incoming_mutations.sql` | - | 5 min |
| 3 | `db/schema.sql` (append) | Step 2 | 2 min |
| 4 | `lib/providers/PaymentMutationProvider.js` | - | 5 min |
| 5 | `lib/providers/MockMutationProvider.js` | Step 4 | 10 min |
| 6 | `lib/mutation-ingester.js` | Step 2 | 20 min |
| 7 | `lib/mutation-matcher.js` | Step 6 | 25 min |
| 8 | `lib/mutation-collector.js` | Step 6, 7 | 15 min |
| 9 | `lib/providers/QrisMutasiProvider.js` | Step 1, 4 | 20 min |
| 10 | `server.js` (wire) | Step 8 | 5 min |
| 11 | `.env.example` (append) | Step 10 | 3 min |
| 12 | `tests/payment/test-auto-verification.js` | Step 5-8 | 30 min |
| 13 | Run tests + verify | Step 12 | 15 min |
| 14 | `npm run check` | Step 13 | 2 min |

**Total estimated: ~2.5 hours**

---

## 9. Rollout Plan

### Phase A: Development (MUTATION_PROVIDER=mock)

1. Implement semua file
2. Run test script dengan MockMutationProvider
3. Verify semua 20 test cases pass
4. `npm run check` pass

### Phase B: Staging (MUTATION_COLLECTOR_ENABLED=true, MUTATION_PROVIDER=qris_merchant)

1. Set env vars: `QRIS_MERCHANT_EMAIL`, `QRIS_MERCHANT_PASSWORD`, `HASH_PEPPER`
2. Enable collector: `MUTATION_COLLECTOR_ENABLED=true`
3. Buat payment test kecil (Rp1.000 + suffix)
4. Scan QRIS dari DANA/OVO/GoPay
5. Verify: mutation terdeteksi -> auto PAID dalam 15-30 detik
6. Verify: access grant created
7. Verify: audit log tercatat
8. Test edge cases: duplicate scan, expired payment, wrong amount

### Phase C: Production

1. Deploy code dengan `MUTATION_COLLECTOR_ENABLED=false`
2. Verify tidak ada regresi di payment flow existing
3. Set `MUTATION_COLLECTOR_ENABLED=true`
4. Monitor log: `[collector] matched X payment(s)`
5. Monitor admin panel: cek tidak ada false positive
6. Monitor VPS memory: pastikan tidak naik signifikan

---

## 10. Monitoring and Alerting

### Log Events

| Event | Log Level | Format |
|-------|-----------|--------|
| Collector started | INFO | `[collector] started (interval Xms, provider: Y)` |
| Collector disabled | INFO | `[collector] MUTATION_COLLECTOR_ENABLED not set — auto-verify is OFF` |
| HASH_PEPPER missing | ERROR | `[collector] HASH_PEPPER not set — collector disabled for safety` |
| Mutation ingested | INFO | `[collector] ingested X new mutation(s), Y duplicate(s)` |
| Payment auto-matched | INFO | `[collector] matched X payment(s) (total: Y)` |
| Provider error | ERROR | `[collector] poll error (N/max): message` |
| Max errors reached | ERROR | `[collector] ALERT: max consecutive errors reached` |
| Ambiguous match | INFO | (via reconciliation_log: `auto_verify_ambiguous`) |
| Unmatched mutation | INFO | (via reconciliation_log: `auto_verify_unmatched`) |

### Health Check

Collector stats bisa diakses via `app.locals.mutationCollector.getStats()`:

```js
{
    totalChecked: 150,
    totalMatched: 12,
    consecutiveErrors: 0,
    backoffMs: 0,
    lastPollAt: 1718000000000,
}
```

---

## 11. Future Enhancements (Out of Scope)

1. **Daily reconciliation report** — bandingkan total matched vs total mutasi di dashboard
2. **Admin dashboard widget** — tampilkan collector stats + unmatched mutations
3. **Notification** — kirim WA/email jika collector error berulang
4. **Multiple provider support** — fallback ke Mutasiku jika qris_merchant gagal
5. **Payer data encryption at rest** — encrypt `payer_name_masked` dan `payer_id_hash` dengan AES-256
6. **Mutation retention policy** — auto-delete mutations older than 90 days
7. **Manual match from unmatched** — admin bisa match unmatched mutation ke order dari panel
