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
    onboarding_completed_at DATETIME,
    clerk_id TEXT,
    email TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'local',
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
    sort_order INTEGER DEFAULT 0
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
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tryout_attempts_tryout_score
    ON tryout_attempts (tryout_id, score DESC, correct_count DESC, duration_seconds ASC, completed_at ASC);

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
