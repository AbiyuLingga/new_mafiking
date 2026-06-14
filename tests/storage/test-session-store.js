const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  SQLiteSessionStore,
  expiresAtFromSession,
} = require('../../lib/sqlite-session-store');

function callStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafiking-session-store-'));
  const dbPath = path.join(tempDir, 'session.sqlite');
  const db = new Database(dbPath);
  const store = new SQLiteSessionStore({
    db,
    ttlMs: 60_000,
    pruneIntervalMs: 60_000,
  });

  try {
    const expires = new Date(Date.now() + 30_000);
    assert.equal(
      expiresAtFromSession({ cookie: { expires } }, 60_000),
      expires.getTime(),
      'cookie expiry is honored',
    );

    await callStore(store, 'set', 'sid-1', {
      cookie: { expires },
      userId: 42,
      role: 'admin',
    });

    const persisted = await callStore(store, 'get', 'sid-1');
    assert.equal(persisted.userId, 42, 'session data persisted');
    assert.equal(persisted.role, 'admin', 'session role persisted');

    const secondStore = new SQLiteSessionStore({
      db,
      ttlMs: 60_000,
      pruneIntervalMs: 60_000,
    });
    const fromSecondStore = await callStore(secondStore, 'get', 'sid-1');
    assert.equal(fromSecondStore.userId, 42, 'session survives store re-instantiation');
    secondStore.close();

    await callStore(store, 'touch', 'sid-1', {
      cookie: { expires: new Date(Date.now() + 120_000) },
      userId: 42,
    });
    const touched = db.prepare('SELECT expires_at FROM sessions WHERE sid = ?').get('sid-1');
    assert.ok(touched.expires_at > expires.getTime(), 'touch extends expiry');

    await callStore(store, 'set', 'sid-expired', {
      cookie: { expires: new Date(Date.now() - 1_000) },
      userId: 99,
    });
    const expired = await callStore(store, 'get', 'sid-expired');
    assert.equal(expired, null, 'expired session returns null');

    await callStore(store, 'destroy', 'sid-1');
    const destroyed = await callStore(store, 'get', 'sid-1');
    assert.equal(destroyed, null, 'destroy removes session');

    console.log('SQLite session store tests passed');
  } finally {
    store.close();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error('SQLite session store tests failed:', error);
  process.exit(1);
});
