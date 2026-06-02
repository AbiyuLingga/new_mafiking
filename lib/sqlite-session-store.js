const session = require('express-session');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function expiresAtFromSession(sess, ttlMs) {
  const cookieExpires = sess?.cookie?.expires;
  const expiresAt = cookieExpires ? new Date(cookieExpires).getTime() : Date.now() + ttlMs;
  return Number.isFinite(expiresAt) ? expiresAt : Date.now() + ttlMs;
}

class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    if (!options.db) throw new Error('SQLiteSessionStore requires a better-sqlite3 db instance.');

    this.db = options.db;
    this.ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
    this.tableName = options.tableName || 'sessions';
    this.pruneIntervalMs = Number(options.pruneIntervalMs) > 0
      ? Number(options.pruneIntervalMs)
      : 60 * 60 * 1000;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires_at
        ON ${this.tableName} (expires_at);
    `);

    this.statements = {
      get: this.db.prepare(`SELECT sess, expires_at FROM ${this.tableName} WHERE sid = ?`),
      set: this.db.prepare(`
        INSERT INTO ${this.tableName} (sid, sess, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
      `),
      destroy: this.db.prepare(`DELETE FROM ${this.tableName} WHERE sid = ?`),
      touch: this.db.prepare(`UPDATE ${this.tableName} SET expires_at = ? WHERE sid = ?`),
      prune: this.db.prepare(`DELETE FROM ${this.tableName} WHERE expires_at <= ?`),
    };

    this.pruneExpired();
    this.pruneTimer = setInterval(() => this.pruneExpired(), this.pruneIntervalMs);
    if (typeof this.pruneTimer.unref === 'function') this.pruneTimer.unref();
  }

  get(sid, callback) {
    try {
      const row = this.statements.get.get(sid);
      if (!row) return callback(null, null);
      if (Number(row.expires_at) <= Date.now()) {
        this.statements.destroy.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expiresAt = expiresAtFromSession(sess, this.ttlMs);
      this.statements.set.run(sid, JSON.stringify(sess), expiresAt);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.statements.destroy.run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expiresAt = expiresAtFromSession(sess, this.ttlMs);
      this.statements.touch.run(expiresAt, sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  pruneExpired(now = Date.now()) {
    return this.statements.prune.run(now).changes;
  }

  close() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
  }
}

module.exports = {
  DEFAULT_TTL_MS,
  SQLiteSessionStore,
  expiresAtFromSession,
};
