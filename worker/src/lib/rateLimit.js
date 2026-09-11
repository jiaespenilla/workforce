// D1-backed rate limiting
export async function recentAttempts(env, key, windowMs) {
  const cutoff = new Date(Date.now() - windowMs).toISOString()
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND attempt_at >= ?')
    .bind(key, cutoff).first()
  return n || 0
}

export async function recordAttempts(env, keys) {
  const now = new Date().toISOString()
  const stmts = keys.map((key) => env.DB.prepare('INSERT INTO login_attempts (key, attempt_at) VALUES (?, ?)').bind(key, now))
  // Housekeeping: rows older than the longest window are purged, but only on
  // ~2% of calls — a table-wide DELETE on every failed attempt puts an extra
  // write on the hot path and doesn't scale with attempt volume.
  if (Math.random() < 0.02) {
    const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    stmts.push(env.DB.prepare('DELETE FROM login_attempts WHERE attempt_at < ?').bind(dayCutoff))
  }
  await env.DB.batch(stmts)
}

export async function clearAttempts(env, key) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run()
}
