const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  clearMissingAvatarRows,
  findMissingAvatarRows,
  getAvatarDir,
} = require('../lib/profile-media');

const projectRoot = path.join(__dirname, '..');
const dbPath = path.resolve(process.env.TARGET_DB || path.join(projectRoot, 'db', 'database.sqlite'));
const apply = process.argv.includes('--apply');

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database tidak ditemukan: ${dbPath}`);
  }

  const db = new Database(dbPath);
  try {
    const missingRows = findMissingAvatarRows(db);
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      database: dbPath,
      avatarDir: getAvatarDir(),
      missingCount: missingRows.length,
      missing: missingRows.map((row) => ({
        id: row.id,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      })),
    };

    if (apply && missingRows.length) {
      const backupPath = `${dbPath}.backup-avatar-media-${timestamp()}.sqlite`;
      await db.backup(backupPath);
      report.backup = backupPath;
      report.clearedCount = clearMissingAvatarRows(db, missingRows);
    } else {
      report.clearedCount = 0;
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`[profile-media] ${error.message}`);
  process.exit(1);
});
