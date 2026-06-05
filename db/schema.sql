PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    fakultas TEXT DEFAULT '',
    phone_number TEXT DEFAULT '',
    semester INTEGER,
    jurusan TEXT DEFAULT '',
    mapel_prioritas TEXT NOT NULL DEFAULT '[]',
    referral_source TEXT DEFAULT '',
    onboarding_completed_at DATETIME,
    clerk_id TEXT,
    email TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'local',
    email_verified_at DATETIME,
    email_verification_token_hash TEXT,
    email_verification_expires_at DATETIME,
    email_verification_last_sent_at DATETIME,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak_days INTEGER DEFAULT 0,
    last_active DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    mapel TEXT DEFAULT 'Matematika',
    semester INTEGER DEFAULT 1,
    description TEXT DEFAULT '',
    est TEXT DEFAULT '',
    topics TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS subtopics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subtopic_id INTEGER NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
    question_text TEXT DEFAULT '',
    question_display TEXT NOT NULL,
    answer_display TEXT NOT NULL,
    acceptable_answers TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Easy',
    question_type TEXT DEFAULT 'open',
    mc_options TEXT DEFAULT '[]',
    image_url TEXT DEFAULT '',
    image_alt TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS problem_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    why TEXT,
    intuition TEXT,
    mistakes TEXT,
    mistake_result TEXT
);

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
    image_url TEXT DEFAULT '',
    image_alt TEXT DEFAULT '',
    xp INTEGER NOT NULL DEFAULT 150,
    week_label TEXT DEFAULT 'Pekan 1',
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_order_id TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    product_details TEXT NOT NULL,
    email TEXT NOT NULL,
    reference TEXT DEFAULT '',
    payment_url TEXT DEFAULT '',
    qr_string TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solved INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    hints_used INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    solved_at DATETIME,
    UNIQUE(user_id, problem_id)
);

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
);

CREATE TABLE IF NOT EXISTS tryout_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tryout_id TEXT NOT NULL,
    tryout_title TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    answered_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    answers_json TEXT NOT NULL DEFAULT '{}',
    review_snapshot_json TEXT NOT NULL DEFAULT '{}',
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tryout_attempts_tryout_score
    ON tryout_attempts (tryout_id, score DESC, correct_count DESC, duration_seconds ASC, completed_at ASC);

CREATE INDEX IF NOT EXISTS idx_tryout_attempts_user_tryout
    ON tryout_attempts (user_id, tryout_id, completed_at DESC, id DESC);

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
);

CREATE TABLE IF NOT EXISTS tryout_questions (
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
);

CREATE INDEX IF NOT EXISTS idx_tryout_questions_tryout
    ON tryout_questions (tryout_id, sort_order, id);

CREATE TABLE IF NOT EXISTS tryout_question_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tryout_question_id INTEGER NOT NULL REFERENCES tryout_questions(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    why TEXT,
    intuition TEXT,
    mistakes TEXT,
    mistake_result TEXT
);

CREATE INDEX IF NOT EXISTS idx_tryout_question_steps_question
    ON tryout_question_steps (tryout_question_id, step_order, id);

CREATE TABLE IF NOT EXISTS profile_ai_refreshes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_ai_refresh_at DATETIME NOT NULL,
    cached_summary TEXT
);

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
);

CREATE TABLE IF NOT EXISTS correction_latency_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    problem_id INTEGER REFERENCES problems(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'unknown',
    key_index INTEGER,
    model_used TEXT DEFAULT '',
    image_dimension INTEGER,
    image_bytes INTEGER,
    ai_duration_ms INTEGER,
    total_duration_ms INTEGER,
    cache_hit INTEGER DEFAULT 0,
    fast_path INTEGER DEFAULT 0,
    is_correct INTEGER,
    queue_wait_ms INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    error_code INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_latency_created ON correction_latency_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_latency_provider ON correction_latency_metrics(provider);

CREATE TABLE IF NOT EXISTS user_access_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_type TEXT NOT NULL,
    access_value TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_access_grants_user_id
    ON user_access_grants (user_id);

CREATE TABLE IF NOT EXISTS ai_token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    key_name TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_provider_key
    ON ai_token_usage (provider, key_name);
