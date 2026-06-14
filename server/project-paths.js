const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const DB_PATH = path.join(DB_DIR, 'database.sqlite');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const PROMPTS_DIR = path.join(__dirname, 'ai', 'prompts');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

function resolveProfileMediaDir(configured = process.env.PROFILE_MEDIA_DIR) {
  const value = String(configured || '').trim();
  return value ? path.resolve(value) : path.join(PROJECT_ROOT, 'profile-media');
}

module.exports = {
  ASSETS_DIR,
  DB_DIR,
  DB_PATH,
  DIST_DIR,
  LOG_DIR,
  PROJECT_ROOT,
  PROMPTS_DIR,
  PUBLIC_DIR,
  SRC_DIR,
  resolveProfileMediaDir,
};
