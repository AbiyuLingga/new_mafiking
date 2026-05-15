require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const dbDir = path.join(__dirname, 'db');
fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations for existing local DBs copied from older Mafiking versions.
for (const migration of [
  "ALTER TABLE problems ADD COLUMN question_type TEXT DEFAULT 'open'",
  "ALTER TABLE problems ADD COLUMN mc_options TEXT DEFAULT '[]'",
  "ALTER TABLE problem_steps ADD COLUMN mistake_result TEXT DEFAULT ''",
  "ALTER TABLE problems ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "ALTER TABLE problems ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE problems ADD COLUMN question_text TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN fakultas TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN highest_streak INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN last_play_date DATE",
  "ALTER TABLE users ADD COLUMN badge_tier INTEGER DEFAULT 0",
  "ALTER TABLE chapters ADD COLUMN mapel TEXT DEFAULT 'Matematika'",
  "ALTER TABLE chapters ADD COLUMN semester INTEGER DEFAULT 1",
  "ALTER TABLE chapters ADD COLUMN description TEXT DEFAULT ''",
  "ALTER TABLE chapters ADD COLUMN est TEXT DEFAULT ''",
  "ALTER TABLE chapters ADD COLUMN topics TEXT DEFAULT '[]'"
]) {
  try {
    db.exec(migration);
  } catch (_) {
    // Column already exists.
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS correction_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id INTEGER REFERENCES problems(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'canvas',
  question_text TEXT NOT NULL DEFAULT '',
  expected_answer TEXT NOT NULL DEFAULT '',
  detected_answer_text TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',
  strength_tags TEXT NOT NULL DEFAULT '[]',
  weakness_tags TEXT NOT NULL DEFAULT '[]',
  evaluation_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.locals.db = db;
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://unpkg.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET wajib diset di .env untuk production.');
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'new-mafiking-local-dev-only',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'strict'
  }
}));

app.get('/api/health', (_req, res) => {
  const counts = {
    chapters: db.prepare('SELECT COUNT(*) AS count FROM chapters').get().count,
    problems: db.prepare('SELECT COUNT(*) AS count FROM problems').get().count
  };
  res.json({ ok: true, service: 'new-mafiking', counts });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Terlalu banyak percobaan registrasi. Coba lagi dalam 1 jam.' },
  standardHeaders: true,
  legacyHeaders: false
});
const correctionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { error: 'Terlalu banyak request koreksi. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/correction', correctionLimiter);

// Hapus guest user yang tidak pernah login lebih dari 7 hari, tiap 24 jam
setInterval(() => {
  try {
    const result = db.prepare(
      "DELETE FROM users WHERE password_hash = 'none' AND (last_active IS NULL OR last_active < date('now', '-7 days'))"
    ).run();
    if (result.changes > 0) console.log(`[cleanup] Hapus ${result.changes} guest user lama.`);
  } catch (e) {
    console.error('[cleanup] Guest cleanup error:', e);
  }
}, 24 * 60 * 60 * 1000);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path === '/api/health' || req.path === '/api/payment/callback') return next();
  if (req.session.userId) return next();

  const guestName = `Tamu_${Math.floor(Math.random() * 10000)}`;
  try {
    const info = db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'none', ?, 'user')"
    ).run(guestName, guestName);
    req.session.userId = Number(info.lastInsertRowid);
    req.session.role = 'user';
  } catch (error) {
    console.error('Auto-guest error:', error);
  }
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/admin/import', require('./routes/admin-import'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/correction', require('./routes/correction'));

const staticCache = {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'text/babel; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
  }
};

app.use('/assets', express.static(path.join(__dirname, 'assets'), staticCache));
app.use('/src', express.static(path.join(__dirname, 'src'), staticCache));
app.get('/SOP-DEEPSEEK-IMPORT-SOAL.md', (req, res) => {
  if (!req.session?.role || req.session.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }
  res.type('text/markdown; charset=utf-8').sendFile(path.join(__dirname, 'SOP-DEEPSEEK-IMPORT-SOAL.md'));
});
app.get('/tweaks-panel.jsx', (_req, res) => {
  res.type('text/babel').sendFile(path.join(__dirname, 'tweaks-panel.jsx'));
});

const appHtmlPath = path.join(__dirname, 'MAFIKING.html');
app.get(['/', '/index.html', '/MAFIKING.html'], (_req, res) => {
  res.sendFile(appHtmlPath);
});
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(appHtmlPath);
});

app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(err.status || 500).json({
    error: isProduction ? 'Terjadi kesalahan server' : err.message
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`new_mafiking server running on http://0.0.0.0:${PORT}`);
});
