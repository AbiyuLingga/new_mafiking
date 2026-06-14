const assert = require('assert');
const { isRegisteredUser } = require('../../server/middleware/auth');

const db = {
    prepare(sql) {
        assert.match(sql, /FROM users/);
        return {
            get(id) {
                if (id === 1) return { password_hash: 'none', clerk_id: null, auth_provider: 'local' };
                if (id === 2) return { password_hash: '$2b$10$registeredHash', clerk_id: null, auth_provider: 'local' };
                if (id === 3) return { password_hash: '', clerk_id: null, auth_provider: 'local' };
                if (id === 4) return { password_hash: 'clerk', clerk_id: 'user_clerk_123', auth_provider: 'clerk' };
                if (id === 5) return { password_hash: 'clerk', clerk_id: 'user_linked_123', auth_provider: 'linked' };
                if (id === 6) return { password_hash: 'none', clerk_id: '', auth_provider: 'clerk' };
                if (id === 7) return { password_hash: 'none', clerk_id: 'user_legacy_clerk_123', auth_provider: 'clerk' };
                return null;
            },
        };
    },
};

assert.strictEqual(isRegisteredUser(db, 1), false, 'auto-guest users must not count as logged in');
assert.strictEqual(isRegisteredUser(db, 2), true, 'registered users must count as logged in');
assert.strictEqual(isRegisteredUser(db, 3), false, 'blank password hashes must not count as logged in');
assert.strictEqual(isRegisteredUser(db, 4), true, 'Clerk users must count as logged in with the Clerk password marker');
assert.strictEqual(isRegisteredUser(db, 5), true, 'linked Clerk users must count as logged in');
assert.strictEqual(isRegisteredUser(db, 6), false, 'Clerk provider without clerk_id must not count as logged in');
assert.strictEqual(isRegisteredUser(db, 7), true, 'legacy Clerk users must still count as logged in before migration runs');
assert.strictEqual(isRegisteredUser(db, 999), false, 'missing users must not count as logged in');
assert.strictEqual(isRegisteredUser(null, 2), false, 'missing database must not count as logged in');

console.log('Auth registered-user tests passed');
