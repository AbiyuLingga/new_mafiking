const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
    handleMutasikuWebhook,
    mutationEventToCandidate,
    pollMutasiku,
    reconcileMutasikuCandidate,
    signMutasikuData,
    verifyMutasikuSignature,
} = require('../lib/reconcilers/mutasiku');

function setupDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
    db.prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (1, 'student@example.com', 'hash', 'Student', 'user')").run();
    return db;
}

function insertPending(db, { orderId, amount, fullAmount = amount, expiresAt = '2099-06-08 20:30:00' }) {
    db.prepare(`
        INSERT INTO payments (
            user_id, merchant_order_id, amount, product_details, email, status,
            qris_base_amount, qris_suffix, qris_full_amount, expires_at
        ) VALUES (1, ?, ?, 'Paket QRIS Lokal Murah', 'student@example.com', 'PENDING', ?, ?, ?, ?)
    `).run(orderId, fullAmount, amount, fullAmount - amount, fullAmount, expiresAt);
}

async function main() {
    const secret = 'mutasiku-secret';
    const payload = {
        type: 'mutations.created',
        data: {
            id: 'mut-1',
            amount: 502,
            type: 'CREDIT',
            status: 'SUCCESS',
            description: 'QRIS payment',
            createdAt: '2026-06-08T13:00:00.000Z',
        },
    };
    const signature = signMutasikuData(secret, payload.data);

    assert.equal(verifyMutasikuSignature({ secret, data: payload.data, signature }), true);
    assert.equal(verifyMutasikuSignature({ secret, data: payload.data, signature: 'bad' }), false);

    assert.deepStrictEqual(
        mutationEventToCandidate(payload),
        {
            amount: 502,
            merchantOrderId: '',
            sourceId: 'mut-1',
            sourceType: 'mutations.created',
            raw: payload,
        }
    );
    assert.equal(mutationEventToCandidate({ type: 'mutations.created', data: { amount: 502, type: 'DEBIT' } }), null);

    const db = setupDb();
    insertPending(db, { orderId: 'MFK-1-502', amount: 501, fullAmount: 502 });
    const result = handleMutasikuWebhook(db, payload, { signature, secret });
    assert.equal(result.ok, true);
    assert.equal(result.merchantOrderId, 'MFK-1-502');
    assert.equal(db.prepare("SELECT status FROM payments WHERE merchant_order_id = 'MFK-1-502'").get().status, 'SUCCESS');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_access_grants WHERE user_id = 1').get().count, 1);

    assert.throws(
        () => handleMutasikuWebhook(db, payload, { signature: 'bad', secret }),
        /Signature Mutasiku tidak valid/
    );
    db.close();

    const ambiguousDb = setupDb();
    insertPending(ambiguousDb, { orderId: 'MFK-AMB-1', amount: 501, fullAmount: 502 });
    insertPending(ambiguousDb, { orderId: 'MFK-AMB-2', amount: 501, fullAmount: 502 });
    const ambiguous = reconcileMutasikuCandidate(ambiguousDb, mutationEventToCandidate(payload), {
        now: new Date('2026-06-08T13:00:00.000Z'),
    });
    assert.equal(ambiguous.skipped, true);
    assert.equal(ambiguous.reason, 'ambiguous_amount');
    assert.equal(ambiguousDb.prepare("SELECT COUNT(*) AS count FROM payments WHERE status = 'SUCCESS'").get().count, 0);
    ambiguousDb.close();

    const orderDb = setupDb();
    insertPending(orderDb, { orderId: 'MFK-ORDER-ID', amount: 501, fullAmount: 502 });
    const orderPayload = {
        type: 'payment.completed',
        data: {
            id: 'pay-1',
            orderId: 'MFK-ORDER-ID',
            amount: 502,
            status: 'COMPLETED',
            transaction: { id: 'txn-1', amount: 502 },
        },
    };
    const orderResult = handleMutasikuWebhook(orderDb, orderPayload, {
        signature: signMutasikuData(secret, orderPayload.data),
        secret,
    });
    assert.equal(orderResult.ok, true);
    assert.equal(orderDb.prepare("SELECT status FROM payments WHERE merchant_order_id = 'MFK-ORDER-ID'").get().status, 'SUCCESS');
    orderDb.close();

    const pollDb = setupDb();
    insertPending(pollDb, { orderId: 'MFK-POLL', amount: 701, fullAmount: 702 });
    const polled = await pollMutasiku(pollDb, {
        MUTASIKU_API_KEY: 'key',
        MUTASIKU_BASE_URL: 'https://mutasiku.test/api/v1',
        MUTASIKU_POLL_START_DATE: '2026-06-08',
        MUTASIKU_POLL_END_DATE: '2026-06-08',
    }, {
        client: {
            async get(url, options) {
                assert.equal(url, 'https://mutasiku.test/api/v1/mutations');
                assert.equal(options.headers['x-api-key'], 'key');
                assert.equal(options.params.type, 'CREDIT');
                return {
                    data: {
                        status: 'success',
                        data: [
                            { id: 'mut-poll', amount: 702, type: 'CREDIT', status: 'SUCCESS' },
                        ],
                    },
                };
            },
        },
    });
    assert.equal(polled.ok, true);
    assert.equal(polled.checked, 1);
    assert.equal(pollDb.prepare("SELECT status FROM payments WHERE merchant_order_id = 'MFK-POLL'").get().status, 'SUCCESS');
    pollDb.close();

    console.log('Mutasiku reconciler tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
