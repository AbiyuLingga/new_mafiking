const fs = require('fs');
const path = require('path');

const AVATAR_URL_PREFIX = '/profile-media/avatars/';

function getProfileMediaDir() {
  const configured = String(process.env.PROFILE_MEDIA_DIR || '').trim();
  return configured
    ? path.resolve(configured)
    : path.join(__dirname, '..', 'profile-media');
}

function getAvatarDir() {
  return path.join(getProfileMediaDir(), 'avatars');
}

function avatarFilePathFromUrl(avatarUrl) {
  const value = String(avatarUrl || '').trim();
  if (!value.startsWith(AVATAR_URL_PREFIX)) return null;
  const filename = value.slice(AVATAR_URL_PREFIX.length);
  if (!filename || filename !== path.basename(filename)) return null;
  return path.join(getAvatarDir(), filename);
}

function findMissingAvatarRows(db) {
  const rows = db.prepare(`
    SELECT id, display_name, avatar_url
    FROM users
    WHERE trim(COALESCE(avatar_url, '')) LIKE ?
    ORDER BY id
  `).all(`${AVATAR_URL_PREFIX}%`);

  return rows.filter((row) => {
    const filePath = avatarFilePathFromUrl(row.avatar_url);
    return !filePath || !fs.existsSync(filePath);
  });
}

function clearMissingAvatarRows(db, rows) {
  const clearAvatar = db.prepare(`
    UPDATE users
    SET avatar_url = ''
    WHERE id = ? AND avatar_url = ?
  `);
  const clearAll = db.transaction((missingRows) => missingRows.reduce(
    (count, row) => count + clearAvatar.run(row.id, row.avatar_url).changes,
    0
  ));
  return clearAll(rows);
}

module.exports = {
  AVATAR_URL_PREFIX,
  avatarFilePathFromUrl,
  clearMissingAvatarRows,
  findMissingAvatarRows,
  getAvatarDir,
  getProfileMediaDir,
};
