function logTokenUsage(db, {
  provider = 'gemini',
  model = '',
  keyName = '',
  tokensUsed = 0,
} = {}) {
  try {
    if (!db || !keyName) return;

    db.prepare(`
      INSERT INTO ai_token_usage (provider, model, key_name, tokens_used, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      String(provider || 'gemini'),
      String(model || ''),
      String(keyName),
      Math.max(0, Math.round(Number(tokensUsed) || 0)),
    );
  } catch (_) {
    // Token logging is observational and must never break the AI request path.
  }
}

module.exports = { logTokenUsage };
