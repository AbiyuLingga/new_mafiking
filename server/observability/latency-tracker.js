function boolInt(value) {
  return value ? 1 : 0;
}

function recordLatency(db, metrics = {}) {
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO correction_latency_metrics (
        user_id, problem_id, provider, key_index, model_used, image_dimension,
        image_bytes, ai_duration_ms, total_duration_ms, cache_hit, fast_path,
        is_correct, queue_wait_ms, status, error_code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metrics.userId || null,
      metrics.problemId || null,
      metrics.provider || 'unknown',
      metrics.keyIndex || null,
      metrics.modelUsed || '',
      metrics.imageDimension || null,
      metrics.imageBytes || null,
      metrics.aiDurationMs || null,
      metrics.totalDurationMs || null,
      boolInt(metrics.cacheHit),
      boolInt(metrics.fastPath),
      metrics.isCorrect == null ? null : boolInt(metrics.isCorrect),
      metrics.queueWaitMs || 0,
      metrics.status || 'success',
      metrics.errorCode || null
    );
  } catch (error) {
    console.warn('[latency] record failed:', error.message);
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarizeDurations(rows, field) {
  const values = rows.map((row) => Number(row[field])).filter((value) => Number.isFinite(value) && value >= 0);
  return {
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    p99: percentile(values, 99),
  };
}

function getLatencySummary(db, { sinceHours = 24 } = {}) {
  const hours = Math.max(1, Math.min(24 * 30, Number(sinceHours) || 24));
  const rows = db.prepare(`
    SELECT provider, ai_duration_ms, total_duration_ms, cache_hit, fast_path,
           is_correct, queue_wait_ms, status
    FROM correction_latency_metrics
    WHERE created_at >= datetime('now', ?)
    ORDER BY created_at DESC
    LIMIT 5000
  `).all(`-${hours} hours`);

  const byProvider = {};
  for (const row of rows) {
    const provider = row.provider || 'unknown';
    if (!byProvider[provider]) byProvider[provider] = { count: 0, errors: 0, ai: [], total: [], queue: [] };
    byProvider[provider].count += 1;
    if (row.status !== 'success') byProvider[provider].errors += 1;
    if (Number.isFinite(Number(row.ai_duration_ms))) byProvider[provider].ai.push(Number(row.ai_duration_ms));
    if (Number.isFinite(Number(row.total_duration_ms))) byProvider[provider].total.push(Number(row.total_duration_ms));
    if (Number.isFinite(Number(row.queue_wait_ms))) byProvider[provider].queue.push(Number(row.queue_wait_ms));
  }

  const providerSummary = {};
  for (const [provider, data] of Object.entries(byProvider)) {
    providerSummary[provider] = {
      count: data.count,
      errors: data.errors,
      ai: { p50: percentile(data.ai, 50), p90: percentile(data.ai, 90), p99: percentile(data.ai, 99) },
      total: { p50: percentile(data.total, 50), p90: percentile(data.total, 90), p99: percentile(data.total, 99) },
      queue: { p50: percentile(data.queue, 50), p90: percentile(data.queue, 90), p99: percentile(data.queue, 99) },
    };
  }

  return {
    count: rows.length,
    hours,
    ai: summarizeDurations(rows, 'ai_duration_ms'),
    total: summarizeDurations(rows, 'total_duration_ms'),
    queue: summarizeDurations(rows, 'queue_wait_ms'),
    cacheHitRate: rows.length ? rows.filter((row) => row.cache_hit).length / rows.length : 0,
    fastPathRate: rows.length ? rows.filter((row) => row.fast_path).length / rows.length : 0,
    successRate: rows.length ? rows.filter((row) => row.status === 'success').length / rows.length : 0,
    byProvider: providerSummary,
  };
}

module.exports = { getLatencySummary, recordLatency };
