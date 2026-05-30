const assert = require('assert');
const { isRegisteredUser } = require('../middleware/auth');

const db = {
    prepare(sql) {
        assert.match(sql, /FROM users/);
        return {
            get(id) {
                if (id === 1) return { password_hash: 'none' };
                if (id === 2) return { password_hash: '$2b$10$registeredHash' };
                if (id === 3) return { password_hash: '' };
                return null;
            },
        };
    },
};

assert.strictEqual(isRegisteredUser(db, 1), false, 'auto-guest users must not count as logged in');
assert.strictEqual(isRegisteredUser(db, 2), true, 'registered users must count as logged in');
assert.strictEqual(isRegisteredUser(db, 3), false, 'blank password hashes must not count as logged in');
assert.strictEqual(isRegisteredUser(db, 999), false, 'missing users must not count as logged in');
assert.strictEqual(isRegisteredUser(null, 2), false, 'missing database must not count as logged in');

console.log('Auth registered-user tests passed');
