PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
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
    topics TEXT DEFAULT '[]',
    is_hidden INTEGER DEFAULT 0
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
    mistake_result TEXT,
    hint TEXT DEFAULT '',
    hintPlain TEXT DEFAULT '',
    hintLatex TEXT DEFAULT ''
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
    question_type TEXT DEFAULT 'open',
    mc_options TEXT DEFAULT '[]',
    acceptable_answers TEXT DEFAULT '[]',
    hint TEXT DEFAULT '',
    hintPlain TEXT DEFAULT '',
    hintLatex TEXT DEFAULT '',
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
    qris_base_amount INTEGER,
    qris_suffix INTEGER,
    qris_full_amount INTEGER,
    qris_dynamic_string TEXT,
    qris_image_data_url TEXT,
    expires_at DATETIME,
    paid_at DATETIME,
    reconciled_via TEXT,
    reconciled_by INTEGER REFERENCES users(id),
    webhook_secret_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qris_suffix_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_amount INTEGER NOT NULL,
    suffix INTEGER NOT NULL,
    merchant_order_id TEXT UNIQUE NOT NULL,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    released_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qris_suffix_locks_active_unique
    ON qris_suffix_locks(base_amount, suffix)
    WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qris_suffix_locks_order
    ON qris_suffix_locks(merchant_order_id);

CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    source TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_order
    ON payment_reconciliation_log(merchant_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_id TEXT,
    event_hash TEXT UNIQUE NOT NULL,
    merchant_order_id TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_status TEXT NOT NULL DEFAULT 'PROCESSED'
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_merchant_order
    ON payment_webhook_events(merchant_order_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
    ON payment_webhook_events(provider, event_id);

CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT UNIQUE NOT NULL,
    merchant_order_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
    ON payment_idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
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
    access_features TEXT DEFAULT '[]',
    tone TEXT DEFAULT 'default',
    sort_order INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS tryout_sessions (
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
);

CREATE INDEX IF NOT EXISTS idx_tryout_sessions_user_tryout
    ON tryout_sessions (user_id, tryout_id, submitted_at, started_at DESC);

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
    payment_merchant_order_id TEXT,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_access_grants_user_id
    ON user_access_grants (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_access_grants_payment_unique
    ON user_access_grants(user_id, access_type, access_value, payment_merchant_order_id)
    WHERE payment_merchant_order_id IS NOT NULL;

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

-- Migration 003: incoming_mutations for auto-verification
CREATE TABLE IF NOT EXISTS incoming_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'qris_merchant',
    provider_mutation_id TEXT,
    content_hash TEXT UNIQUE NOT NULL,
    direction TEXT NOT NULL DEFAULT 'IN',
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    transacted_at DATETIME NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    payer_name_masked TEXT,
    payer_id_hash TEXT,
    note_masked TEXT,
    matched_order_id TEXT,
    matched_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_mutations_unmatched
    ON incoming_mutations(amount, status, transacted_at)
    WHERE matched_order_id IS NULL AND direction = 'IN' AND status = 'SUCCESS';

CREATE INDEX IF NOT EXISTS idx_mutations_provider_id
    ON incoming_mutations(provider_mutation_id)
    WHERE provider_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_matched
    ON incoming_mutations(matched_order_id)
    WHERE matched_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_received
    ON incoming_mutations(received_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mutations_provider_id_unique
    ON incoming_mutations(provider, provider_mutation_id)
    WHERE provider_mutation_id IS NOT NULL AND provider_mutation_id != '';

CREATE TABLE IF NOT EXISTS payment_rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_hash TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON payment_rate_limits(rate_hash, window_start);

CREATE TRIGGER IF NOT EXISTS trg_payment_reconciliation_log_no_update
BEFORE UPDATE ON payment_reconciliation_log
FOR EACH ROW
WHEN OLD.action IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_reconciliation_log is append-only; UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_reconciliation_log_no_delete
BEFORE DELETE ON payment_reconciliation_log
FOR EACH ROW
WHEN OLD.action IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_reconciliation_log is append-only; DELETE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_webhook_events_no_update
BEFORE UPDATE ON payment_webhook_events
FOR EACH ROW
WHEN OLD.event_hash IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_webhook_events is append-only; UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_webhook_events_no_delete
BEFORE DELETE ON payment_webhook_events
FOR EACH ROW
WHEN OLD.event_hash IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_webhook_events is append-only; DELETE is forbidden');
END;
-- Migration 006: payment_ambiguous_queue for confidence-based matching
-- v3 plan: store ambiguous mutations that don't auto-match so admin can resolve

CREATE TABLE IF NOT EXISTS payment_ambiguous_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id INTEGER NOT NULL,
    merchant_order_id TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    transacted_at DATETIME NOT NULL,
    amount INTEGER NOT NULL,
    payer_name_masked TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by TEXT,
    resolution TEXT,  -- 'matched' | 'expired' | 'manual_skip'
    resolution_details TEXT,
    FOREIGN KEY (mutation_id) REFERENCES incoming_mutations(id)
);

CREATE INDEX IF NOT EXISTS idx_ambiguous_unresolved
    ON payment_ambiguous_queue(created_at)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ambiguous_mutation
    ON payment_ambiguous_queue(mutation_id);

-- Migration 007: web_vital_metrics for field CWV telemetry (Phase 0 perf plan)
-- Privacy: no PII, no URL query, no user ID. 30-day auto-purge via retention_until.
-- Indexed by metric+date for p75 aggregation, by path+date for per-route dashboards.
CREATE TABLE IF NOT EXISTS web_vital_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    rating TEXT NOT NULL,
    navigation_type TEXT,
    device_class TEXT,
    attribution_json TEXT,
    captured_at INTEGER NOT NULL,
    retention_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vital_metric_captured
    ON web_vital_metrics (metric, captured_at);

CREATE INDEX IF NOT EXISTS idx_vital_path_captured
    ON web_vital_metrics (path, captured_at);

CREATE INDEX IF NOT EXISTS idx_vital_retention
    ON web_vital_metrics (retention_until);
