#!/usr/bin/env node
// Isolated Mutation Collector
// Phase 4 hardening: separate process with minimal env, sandboxed cookie dir,
// restricted network egress, and signed-encrypted batched ingestion to main app.
//
// Usage:
//   COLLECTOR_HMAC_SECRET=... HASH_PEPPER=... MAIN_APP_URL=... node server/workers/collector.js
//
// Required env:
//   COLLECTOR_HMAC_SECRET   Shared secret with main app for HMAC-signed batches
//   COLLECTOR_KEY_ID         Identifier for this collector instance
//   HASH_PEPPER              Secret for payer-id hashing
//   QRIS_MERCHANT_EMAIL     Merchant dashboard email
//   QRIS_MERCHANT_PASSWORD  Merchant dashboard password
//   MAIN_APP_URL             Base URL of main app (e.g. https://mafiking.com)
//   QRIS_COOKIE_DIR          Directory for qris-mutasi cookie file (chmod 0700)
//
// Optional env:
//   COLLECTOR_INTERVAL_MS    Poll interval (default 15000, min 5000)
//   COLLECTOR_BATCH_MAX      Max mutations per batch (default 50)
//   QRIS_MUTATION_LOOKBACK_DAYS
//   QRIS_MUTATION_TIME_ZONE
//   COLLECTOR_MAX_ERRORS

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const REQUIRED_ENV = [
    'COLLECTOR_HMAC_SECRET',
    'COLLECTOR_KEY_ID',
    'HASH_PEPPER',
    'QRIS_MERCHANT_EMAIL',
    'QRIS_MERCHANT_PASSWORD',
    'MAIN_APP_URL',
    'QRIS_COOKIE_DIR',
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`[collector] missing required env: ${missing.join(', ')}`);
    process.exit(1);
}

const COOKIE_DIR = String(process.env.QRIS_COOKIE_DIR);
try {
    fs.mkdirSync(COOKIE_DIR, { recursive: true, mode: 0o700 });
    fs.chmodSync(COOKIE_DIR, 0o700);
} catch (err) {
    console.error(`[collector] failed to create/secure cookie dir: ${err.message}`);
    process.exit(1);
}

try {
    process.chdir(COOKIE_DIR);
} catch (err) {
    console.error(`[collector] chdir to cookie dir failed: ${err.message}`);
    process.exit(1);
}

console.log(`[collector] isolated process started`);
console.log(`[collector] key_id=${process.env.COLLECTOR_KEY_ID}`);
console.log(`[collector] cookie_dir=${COOKIE_DIR}`);

const { QrisMutasiProvider } = require('../payments/providers/QrisMutasiProvider');

const provider = new QrisMutasiProvider({
    email: process.env.QRIS_MERCHANT_EMAIL,
    password: process.env.QRIS_MERCHANT_PASSWORD,
    cookieDir: COOKIE_DIR,
    filter: process.env.QRIS_MUTATION_FILTER || '',
    lookbackDays: Number(process.env.QRIS_MUTATION_LOOKBACK_DAYS) || 1,
    timeZone: process.env.QRIS_MUTATION_TIME_ZONE || 'Asia/Jakarta',
    debug: ['1', 'true', 'yes', 'on'].includes(String(process.env.QRIS_MUTATION_DEBUG || '').toLowerCase()),
    allowedHosts: ['merchant.qris.online'],
});

const intervalMs = Math.max(5000, Number(process.env.COLLECTOR_INTERVAL_MS) || 15000);
const batchMax = Math.max(1, Math.min(100, Number(process.env.COLLECTOR_BATCH_MAX) || 50));
const maxConsecutiveErrors = Number(process.env.COLLECTOR_MAX_ERRORS) || 5;
const secret = String(process.env.COLLECTOR_HMAC_SECRET);
const keyId = String(process.env.COLLECTOR_KEY_ID);
const mainAppUrl = String(process.env.MAIN_APP_URL).replace(/\/$/, '');
const pepper = String(process.env.HASH_PEPPER);

let consecutiveErrors = 0;
let backoffMs = 0;
let totalSent = 0;
let totalMatched = 0;
let totalRejected = 0;
let stopped = false;

const { maskName, hashPayerId } = require('../payments/mutation-ingester');
const { computeWebhookEventHash } = require('../payments/payment-reconciler');

function sanitizeMutation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.direction !== 'IN') return null;
    if (raw.amount == null || !Number.isSafeInteger(Number(raw.amount)) || Number(raw.amount) <= 0) return null;
    if (!raw.transactedAt) return null;
    const transactedAt = new Date(raw.transactedAt);
    if (Number.isNaN(transactedAt.getTime())) return null;
    const validStatus = ['SUCCESS', 'PENDING', 'FAILED', 'UNKNOWN'];
    if (!validStatus.includes(String(raw.status || '').toUpperCase())) return null;
    return {
        provider: String(raw.provider || 'qris_merchant').slice(0, 40),
        providerMutationId: String(raw.providerMutationId || '').slice(0, 80),
        direction: 'IN',
        amount: Number(raw.amount),
        status: String(raw.status || 'SUCCESS').toUpperCase(),
        transactedAt: transactedAt.toISOString(),
        payerNameMasked: maskName(raw.payerName || ''),
        payerIdHash: raw.payerId ? hashPayerId(String(raw.payerId), pepper) : '',
        noteMasked: String(raw.note || '').slice(0, 80),
    };
}

async function sendBatch(mutations) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    const body = { mutations };
    const rawBody = JSON.stringify(body);
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${keyId}:${nonce}:${timestamp}:${rawBody}`)
        .digest('hex');

    const url = `${mainAppUrl}/api/payment/reconcile/mutation-batch`;
    const headers = {
        'content-type': 'application/json',
        'x-collector-key-id': keyId,
        'x-collector-timestamp': String(timestamp),
        'x-collector-nonce': nonce,
        'x-collector-signature': signature,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(url, { method: 'POST', headers, body: rawBody, signal: controller.signal });
        clearTimeout(timeoutId);
        const text = await res.text();
        return { status: res.status, body: text };
    } catch (err) {
        clearTimeout(timeoutId);
        throw new Error(`sendBatch failed: ${err.message}`);
    }
}

async function poll() {
    if (stopped) return;
    const now = Date.now();
    if (backoffMs > 0 && now - lastPollAt < backoffMs) return;

    try {
        const rawMutations = await provider.fetchLatestMutations();
        if (!Array.isArray(rawMutations)) throw new Error(`non-array mutations: ${typeof rawMutations}`);

        const sanitized = rawMutations.map(sanitizeMutation).filter(Boolean).slice(0, batchMax);
        if (sanitized.length === 0) {
            consecutiveErrors = 0;
            backoffMs = 0;
            lastPollAt = now;
            return;
        }

        const result = await sendBatch(sanitized);
        let parsed;
        try {
            parsed = JSON.parse(result.body);
        } catch (_) {
            throw new Error(`invalid response body (status ${result.status})`);
        }

        if (result.status >= 500) {
            throw new Error(`server error ${result.status}: ${parsed?.error || 'unknown'}`);
        }

        if (result.status === 401 || result.status === 503) {
            console.error(`[collector] auth/config error: ${result.status} ${parsed?.error || ''}`);
            consecutiveErrors++;
            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error('[collector] ALERT: max consecutive auth/config errors. Pausing 5 min.');
                backoffMs = 300000;
            }
            lastPollAt = now;
            return;
        }

        consecutiveErrors = 0;
        backoffMs = 0;
        totalSent += sanitized.length;
        totalMatched += parsed.matched || 0;
        totalRejected += parsed.duplicates || 0;

        if (parsed.matched > 0) {
            console.log(`[collector] matched ${parsed.matched} payment(s) (total: ${totalMatched})`);
        }
        if (parsed.ingested > 0) {
            console.log(`[collector] ingested ${parsed.ingested} new mutation(s), ${parsed.duplicates} duplicate(s)`);
        }
        lastPollAt = now;
    } catch (err) {
        consecutiveErrors++;
        backoffMs = Math.min(300000, (backoffMs || 5000) * 2);
        console.error(`[collector] poll error (${consecutiveErrors}/${maxConsecutiveErrors}): ${err.message}`);
        if (consecutiveErrors >= maxConsecutiveErrors) {
            console.error('[collector] ALERT: max consecutive errors. Extended backoff applied.');
        }
        lastPollAt = Date.now();
    }
}

let lastPollAt = 0;
poll();
const timer = setInterval(poll, intervalMs);
timer.unref?.();

function shutdown(signal) {
    console.log(`[collector] received ${signal}, shutting down`);
    stopped = true;
    clearInterval(timer);
    console.log(`[collector] stats: sent=${totalSent} matched=${totalMatched} rejected=${totalRejected}`);
    setTimeout(() => process.exit(0), 500).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
