const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

function loadEnvFile(fileName) {
  const envResult = dotenv.config({ path: path.join(__dirname, fileName), quiet: true });
  if (envResult.parsed) {
    for (const [key, value] of Object.entries(envResult.parsed)) {
      if (process.env[key] === undefined || String(process.env[key]).trim() === '') {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

let clerkMiddleware = null;
try {
  ({ clerkMiddleware } = require('@clerk/express'));
} catch (_) {
  // Clerk is optional in local development.
}

const app = express();
const webhookRoutes = require('./routes/webhooks');
const { isLocalAdminMode } = require('./middleware/admin');
const {
  createPerformanceStore,
  normalizeClientErrorPayload,
  normalizeVitalsPayload,
  setPublicApiCache,
  shouldLogRequestTiming,
} = require('./lib/performance');
const { createRequestGuard } = require('./lib/request-guard');
const { helmetCspOptions } = require('./lib/csp');
const { createCsrfProtection } = require('./lib/csrf-protection');
const { SQLiteSessionStore } = require('./lib/sqlite-session-store');
const { createCanaryMiddleware } = require('./lib/canary');
const { startExpirySweeper } = require('./lib/payment-expiry-sweeper');
const { startMutasikuPoller } = require('./lib/reconcilers/mutasiku');
const {
  areTryoutPackagesEnabled,
  ensureDefaultAppSettings,
} = require('./lib/app-settings');
const auditLog = require('./lib/audit-log');
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const distDir = path.join(__dirname, 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const legacyAppHtmlPath = path.join(__dirname, 'MAFIKING.html');
const oneDaySeconds = 60 * 60 * 24;
const oneWeekSeconds = oneDaySeconds * 7;
const oneYearSeconds = oneDaySeconds * 365;

const dbDir = path.join(__dirname, 'db');
fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Existing databases need these columns before schema.sql creates indexes that use them.
const preSchemaMigrations = [
  ['user_access_grants', 'payment_merchant_order_id', 'ALTER TABLE user_access_grants ADD COLUMN payment_merchant_order_id TEXT'],
  ['user_access_grants', 'revoked', 'ALTER TABLE user_access_grants ADD COLUMN revoked INTEGER DEFAULT NULL'],
];

for (const [tableName, columnName, sql] of preSchemaMigrations) {
  const tableExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(tableName);
  if (!tableExists) continue;

  const columnExists = db.prepare(`PRAGMA table_info("${tableName}")`).all()
    .some((column) => column.name === columnName);
  if (!columnExists) db.exec(sql);
}

const incomingMutationsExists = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'incoming_mutations'",
).get();
if (incomingMutationsExists) {
  // Preserve historical duplicate rows, but only the earliest row keeps the provider event ID.
  db.exec(`
    UPDATE incoming_mutations
    SET provider_mutation_id = NULL
    WHERE provider_mutation_id IS NOT NULL
      AND provider_mutation_id != ''
      AND id NOT IN (
        SELECT MIN(id)
        FROM incoming_mutations
        WHERE provider_mutation_id IS NOT NULL
          AND provider_mutation_id != ''
        GROUP BY provider, provider_mutation_id
      )
  `);
}

const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations for existing local DBs copied from older Mafiking versions.
for (const migration of [
  "ALTER TABLE problems ADD COLUMN question_type TEXT DEFAULT 'open'",
  "ALTER TABLE problems ADD COLUMN mc_options TEXT DEFAULT '[]'",
  "ALTER TABLE problems ADD COLUMN image_url TEXT DEFAULT ''",
  "ALTER TABLE problems ADD COLUMN image_alt TEXT DEFAULT ''",
  "ALTER TABLE problem_steps ADD COLUMN mistake_result TEXT DEFAULT ''",
  "ALTER TABLE problem_steps ADD COLUMN hint TEXT DEFAULT ''",
  "ALTER TABLE problem_steps ADD COLUMN hintPlain TEXT DEFAULT ''",
  "ALTER TABLE problem_steps ADD COLUMN hintLatex TEXT DEFAULT ''",
  "ALTER TABLE problems ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "ALTER TABLE problems ADD COLUMN created_at DATETIME",
  "ALTER TABLE problems ADD COLUMN question_text TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN fakultas TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN phone_number TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN semester INTEGER",
  "ALTER TABLE users ADD COLUMN jurusan TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN mapel_prioritas TEXT DEFAULT '[]'",
  "ALTER TABLE users ADD COLUMN referral_source TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN onboarding_completed_at DATETIME",
  "ALTER TABLE users ADD COLUMN highest_streak INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN last_play_date DATE",
  "ALTER TABLE users ADD COLUMN badge_tier INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN clerk_id TEXT",
  "ALTER TABLE users ADD COLUMN email TEXT",
  "ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'",
  "ALTER TABLE users ADD COLUMN email_verified_at DATETIME",
  "ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT",
  "ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME",
  "ALTER TABLE users ADD COLUMN email_verification_last_sent_at DATETIME",
  "ALTER TABLE chapters ADD COLUMN mapel TEXT DEFAULT 'Matematika'",
  "ALTER TABLE chapters ADD COLUMN semester INTEGER DEFAULT 1",
  "ALTER TABLE chapters ADD COLUMN description TEXT DEFAULT ''",
  "ALTER TABLE chapters ADD COLUMN est TEXT DEFAULT ''",
  "ALTER TABLE chapters ADD COLUMN topics TEXT DEFAULT '[]'",
  "ALTER TABLE chapters ADD COLUMN is_hidden INTEGER DEFAULT 0",
  "ALTER TABLE daily_missions ADD COLUMN release_date TEXT DEFAULT ''",
  "ALTER TABLE daily_missions ADD COLUMN image_url TEXT DEFAULT ''",
  "ALTER TABLE daily_missions ADD COLUMN image_alt TEXT DEFAULT ''",
  "ALTER TABLE daily_missions ADD COLUMN question_type TEXT DEFAULT 'open'",
  "ALTER TABLE daily_missions ADD COLUMN mc_options TEXT DEFAULT '[]'",
  "ALTER TABLE daily_missions ADD COLUMN acceptable_answers TEXT DEFAULT '[]'",
  "ALTER TABLE daily_missions ADD COLUMN hint TEXT DEFAULT ''",
  "ALTER TABLE daily_missions ADD COLUMN hintPlain TEXT DEFAULT ''",
  "ALTER TABLE daily_missions ADD COLUMN hintLatex TEXT DEFAULT ''",
  "ALTER TABLE ai_token_usage ADD COLUMN tokens_used INTEGER DEFAULT 0",
  "ALTER TABLE ai_token_usage ADD COLUMN created_at DATETIME",
  "ALTER TABLE tryout_packages ADD COLUMN tryout_id TEXT DEFAULT ''",
  "ALTER TABLE payments ADD COLUMN qris_base_amount INTEGER",
  "ALTER TABLE payments ADD COLUMN qris_suffix INTEGER",
  "ALTER TABLE payments ADD COLUMN qris_full_amount INTEGER",
  "ALTER TABLE payments ADD COLUMN qris_dynamic_string TEXT",
  "ALTER TABLE payments ADD COLUMN qris_image_data_url TEXT",
  "ALTER TABLE payments ADD COLUMN expires_at DATETIME",
  "ALTER TABLE payments ADD COLUMN paid_at DATETIME",
  "ALTER TABLE payments ADD COLUMN reconciled_via TEXT",
  "ALTER TABLE payments ADD COLUMN reconciled_by INTEGER REFERENCES users(id)",
  "ALTER TABLE payments ADD COLUMN webhook_secret_hash TEXT",
  "CREATE INDEX IF NOT EXISTS idx_tryout_packages_tryout_id ON tryout_packages (tryout_id)",
  `CREATE TABLE IF NOT EXISTS qris_suffix_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_amount INTEGER NOT NULL,
    suffix INTEGER NOT NULL,
    merchant_order_id TEXT UNIQUE NOT NULL,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    released_at DATETIME
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_qris_suffix_locks_active_unique
    ON qris_suffix_locks(base_amount, suffix)
    WHERE released_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_qris_suffix_locks_order
    ON qris_suffix_locks(merchant_order_id)`,
  `CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    source TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_order
    ON payment_reconciliation_log(merchant_order_id, created_at DESC)`,
  "ALTER TABLE tryout_questions ADD COLUMN image_url TEXT DEFAULT ''",
  "ALTER TABLE tryout_questions ADD COLUMN image_alt TEXT DEFAULT ''",
  "ALTER TABLE tryout_attempts ADD COLUMN answers_json TEXT DEFAULT '{}'",
  "ALTER TABLE tryout_attempts ADD COLUMN review_snapshot_json TEXT DEFAULT '{}'",
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS landing_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot TEXT UNIQUE NOT NULL,
    media_type TEXT NOT NULL,
    url TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    size_bytes INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tryout_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tryout_id TEXT NOT NULL,
    tryout_title TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    answered_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tryout_attempts_tryout_score
    ON tryout_attempts (tryout_id, score DESC, correct_count DESC, duration_seconds ASC, completed_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_tryout_attempts_user_tryout
    ON tryout_attempts (user_id, tryout_id, completed_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS tryout_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tryout_id TEXT NOT NULL,
    question_text TEXT DEFAULT '',
    question_display TEXT NOT NULL,
    answer_display TEXT NOT NULL,
    acceptable_answers TEXT NOT NULL DEFAULT '[]',
    difficulty TEXT DEFAULT 'Easy',
    question_type TEXT DEFAULT 'mc',
    mc_options TEXT DEFAULT '[]',
    image_url TEXT DEFAULT '',
    image_alt TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tryout_questions_tryout
    ON tryout_questions (tryout_id, sort_order, id)`,
  `CREATE TABLE IF NOT EXISTS tryout_question_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tryout_question_id INTEGER NOT NULL REFERENCES tryout_questions(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    why TEXT,
    intuition TEXT,
    mistakes TEXT,
    mistake_result TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tryout_question_steps_question
    ON tryout_question_steps (tryout_question_id, step_order, id)`,
  `CREATE TABLE IF NOT EXISTS tryout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tryout_id TEXT NOT NULL,
    tryout_title TEXT NOT NULL,
    session_token TEXT NOT NULL,
    session_seed TEXT NOT NULL DEFAULT '',
    problem_ids_json TEXT NOT NULL DEFAULT '[]',
    answers_json TEXT NOT NULL DEFAULT '{}',
    choice_map_json TEXT NOT NULL DEFAULT '{}',
    started_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    time_limit_seconds INTEGER NOT NULL DEFAULT 0,
    submitted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tryout_sessions_user_tryout
    ON tryout_sessions (user_id, tryout_id, submitted_at, started_at DESC)`,
  "ALTER TABLE tryout_packages ADD COLUMN is_hidden INTEGER DEFAULT 0",
  "ALTER TABLE user_access_grants ADD COLUMN payment_merchant_order_id TEXT",
  "ALTER TABLE user_access_grants ADD COLUMN revoked INTEGER DEFAULT NULL",
  "CREATE TABLE IF NOT EXISTS payment_rate_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, rate_hash TEXT NOT NULL, window_start INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON payment_rate_limits(rate_hash, window_start)",
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

try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_id ON users (clerk_id) WHERE clerk_id IS NOT NULL AND clerk_id != ''");
} catch (_) {}

try {
  db.exec(`
    UPDATE users
    SET auth_provider = 'local'
    WHERE auth_provider IS NULL OR auth_provider = '' OR auth_provider = 'password'
  `);
} catch (_) {}

try {
  db.exec(`
    UPDATE users
    SET password_hash = 'clerk'
    WHERE password_hash = 'none'
      AND clerk_id IS NOT NULL
      AND clerk_id != ''
      AND auth_provider IN ('clerk', 'linked')
  `);
} catch (_) {}

try {
  db.exec(`
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
    WHERE email_verified_at IS NULL
      AND (role = 'admin' OR auth_provider IN ('clerk', 'linked') OR email_verification_token_hash IS NULL)
  `);
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
  question_type TEXT DEFAULT 'open',
  mc_options TEXT DEFAULT '[]',
  acceptable_answers TEXT DEFAULT '[]',
  hint TEXT DEFAULT '',
  hintPlain TEXT DEFAULT '',
  hintLatex TEXT DEFAULT '',
  xp INTEGER NOT NULL DEFAULT 150,
  week_label TEXT DEFAULT 'Pekan 1',
  sort_order INTEGER DEFAULT 0
)`);

db.exec(`
CREATE TABLE IF NOT EXISTS tryout_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tryout_id TEXT NOT NULL DEFAULT '',
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
  const ins = db.prepare('INSERT INTO tryout_packages (tryout_id, title, description, price, original_price, badge, duration, questions, features, tone, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  [
    ['tryout-bundling-semester-1','Tryout Bundling: Semester 1','Evaluasi lengkap Matematika, Fisika, dan Kimia untuk persiapan UAS.','Rp 50.000',null,'Populer','180 mnt',90,JSON.stringify(['3 Mata pelajaran dasar','Sistem CBT seperti UAS','Analisis butir soal AI','Pembahasan video eksklusif']),'default',1],
    ['tryout-premium-tpb-prep','Tryout Premium: The Trinity TPB','Simulasi pre-test TPB ITB berisi Matematika, Fisika, dan Kimia.','Rp 100.000','Rp 150.000','Terlengkap','90 mnt',30,JSON.stringify(['30 soal campuran TPB','Urutan soal dan opsi diacak','Hasil keluar instan','Pembahasan step-by-step']),'feature',2],
    ['tryout-gratis-bab-1-2','Tryout Gratis: Bab 1-2','Coba sistem CBT kami secara gratis untuk Kalkulus Dasar.','Gratis',null,'Promo','30 mnt',15,JSON.stringify(['1 mata pelajaran','Hasil keluar instan','Pembahasan teks dasar']),'default',3],
  ].forEach(r => ins.run(...r));
}

ensurePaymentTestTryoutPackage(db);
ensureTryoutPackageIds(db);
seedInitialTryoutQuestions(db);
ensurePaymentTestTryoutQuestions(db);
ensureDefaultAppSettings(db);

ensureFixedAdminUser(db);

app.locals.db = db;
app.locals.performanceStore = createPerformanceStore();
startExpirySweeper(db, Number(process.env.PAYMENT_EXPIRY_SWEEP_INTERVAL_MS) || 60000);
startMutasikuPoller(db);

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
            filter: process.env.QRIS_MUTATION_FILTER || '',
            lookbackDays: Number(process.env.QRIS_MUTATION_LOOKBACK_DAYS) || 1,
            timeZone: process.env.QRIS_MUTATION_TIME_ZONE || 'Asia/Jakarta',
            debug: ['1', 'true', 'yes', 'on'].includes(
                String(process.env.QRIS_MUTATION_DEBUG || '').toLowerCase()
            ),
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
    console.log('[collector] MUTATION_COLLECTOR_ENABLED not set - auto-verify is OFF');
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: helmetCspOptions(),
  crossOriginEmbedderPolicy: false,
  reportingEndpoints: {
    csp: '/api/csp-report',
  },
}));

app.post('/api/webhooks/clerk', express.raw({ type: '*/*' }), webhookRoutes.handleClerkWebhook);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET wajib diset di .env untuk production.');
}

app.use(session({
  name: isProduction ? '__Host-mafiking.sid' : 'mafiking.sid',
  store: new SQLiteSessionStore({
    db,
    ttlMs: sessionMaxAgeMs,
  }),
  secret: process.env.SESSION_SECRET || 'new-mafiking-local-dev-only',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: sessionMaxAgeMs,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'strict'
  }
}));
app.use(cookieParser());

const { csrfProtection, csrfTokenRoute } = createCsrfProtection();

if (clerkMiddleware && process.env.CLERK_SECRET_KEY) {
  app.use(clerkMiddleware());
}
app.use(require('./middleware/clerk-auth').clerkAuthMiddleware);
app.use(apiRequestTiming);
app.use(createRequestGuard());
app.use(createCanaryMiddleware());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false
});
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Terlalu banyak percobaan registrasi. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false
});
const correctionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => `correction:${req.session?.userId || req.userId || rateLimit.ipKeyGenerator(req.ip)}`,
  message: { error: 'Terlalu banyak request koreksi. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false
});
const performanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Terlalu banyak telemetry request. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.get('/api/health', (_req, res) => {
  setPublicApiCache(res, 15, 60);
  const counts = {
    chapters: db.prepare('SELECT COUNT(*) AS count FROM chapters').get().count,
    problems: db.prepare('SELECT COUNT(*) AS count FROM problems').get().count
  };
  res.json({ ok: true, service: 'new-mafiking', counts });
});

app.get('/api/config/clerk', (_req, res) => {
  setPublicApiCache(res, 60, 300);
  const publishableKey = String(process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '').trim();
  res.json({ enabled: Boolean(publishableKey), publishableKey });
});

app.get('/api/csrf-token', csrfTokenRoute);
app.use(csrfProtection);

function privateApiNoStore(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.vary('Authorization');
  res.vary('Cookie');

  // Auth/session endpoints must return fresh JSON after OAuth redirects. If a
  // browser has an older ETag, Express can otherwise answer 304 with no body.
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];

  return next();
}

app.use(privateApiNoStore);

// CSP violation report endpoint. Browsers POST JSON-encoded reports here when
// a Content-Security-Policy directive is violated. Always returns 204 to keep
// the channel quiet for the browser.
app.post(
  ['/api/csp-report', '/api/csp-report/'],
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '32kb' }),
  (req, res) => {
    try {
      const body = req.body || {};
      const report = body['csp-report'] || body.report || body;
      if (report && typeof report === 'object') {
        auditLog.logCspReport(report);
      }
    } catch (_) {
      // Never let a log write fail the request.
    }
    res.status(204).end();
  }
);

app.post('/api/performance/vitals', performanceLimiter, (req, res) => {
  const normalized = normalizeVitalsPayload({
    ...(req.body || {}),
    userAgent: req.get('user-agent') || req.body?.userAgent || '',
  });
  for (const metric of normalized.metrics) {
    req.app.locals.performanceStore?.recordVital({
      ...metric,
      userId: req.session?.userId || null,
    });
  }
  res.status(204).end();
});

app.post('/api/performance/client-error', performanceLimiter, (req, res) => {
  const normalized = normalizeClientErrorPayload({
    ...(req.body || {}),
    userAgent: req.get('user-agent') || req.body?.userAgent || '',
  });
  const payload = {
    ...normalized,
    userId: req.session?.userId || req.userId || null,
  };
  req.app.locals.performanceStore?.recordClientError(payload);
  console.warn('[client-error]', normalized.source, normalized.message, `route=${normalized.route}`, `user=${payload.userId || '-'}`);
  res.status(204).end();
});

app.get('/api/performance/summary', (req, res) => {
  if (!(req.session?.role === 'admin' || isLocalAdminMode(req))) {
    return res.status(403).json({ error: 'Akses admin diperlukan' });
  }
  res.json(req.app.locals.performanceStore?.summary() || { requestsCount: 0, vitalsCount: 0 });
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/correction', correctionLimiter);

function apiRequestTiming(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const start = process.hrtime.bigint();
  const originalWriteHead = res.writeHead;

  function durationMs() {
    return Number(process.hrtime.bigint() - start) / 1e6;
  }

  res.writeHead = function writeHeadWithTiming(...args) {
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${durationMs().toFixed(1)}ms`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const roundedDuration = Math.round(durationMs() * 10) / 10;
    const payload = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: roundedDuration,
      userId: req.session?.userId || null,
    };
    req.app.locals.performanceStore?.recordRequest(payload);
    if (shouldLogRequestTiming(payload)) {
      console.info('[api-timing]', `${payload.method} ${payload.path}`, `${payload.statusCode}`, `${payload.durationMs}ms`, `user=${payload.userId || '-'}`);
    }
  });

  return next();
}

function createGuestSessionUser(database) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 100000).toString(36)}-${attempt}`;
    const guestName = `Tamu_${suffix}`;
    try {
      const info = database.prepare(
        "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'none', ?, 'user')"
      ).run(guestName, guestName);
      return Number(info.lastInsertRowid);
    } catch (error) {
      lastError = error;
      if (error && error.code !== 'SQLITE_CONSTRAINT_UNIQUE') break;
    }
  }
  throw lastError || new Error('Gagal membuat guest user.');
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (
    req.path === '/api/health' ||
    req.path === '/api/config/clerk' ||
    req.path === '/api/payment/callback' ||
    req.path === '/api/payment/reconcile/webhook' ||
    req.path === '/api/payment/reconcile/mutasiku-webhook' ||
    req.path === '/api/landing-media' ||
    req.path === '/api/performance/vitals' ||
    req.path === '/api/performance/client-error' ||
    req.path === '/api/payment/config' ||
    req.path === '/api/quiz/init' ||
    req.path === '/api/tryout-packages/access' ||
    req.path === '/api/tryout-packages' ||
    req.path === '/api/webhooks/clerk' ||
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/register' ||
    req.path === '/api/auth/resend-verification' ||
    req.path === '/api/auth/verify-email' ||
    req.path.startsWith('/api/payment/mock-')
  ) return next();
  if (req.session.userId) return next();

  try {
    req.session.userId = createGuestSessionUser(db);
    req.session.role = 'user';
  } catch (error) {
    console.error('Auto-guest error:', error);
  }
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/tryouts', require('./routes/tryouts'));

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
  return isLocalAdminMode(req);
}

function hasMissionManualAccess(database, userId) {
  if (!userId) return false;
  try {
    const row = database.prepare(`
      SELECT id
      FROM user_access_grants
      WHERE user_id = ?
        AND (
          (access_type = 'mission' AND access_value IN ('daily-missions', 'misi-harian'))
          OR (access_type = 'manual' AND access_value IN ('daily-missions', 'misi-harian'))
        )
      LIMIT 1
    `).get(userId);
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

function canReadLockedTryoutPackages(req) {
  return Boolean((req.session && req.session.role === 'admin') || isLocalAdminMode(req));
}

function serializeMissionForViewer(row, { canSeeDrafts = false, hasManualAccess = false } = {}) {
  const released = isReleasedMission(row);
  const effectiveStatus = effectiveMissionStatus(row, released);
  if (canSeeDrafts || hasManualAccess) {
    return {
      ...row,
      status: hasManualAccess && row.status !== 'completed' ? 'active' : row.status,
      effective_status: hasManualAccess && row.status !== 'completed' ? 'active' : effectiveStatus,
      is_released: hasManualAccess || released,
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
    image_url: '',
    image_alt: '',
    question_type: 'open',
    mc_options: '[]',
    acceptable_answers: '[]',
    hint: '',
    hintPlain: '',
    hintLatex: '',
    status: 'locked',
    effective_status: 'locked',
    is_released: false,
  };
}

app.get('/api/missions', (req, res) => {
  try {
    const wantsAdmin = req.query.admin === '1';
    const canSeeDrafts = wantsAdmin && canReadMissionDrafts(req);
    const hasManualAccess = !canSeeDrafts && hasMissionManualAccess(db, req.session && req.session.userId);
    const rows = db.prepare('SELECT * FROM daily_missions ORDER BY sort_order, day').all();
    res.json(rows.map((row) => serializeMissionForViewer(row, { canSeeDrafts, hasManualAccess })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tryout-packages', (req, res) => {
  try {
    if (!areTryoutPackagesEnabled(db) && !canReadLockedTryoutPackages(req)) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.json([]);
      return;
    }
    setPublicApiCache(res, 30, 120);
    const isAdmin = canReadLockedTryoutPackages(req);
    const rows = db.prepare('SELECT * FROM tryout_packages ORDER BY sort_order, id').all();
    res.json(isAdmin ? rows : rows.filter((p) => !p.is_hidden));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tryout-packages/access', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      enabled: areTryoutPackagesEnabled(db) || canReadLockedTryoutPackages(req),
      locked: !areTryoutPackagesEnabled(db) && !canReadLockedTryoutPackages(req),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/landing-media', (_req, res) => {
  try {
    setPublicApiCache(res, 60, 300);
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
app.use('/api/admin/payments', require('./routes/admin-payments'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/correction', require('./routes/correction'));

function hasBuiltClient() {
  return fs.existsSync(distIndexPath);
}

function canServeLegacySource() {
  return !isProduction && !hasBuiltClient();
}

function isVersionedAssetUrl(url) {
  const value = String(url || '');
  const pathname = value.split('?')[0] || '';
  return /[?&](?:v|ver|version|hash|t)=[A-Za-z0-9._-]+/.test(value)
    || /(?:-[A-Fa-f0-9]{8,}|-\d{8,})(?=\.[A-Za-z0-9]+$)/.test(path.basename(pathname));
}

function cacheControlForAssetRequest(req) {
  const url = String(req.originalUrl || req.url || '');
  const pathname = url.split('?')[0] || '';
  if (isVersionedAssetUrl(url)) {
    return `public, max-age=${oneYearSeconds}, immutable`;
  }
  if (/\.(?:avif|gif|jpe?g|mp4|png|svg|webm|webp|woff2?)$/i.test(pathname)) {
    return `public, max-age=${oneWeekSeconds}, stale-while-revalidate=${oneDaySeconds}`;
  }
  return `public, max-age=${oneDaySeconds}, stale-while-revalidate=${oneDaySeconds}`;
}

function setStaticCacheHint(req, res, next) {
  res.locals.staticCacheControl = cacheControlForAssetRequest(req);
  next();
}

const staticCache = {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', res.locals.staticCacheControl || `public, max-age=${oneDaySeconds}, stale-while-revalidate=${oneDaySeconds}`);
  }
};

const distAssetCache = {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', `public, max-age=${oneYearSeconds}, immutable`);
  }
};

const devSourceCache = {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'text/babel; charset=utf-8');
    }
    if (filePath.endsWith('styles.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
};

const devSourceStatic = express.static(path.join(__dirname, 'src'), devSourceCache);

function findLatestDistAsset(prefix, extension) {
  try {
    const assetsDir = path.join(distDir, 'assets');
    const files = fs.readdirSync(assetsDir)
      .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith(extension))
      .map((file) => ({
        file,
        mtimeMs: fs.statSync(path.join(assetsDir, file)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files[0] ? path.join(assetsDir, files[0].file) : null;
  } catch (_) {
    return null;
  }
}

app.use('/assets', setStaticCacheHint);
app.use('/assets', express.static(path.join(distDir, 'assets'), distAssetCache));
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticCache));
app.get(/^\/assets\/(index|generated-admin|vendor-react)-[^/]+\.(js|css)$/, (req, res, next) => {
  const fallbackAsset = findLatestDistAsset(req.params[0], `.${req.params[1]}`);
  if (!fallbackAsset) return next();
  res.setHeader('Cache-Control', 'no-cache');
  return res.sendFile(fallbackAsset);
});
app.use('/video', setStaticCacheHint);
app.use('/video', express.static(path.join(__dirname, 'assets'), staticCache));
app.use('/src', (req, res, next) => {
  if (canServeLegacySource()) return devSourceStatic(req, res, next);
  return res.status(404).type('text/plain; charset=utf-8').send('Not found');
});
app.get('/SOP-DEEPSEEK-IMPORT-SOAL.md', (req, res) => {
  if (!req.session?.role || req.session.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }
  res.type('text/markdown; charset=utf-8').sendFile(path.join(__dirname, 'SOP-DEEPSEEK-IMPORT-SOAL.md'));
});
app.get('/tweaks-panel.jsx', (_req, res) => {
  if (canServeLegacySource()) {
    res.type('text/babel').sendFile(path.join(__dirname, 'tweaks-panel.jsx'));
    return;
  }
  res.status(404).type('text/plain; charset=utf-8').send('Not found');
});
app.get(['/syarat-ketentuan.html', '/terms.html', '/tnc.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'syarat-ketentuan.html'));
});

function sendAppHtml(_req, res) {
  if (hasBuiltClient()) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(distIndexPath);
  }

  if (isProduction) {
    return res.status(503).type('text/plain; charset=utf-8').send('Production bundle belum tersedia. Jalankan npm run build sebelum start server.');
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(legacyAppHtmlPath);
}

app.get(['/', '/index.html', '/MAFIKING.html'], (_req, res) => {
  sendAppHtml(_req, res);
});
app.get(/^(?!\/api\/).*/, (_req, res) => {
  sendAppHtml(_req, res);
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
      "UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?"
    ).run(passwordHash, existing.id);
    database.prepare(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?"
    ).run(existing.id);
    return;
  }
  database.prepare(
    "INSERT INTO users (username, password_hash, display_name, role, email_verified_at) VALUES (?, ?, 'Admin 123', 'admin', CURRENT_TIMESTAMP)"
  ).run(username, passwordHash);
}

function slugifyTryoutId(value, fallback) {
  const base = String(value || fallback || 'tryout')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || String(fallback || 'tryout');
}

function ensureTryoutPackageIds(database) {
  let rows = [];
  try {
    rows = database.prepare('SELECT id, title, tryout_id FROM tryout_packages ORDER BY id').all();
  } catch (_) {
    return;
  }
  const used = new Set(rows.map((row) => String(row.tryout_id || '').trim()).filter(Boolean));
  const update = database.prepare('UPDATE tryout_packages SET tryout_id = ? WHERE id = ?');
  for (const row of rows) {
    if (String(row.tryout_id || '').trim()) continue;
    const base = slugifyTryoutId(row.title, `tryout-${row.id}`);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    update.run(candidate, row.id);
  }
}

function ensurePaymentTestTryoutPackage(database) {
  const payload = {
    tryout_id: 'cek-payment-tryout',
    title: 'Cek Payment',
    description: 'Paket khusus untuk mengetes alur pembayaran web.',
    price: 'Rp 500',
    original_price: null,
    badge: 'Test',
    duration: '10 mnt',
    questions: 5,
    features: JSON.stringify(['Cek QRIS payment', 'Akses terbuka otomatis setelah terverifikasi']),
    tone: 'default',
    sort_order: 99,
  };

  try {
    const existing = database.prepare(`
      SELECT id
      FROM tryout_packages
      WHERE tryout_id = ? OR lower(title) IN ('cek payment', 'test')
      ORDER BY CASE WHEN tryout_id = ? THEN 0 ELSE 1 END, id
      LIMIT 1
    `).get(payload.tryout_id, payload.tryout_id);

    if (existing) {
      database.prepare(`
        UPDATE tryout_packages
        SET tryout_id = ?,
            title = ?,
            description = ?,
            price = ?,
            original_price = ?,
            badge = ?,
            duration = ?,
            questions = ?,
            features = ?,
            tone = ?,
            sort_order = ?
        WHERE id = ?
      `).run(
        payload.tryout_id,
        payload.title,
        payload.description,
        payload.price,
        payload.original_price,
        payload.badge,
        payload.duration,
        payload.questions,
        payload.features,
        payload.tone,
        payload.sort_order,
        existing.id
      );
      return;
    }

    database.prepare(`
      INSERT INTO tryout_packages (
        tryout_id, title, description, price, original_price, badge,
        duration, questions, features, tone, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.tryout_id,
      payload.title,
      payload.description,
      payload.price,
      payload.original_price,
      payload.badge,
      payload.duration,
      payload.questions,
      payload.features,
      payload.tone,
      payload.sort_order
    );
  } catch (error) {
    console.warn('[tryout-packages] failed to ensure Cek Payment package:', error.message);
  }
}

function ensurePaymentTestTryoutQuestions(database) {
  const tryoutId = 'cek-payment-tryout';
  try {
    const existing = Number(database.prepare(
      'SELECT COUNT(*) AS count FROM tryout_questions WHERE tryout_id = ?'
    ).get(tryoutId).count) || 0;
    if (existing >= 5) return;

    const sourceProblems = database.prepare(`
      SELECT question_text, question_display, answer_display, acceptable_answers,
             difficulty, question_type, mc_options
      FROM problems
      WHERE TRIM(COALESCE(NULLIF(question_display, ''), question_text, '')) <> ''
      ORDER BY sort_order, id
      LIMIT ?
    `).all(5 - existing);
    if (!sourceProblems.length) return;

    const insertQuestion = database.prepare(`
      INSERT INTO tryout_questions (
        tryout_id, question_text, question_display, answer_display, acceptable_answers,
        difficulty, question_type, mc_options, sort_order, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    const appendQuestions = database.transaction(() => {
      sourceProblems.forEach((problem, index) => {
        insertQuestion.run(
          tryoutId,
          problem.question_text || '',
          problem.question_display || problem.question_text || '',
          problem.answer_display || '',
          problem.acceptable_answers || '[]',
          problem.difficulty || 'Easy',
          problem.question_type || 'mc',
          problem.mc_options || '[]',
          existing + index + 1
        );
      });
    });
    appendQuestions();
  } catch (error) {
    console.warn('[tryout-packages] failed to ensure Cek Payment questions:', error.message);
  }
}

function seedInitialTryoutQuestions(database) {
  let existingTryoutQuestions = 0;
  try {
    existingTryoutQuestions = Number(database.prepare('SELECT COUNT(*) AS count FROM tryout_questions').get().count) || 0;
  } catch (_) {
    return;
  }
  if (existingTryoutQuestions > 0) return;

  const sourceProblems = database.prepare(`
    SELECT id, question_text, question_display, answer_display, acceptable_answers, difficulty, question_type, mc_options, sort_order
    FROM problems
    ORDER BY sort_order, id
  `).all();
  if (!sourceProblems.length) return;

  const sourceStepsByProblem = new Map();
  const sourceSteps = database.prepare(`
    SELECT problem_id, step_order, title, content, why, intuition, mistakes, mistake_result
    FROM problem_steps
    ORDER BY problem_id, step_order, id
  `).all();
  for (const step of sourceSteps) {
    if (!sourceStepsByProblem.has(step.problem_id)) sourceStepsByProblem.set(step.problem_id, []);
    sourceStepsByProblem.get(step.problem_id).push(step);
  }

  const packages = database.prepare("SELECT tryout_id, title, questions FROM tryout_packages WHERE tryout_id <> '' ORDER BY sort_order, id").all();
  const targets = [
    { tryout_id: 'free-math-tryout-15', questions: 15 },
    ...packages,
  ];
  const insertQuestion = database.prepare(`
    INSERT INTO tryout_questions (
      tryout_id, question_text, question_display, answer_display, acceptable_answers,
      difficulty, question_type, mc_options, sort_order, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);
  const insertStep = database.prepare(`
    INSERT INTO tryout_question_steps (
      tryout_question_id, step_order, title, content, why, intuition, mistakes, mistake_result
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = database.transaction(() => {
    for (const target of targets) {
      const tryoutId = String(target.tryout_id || '').trim();
      if (!tryoutId) continue;
      const limit = Math.max(1, Math.min(Number(target.questions) || 15, sourceProblems.length));
      sourceProblems.slice(0, limit).forEach((problem, index) => {
        const info = insertQuestion.run(
          tryoutId,
          problem.question_text || '',
          problem.question_display || '',
          problem.answer_display || '',
          problem.acceptable_answers || '[]',
          problem.difficulty || 'Easy',
          problem.question_type || 'mc',
          problem.mc_options || '[]',
          index + 1
        );
        const tryoutQuestionId = Number(info.lastInsertRowid);
        for (const step of sourceStepsByProblem.get(problem.id) || []) {
          insertStep.run(
            tryoutQuestionId,
            Number(step.step_order) || 1,
            step.title || '',
            step.content || '',
            step.why || '',
            step.intuition || '',
            step.mistakes || '',
            step.mistake_result || ''
          );
        }
      });
    }
  });
  seed();
}
