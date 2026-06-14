#!/usr/bin/env node
// Test cleanup: ensure no Duitku/Midtrans/Mutasiku dead code remains.
// Run from project root: node tests/payment/test-cleanup-deps.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function ok(name) {
    console.log(`✓ ${name}`);
    passed += 1;
}

function fail(name, detail) {
    console.log(`✗ ${name}: ${detail}`);
    failed += 1;
}

function fileExists(p) {
    try {
        return fs.existsSync(p);
    } catch (_) {
        return false;
    }
}

function readFile(p) {
    return fs.readFileSync(p, 'utf8');
}

function grepInFile(p, pattern, expectedCount) {
    const text = readFile(p);
    const matches = text.match(pattern);
    const count = matches ? matches.length : 0;
    return { count, text };
}

function grepInTree(root, pattern, includeExt = ['.js', '.jsx', '.json']) {
    const results = [];
    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (includeExt.includes(path.extname(entry.name))) {
                const text = readFile(full);
                const matches = text.match(pattern);
                if (matches && matches.length > 0) {
                    results.push({ file: full, count: matches.length });
                }
            }
        }
    }
    walk(root);
    return results;
}

// 1. lib/reconcilers/mutasiku.js tidak ada
const mutasikuFile = path.join(projectRoot, 'lib', 'reconcilers', 'mutasiku.js');
if (!fileExists(mutasikuFile)) {
    ok('lib/reconcilers/mutasiku.js dihapus');
} else {
    fail('lib/reconcilers/mutasiku.js masih ada', mutasikuFile);
}

// 2. routes/payment.js tidak ada import Mutasiku
const paymentJs = path.join(projectRoot, 'routes', 'payment.js');
if (fileExists(paymentJs)) {
    const { count } = grepInFile(paymentJs, /handleMutasikuWebhook|lib\/reconcilers\/mutasiku/g);
    if (count === 0) {
        ok('routes/payment.js tidak import Mutasiku');
    } else {
        fail('routes/payment.js masih import Mutasiku', `count=${count}`);
    }
}

// 3. routes/payment.js tidak ada string duitku/Duitku/DUITKU_
if (fileExists(paymentJs)) {
    const { count } = grepInFile(paymentJs, /duitku|Duitku|DUITKU_/g);
    if (count === 0) {
        ok('routes/payment.js tidak ada referensi Duitku');
    } else {
        fail('routes/payment.js masih ada referensi Duitku', `count=${count}`);
    }
}

// 4. routes/payment.js tidak ada /callback (Duitku callback)
if (fileExists(paymentJs)) {
    const { count } = grepInFile(paymentJs, /router\.post\(['"]\/callback['"]/g);
    if (count === 0) {
        ok('routes/payment.js tidak ada route /callback (Duitku)');
    } else {
        fail('routes/payment.js masih ada /callback route', `count=${count}`);
    }
}

// 5. server.js tidak startMutasikuPoller
const serverJs = path.join(projectRoot, 'server.js');
if (fileExists(serverJs)) {
    const { count } = grepInFile(serverJs, /startMutasikuPoller|lib\/reconcilers\/mutasiku/g);
    if (count === 0) {
        ok('server.js tidak ada Mutasiku poller');
    } else {
        fail('server.js masih ada Mutasiku', `count=${count}`);
    }
}

// 6. .env.example tidak ada DUITKU_* dan MUTASIKU_*
const envExample = path.join(projectRoot, '.env.example');
if (fileExists(envExample)) {
    const text = readFile(envExample);
    const duitkuVars = text.match(/^DUITKU_/gm) || [];
    const mutasikuVars = text.match(/^MUTASIKU_/gm) || [];
    if (duitkuVars.length === 0 && mutasikuVars.length === 0) {
        ok('.env.example tidak ada DUITKU_* / MUTASIKU_*');
    } else {
        fail('.env.example masih ada env var Duitku/Mutasiku', `duitku=${duitkuVars.length} mutasiku=${mutasikuVars.length}`);
    }
}

// 7. Tidak ada referensi midtrans di src/, routes/, lib/, scripts/ (excluding test-cleanup-deps.js sendiri)
const midtransHits = grepInTree(projectRoot, /midtrans|Midtrans|MIDTRANS_/g)
    .filter((hit) => !hit.file.endsWith('test-cleanup-deps.js'));
if (midtransHits.length === 0) {
    ok('Tidak ada referensi midtrans di codebase');
} else {
    fail('Masih ada referensi midtrans', JSON.stringify(midtransHits));
}

// 8. .env.example punya MUTATION_COLLECTOR_ENABLED=true
if (fileExists(envExample)) {
    const text = readFile(envExample);
    const enabledMatch = text.match(/^MUTATION_COLLECTOR_ENABLED=true/gm);
    if (enabledMatch && enabledMatch.length > 0) {
        ok('MUTATION_COLLECTOR_ENABLED=true di .env.example (default ON)');
    } else {
        fail('MUTATION_COLLECTOR_ENABLED belum di-set true', '.env.example');
    }
}

// Summary
console.log('');
console.log(`Total: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
process.exit(0);
