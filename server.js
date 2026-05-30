const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

const envResult = dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });
if (envResult.parsed) {
  for (const [key, value] of Object.entries(envResult.parsed)) {
    if (process.env[key] === undefined || String(process.env[key]).trim() === '') {
      process.env[key] = value;
    }
  }
}

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
  "ALTER TABLE chapters ADD COLUMN topics TEXT DEFAULT '[]'",
  "ALTER TABLE daily_missions ADD COLUMN release_date TEXT DEFAULT ''",
  "ALTER TABLE ai_token_usage ADD COLUMN tokens_used INTEGER DEFAULT 0",
  "ALTER TABLE ai_token_usage ADD COLUMN created_at DATETIME",
  `CREATE TABLE IF NOT EXISTS landing_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot TEXT UNIQUE NOT NULL,
    media_type TEXT NOT NULL,
    url TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    size_bytes INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
]) {
  try {
    db.exec(migration);
  } catch (_) {
    // Column already exists.
  }
}

try {
  db.exec(`
    UPDATE ai_token_usage
    SET tokens_used = COALESCE(tokens_used, total_tokens, 0)
    WHERE tokens_used IS NULL OR tokens_used = 0
  `);
} catch (_) {
  try {
    db.exec(`
      UPDATE ai_token_usage
      SET tokens_used = COALESCE(tokens_used, 0)
      WHERE tokens_used IS NULL
    `);
  } catch (_) {}
}

try {
  db.exec(`
    UPDATE ai_token_usage
    SET created_at = COALESCE(created_at, used_at, CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR created_at = ''
  `);
} catch (_) {
  try {
    db.exec(`
      UPDATE ai_token_usage
      SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
      WHERE created_at IS NULL OR created_at = ''
    `);
  } catch (_) {}
}

try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_token_usage_provider_key_created ON ai_token_usage (provider, key_name, created_at)');
} catch (_) {}

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

db.exec(`
CREATE TABLE IF NOT EXISTS practice_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id INTEGER REFERENCES problems(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'choice',
  correct INTEGER NOT NULL DEFAULT 0,
  selected_answer TEXT NOT NULL DEFAULT '',
  correct_answer TEXT NOT NULL DEFAULT '',
  selected_choice_index INTEGER,
  correct_choice_index INTEGER,
  hints_used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`
CREATE TABLE IF NOT EXISTS profile_ai_refreshes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_ai_refresh_at DATETIME NOT NULL
)`);

db.exec(`
CREATE TABLE IF NOT EXISTS daily_missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day INTEGER NOT NULL DEFAULT 1,
  date_label TEXT NOT NULL DEFAULT '',
  short_label TEXT NOT NULL DEFAULT '',
  release_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'locked',
  mapel TEXT NOT NULL DEFAULT '?',
  target TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  xp INTEGER NOT NULL DEFAULT 150,
  week_label TEXT DEFAULT 'Pekan 1',
  sort_order INTEGER DEFAULT 0
)`);

db.exec(`
CREATE TABLE IF NOT EXISTS tryout_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT 'Gratis',
  original_price TEXT DEFAULT NULL,
  badge TEXT DEFAULT '',
  duration TEXT DEFAULT '60 mnt',
  questions INTEGER DEFAULT 30,
  features TEXT DEFAULT '[]',
  tone TEXT DEFAULT 'default',
  sort_order INTEGER DEFAULT 0
)`);

// Seed default missions if table is empty
if (db.prepare('SELECT COUNT(*) as n FROM daily_missions').get().n === 0) {
  const ins = db.prepare('INSERT INTO daily_missions (day, date_label, short_label, release_date, status, mapel, target, question, xp, week_label, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  [
    [1,'Sen · 12 Mei','Sen','2026-05-12','completed','Matematika','Kalkulus Harian','Tentukan hasil dari ∫₀² 3x² dx.',150,'Pekan 19',1],
    [2,'Sel · 13 Mei','Sel','2026-05-13','active','Kimia','Stoikiometri Harian','Setarakan persamaan reaksi redoks berikut: MnO₄⁻ + Fe²⁺ → Mn²⁺ + Fe³⁺ dalam suasana asam.',200,'Pekan 19',2],
    [3,'Rab · 14 Mei','Rab','2026-05-14','locked','?','Misi Rahasia','Terbuka 14 Mei.',150,'Pekan 19',3],
    [4,'Kam · 15 Mei','Kam','2026-05-15','locked','?','Misi Rahasia','Terbuka 15 Mei.',200,'Pekan 19',4],
    [5,'Jum · 16 Mei','Jum','2026-05-16','locked','?','Misi Rahasia','Terbuka 16 Mei.',150,'Pekan 19',5],
  ].forEach(r => ins.run(...r));
}

// Seed default tryout packages if table is empty
if (db.prepare('SELECT COUNT(*) as n FROM tryout_packages').get().n === 0) {
  const ins = db.prepare('INSERT INTO tryout_packages (title, description, price, original_price, badge, duration, questions, features, tone, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
  [
    ['Tryout Bundling: Semester 1','Evaluasi lengkap Matematika, Fisika, dan Kimia untuk persiapan UAS.','Rp 50.000',null,'Populer','180 mnt',90,JSON.stringify(['3 Mata pelajaran dasar','Sistem CBT seperti UAS','Analisis butir soal AI','Pembahasan video eksklusif']),'default',1],
    ['Tryout Premium: TPB Prep','Simulasi TPB ITB tingkat tinggi dengan arsip soal 5 tahun terakhir.','Rp 100.000','Rp 150.000','Terlengkap','240 mnt',120,JSON.stringify(['Prediksi akurasi tinggi','Konsultasi Zoom mentor','Skoring adaptif IRT','Sertifikat pencapaian']),'feature',2],
    ['Tryout Gratis: Bab 1-2','Coba sistem CBT kami secara gratis untuk Kalkulus Dasar.','Gratis',null,'Promo','60 mnt',30,JSON.stringify(['1 mata pelajaran','Hasil keluar instan','Pembahasan teks dasar']),'default',3],
  ].forEach(r => ins.run(...r));
}

ensureFixedAdminUser(db);

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
  if (req.path === '/api/health' || req.path === '/api/payment/callback' || req.path === '/api/landing-media') return next();
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

function currentJakartaDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function isReleasedMission(row, today = currentJakartaDate()) {
  const releaseDate = String(row.release_date || '').trim();
  if (!releaseDate) return row.status !== 'locked';
  return releaseDate <= today;
}

function effectiveMissionStatus(row, released) {
  if (row.status === 'completed') return 'completed';
  if (released) return 'active';
  return 'locked';
}

function canReadMissionDrafts(req) {
  if (req.session && req.session.role === 'admin') return true;
  if (isProduction || process.env.LOCAL_ADMIN_MODE === 'false') return false;
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidates = [req.ip, req.socket && req.socket.remoteAddress, forwardedFor].filter(Boolean);
  return candidates.some((value) => (
    value === '127.0.0.1' ||
    value === '::1' ||
    value === '::ffff:127.0.0.1'
  ));
}

function serializeMissionForViewer(row, { canSeeDrafts = false } = {}) {
  const released = isReleasedMission(row);
  const effectiveStatus = effectiveMissionStatus(row, released);
  if (canSeeDrafts) {
    return {
      ...row,
      effective_status: effectiveStatus,
      is_released: released,
    };
  }
  if (released || row.status === 'completed') {
    return {
      ...row,
      status: effectiveStatus,
      effective_status: effectiveStatus,
      is_released: released,
    };
  }
  return {
    ...row,
    mapel: '?',
    question: '',
    status: 'locked',
    effective_status: 'locked',
    is_released: false,
  };
}

app.get('/api/missions', (req, res) => {
  try {
    const wantsAdmin = req.query.admin === '1';
    const canSeeDrafts = wantsAdmin && canReadMissionDrafts(req);
    const rows = db.prepare('SELECT * FROM daily_missions ORDER BY sort_order, day').all();
    res.json(rows.map((row) => serializeMissionForViewer(row, { canSeeDrafts })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tryout-packages', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM tryout_packages ORDER BY sort_order, id').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/landing-media', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT slot, media_type, url, original_name, mime_type, size_bytes, updated_at
      FROM landing_media
      ORDER BY slot
    `).all();
    res.json(rows.reduce((acc, row) => {
      acc[row.slot] = row;
      return acc;
    }, {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.use('/api/progress', require('./routes/progress'));
app.use('/api/admin/import', require('./routes/admin-import'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/correction', require('./routes/correction'));

const staticCache = {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx') || filePath.endsWith('styles.css')) {
      res.setHeader('Content-Type', 'text/babel; charset=utf-8');
      if (filePath.endsWith('styles.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
  }
};

app.use('/assets', express.static(path.join(__dirname, 'assets'), staticCache));
app.use('/video', express.static(path.join(__dirname, 'assets'), staticCache));
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
app.get(['/syarat-ketentuan.html', '/terms.html', '/tnc.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'syarat-ketentuan.html'));
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

function ensureFixedAdminUser(database) {
  const username = '123';
  const passwordHash = bcrypt.hashSync('135', 10);
  const existing = database.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    database.prepare(
      "UPDATE users SET password_hash = ?, display_name = 'Admin 123', role = 'admin' WHERE id = ?"
    ).run(passwordHash, existing.id);
    return;
  }
  database.prepare(
    "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, 'Admin 123', 'admin')"
  ).run(username, passwordHash);
}
