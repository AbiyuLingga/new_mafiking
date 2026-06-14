const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');
const Database = require('better-sqlite3');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mafiking-profile-media-'));
process.env.PROFILE_MEDIA_DIR = path.join(tempRoot, 'profile-media');

const {
  findMissingAvatarRows,
  getProfileMediaDir,
} = require('../../lib/profile-media');

const pngBytes = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc000000301010018dd8db10000000049454e44ae426082',
  'hex'
);

function createDatabase() {
  const db = new Database(path.join(tempRoot, 'database.sqlite'));
  db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
  db.exec(`
    ALTER TABLE users ADD COLUMN badge_tier INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN highest_streak INTEGER DEFAULT 0;
    INSERT INTO users (
      id, username, password_hash, display_name, role, fakultas, xp, level,
      streak_days, badge_tier, highest_streak, semester, mapel_prioritas,
      referral_source, onboarding_completed_at
    ) VALUES (
      1, 'avatar@example.com', 'registered-hash', 'Avatar User', 'user', 'STEI-R',
      100, 2, 3, 0, 3, 1, '["Matematika"]', 'Teman', CURRENT_TIMESTAMP
    );
    INSERT INTO chapters (id, title) VALUES (1, 'Test');
    INSERT INTO subtopics (id, chapter_id, slug, title) VALUES (1, 1, 'test', 'Test');
    INSERT INTO problems (
      id, subtopic_id, question_display, answer_display, acceptable_answers
    ) VALUES (1, 1, '1 + 1', '2', '["2"]');
    INSERT INTO user_progress (
      user_id, problem_id, solved, attempts, xp_earned, solved_at
    ) VALUES (1, 1, 1, 1, 100, CURRENT_TIMESTAMP);
    INSERT INTO tryout_attempts (
      user_id, tryout_id, tryout_title, score, correct_count, total_questions,
      answered_count, duration_seconds
    ) VALUES (1, 'free-math-tryout-15', 'Try Out Gratis', 100, 15, 15, 15, 500);
  `);
  return db;
}

function createApp(db) {
  const app = express();
  app.locals.db = db;
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: 1, role: 'user' };
    next();
  });
  app.use('/profile-media', express.static(getProfileMediaDir()));
  app.use('/api/auth', require('../../routes/auth'));
  app.use('/api/progress', require('../../routes/progress'));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function uploadAvatar(baseUrl) {
  const form = new FormData();
  form.append('avatar', new Blob([pngBytes], { type: 'image/png' }), 'avatar.png');
  const response = await fetch(`${baseUrl}/api/auth/avatar`, {
    method: 'POST',
    body: form,
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.match(body.avatar_url, /^\/profile-media\/avatars\/user-1-.+\.png$/);
  return body.avatar_url;
}

async function readJson(baseUrl, requestPath) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

(async () => {
  const db = createDatabase();
  const { server, baseUrl } = await listen(createApp(db));
  try {
    const firstUrl = await uploadAvatar(baseUrl);
    const firstPath = path.join(getProfileMediaDir(), firstUrl.replace('/profile-media/', ''));
    assert.equal(fs.existsSync(firstPath), true, 'uploaded avatar file must exist');

    const staticResponse = await fetch(`${baseUrl}${firstUrl}`);
    assert.equal(staticResponse.status, 200, 'uploaded avatar URL must be served');
    assert.equal(Buffer.compare(Buffer.from(await staticResponse.arrayBuffer()), pngBytes), 0);

    const allRows = await readJson(baseUrl, '/api/progress/leaderboard');
    const weeklyRows = await readJson(baseUrl, '/api/progress/leaderboard/weekly');
    const tryoutRows = await readJson(baseUrl, '/api/progress/leaderboard/tryout?tryoutId=free-math-tryout-15');
    assert.equal(allRows[0].avatar_url, firstUrl);
    assert.equal(weeklyRows[0].avatar_url, firstUrl);
    assert.equal(tryoutRows[0].avatar_url, firstUrl);

    const secondUrl = await uploadAvatar(baseUrl);
    assert.notEqual(secondUrl, firstUrl, 'replacement must use a cache-safe unique URL');
    assert.equal(fs.existsSync(firstPath), false, 'replacement must remove the previous owned file');

    const secondPath = path.join(getProfileMediaDir(), secondUrl.replace('/profile-media/', ''));
    fs.rmSync(secondPath);
    const missing = findMissingAvatarRows(db);
    assert.deepEqual(missing.map((row) => row.id), [1]);

    const reconcile = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'maintenance', 'reconcile-profile-media.js'), '--apply'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TARGET_DB: db.name,
        PROFILE_MEDIA_DIR: getProfileMediaDir(),
      },
    });
    assert.equal(reconcile.status, 0, reconcile.stderr);
    const reconcileReport = JSON.parse(reconcile.stdout);
    assert.equal(reconcileReport.missingCount, 1);
    assert.equal(reconcileReport.clearedCount, 1);
    assert.equal(fs.existsSync(reconcileReport.backup), true, 'apply mode must back up the database');
    assert.equal(db.prepare('SELECT avatar_url FROM users WHERE id = 1').get().avatar_url, '');

    const leaderboardSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'leaderboard.jsx'), 'utf8');
    assert.match(leaderboardSource, /event\.currentTarget\.remove\(\)/, 'broken images must be removed before showing initials');

    console.log('Profile media integration tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
