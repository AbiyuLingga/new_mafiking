const TRYOUT_PACKAGES_ENABLED_KEY = 'tryout_packages_enabled';

function normalizeSettingBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return Boolean(defaultValue);
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return Boolean(defaultValue);
}

function getAppSetting(db, key, defaultValue = '') {
    if (!db || !key) return defaultValue;
    try {
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
        return row ? row.value : defaultValue;
    } catch (_) {
        return defaultValue;
    }
}

function setAppSetting(db, key, value) {
    if (!db || !key) return;
    db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
}

function getBooleanSetting(db, key, defaultValue = false) {
    return normalizeSettingBoolean(getAppSetting(db, key, defaultValue ? '1' : '0'), defaultValue);
}

function setBooleanSetting(db, key, enabled) {
    setAppSetting(db, key, enabled ? '1' : '0');
}

function areTryoutPackagesEnabled(db) {
    return getBooleanSetting(db, TRYOUT_PACKAGES_ENABLED_KEY, false);
}

function setTryoutPackagesEnabled(db, enabled) {
    setBooleanSetting(db, TRYOUT_PACKAGES_ENABLED_KEY, enabled);
}

function ensureDefaultAppSettings(db) {
    if (!db) return;
    db.prepare(`
        INSERT OR IGNORE INTO app_settings (key, value)
        VALUES (?, ?)
    `).run(TRYOUT_PACKAGES_ENABLED_KEY, '0');
}

module.exports = {
    TRYOUT_PACKAGES_ENABLED_KEY,
    areTryoutPackagesEnabled,
    ensureDefaultAppSettings,
    getAppSetting,
    getBooleanSetting,
    normalizeSettingBoolean,
    setAppSetting,
    setBooleanSetting,
    setTryoutPackagesEnabled,
};
