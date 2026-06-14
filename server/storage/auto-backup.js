// server/storage/auto-backup.js — automatic SQLite database backup every N minutes.
// Uses better-sqlite3's .backup() API for consistent, non-blocking snapshots.

const fs = require('fs');
const path = require('path');
const { DB_DIR } = require('../project-paths');

const BACKUP_DIR = path.join(DB_DIR, 'backups');
const BACKUP_PREFIX = 'mafiking-auto-';
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_GRACE_MS = 30 * 1000; // skip first backup within 30s of start

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestampFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${BACKUP_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.sqlite`;
}

function pruneOldBackups() {
  const cutoff = Date.now() - RETENTION_MS;
  let pruned = 0;
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (!file.startsWith(BACKUP_PREFIX) || !file.endsWith('.sqlite')) continue;
      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          pruned++;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return pruned;
}

async function performBackup(db) {
  ensureBackupDir();
  const filename = timestampFilename();
  const tempPath = path.join(BACKUP_DIR, `.${filename}.tmp`);
  const finalPath = path.join(BACKUP_DIR, filename);

  console.log(`[auto-backup] starting snapshot -> ${filename}`);
  const start = Date.now();

  try {
    await db.backup(tempPath);
    fs.renameSync(tempPath, finalPath);

    const size = fs.statSync(finalPath).size;
    const elapsed = Date.now() - start;
    const sizeKB = (size / 1024).toFixed(1);
    console.log(`[auto-backup] done: ${filename} (${sizeKB} KB, ${elapsed}ms)`);

    const pruned = pruneOldBackups();
    if (pruned > 0) {
      console.log(`[auto-backup] pruned ${pruned} old backup(s)`);
    }
  } catch (err) {
    console.error(`[auto-backup] FAILED: ${err.message}`);
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }
}

function startAutoBackup(db, intervalMs) {
  const interval = intervalMs || 15 * 60 * 1000; // default: 15 minutes
  const startTime = Date.now();

  console.log(`[auto-backup] initialized (interval: ${interval / 1000}s, retention: 24h)`);

  setInterval(() => {
    if (Date.now() - startTime < STARTUP_GRACE_MS) return;
    performBackup(db);
  }, interval);

  // Run first backup after the grace period
  setTimeout(() => performBackup(db), STARTUP_GRACE_MS + 1000);
}

function runBackupNow(db) {
  return performBackup(db);
}

module.exports = { startAutoBackup, runBackupNow };
