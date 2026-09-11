// (72) Per-day time-consumption breakdown for task work logs.
// Sessions are grouped by calendar day in Asia/Manila (GMT+8 — matches the
// rest of the app, e.g. kiosk end-of-day expiry). A session that spans
// midnight (e.g. a timer left running overnight) is split at the boundary so
// each day's total is accurate. The live running session counts toward today.

const OFFSET_MIN = 8 * 60

export function dayKeyOf(ms) {
  return new Date(ms + OFFSET_MIN * 60000).toISOString().slice(0, 10)
}

// The next Manila midnight (as a UTC instant) after the given instant.
function nextMidnight(ms) {
  const shifted = new Date(ms + OFFSET_MIN * 60000)
  const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1)
  return midnightShifted - OFFSET_MIN * 60000
}

// Split [startMs, endMs) at Manila midnights, distributing `totalSec`
// proportionally (remainder lands on the final chunk).
function pushChunks(chunks, startMs, endMs, totalSec) {
  const span = endMs - startMs
  let placed = 0
  let cur = startMs
  while (cur < endMs && span > 0) {
    const bound = Math.min(endMs, nextMidnight(cur))
    const isLast = bound >= endMs
    const sec = isLast ? totalSec - placed : Math.round((totalSec * (bound - cur)) / span)
    chunks.push({ day: dayKeyOf(cur), seconds: Math.max(0, sec) })
    placed += Math.max(0, sec)
    cur = bound
  }
}

/**
 * Group work sessions by calendar day.
 * @param {Array<{start: string, end?: string, seconds?: number}>} sessions
 * @param {{ now?: number }} [opts] — `now` closes running sessions (no `end`).
 * @returns {Array<{date: string, seconds: number}>} — `date` is `YYYY-MM-DD`
 *   in Manila time, sorted newest first. Zero-duration/corrupt entries skipped.
 */
export function timeByDay(sessions = [], { now = Date.now() } = {}) {
  const chunks = []
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s?.start) continue
    const startMs = Date.parse(s.start)
    if (Number.isNaN(startMs)) continue
    const endMs = s.end ? Date.parse(s.end) : now
    if (Number.isNaN(endMs) || endMs <= startMs) continue
    // `seconds == null` (running/live session) means "derive from the timespan".
    // An explicitly logged 0 means "no time recorded" — skip it.
    const logged = s.seconds == null ? NaN : Number(s.seconds)
    const totalSec = Number.isFinite(logged) ? Math.round(logged) : Math.round((endMs - startMs) / 1000)
    if (totalSec <= 0) continue
    pushChunks(chunks, startMs, endMs, totalSec)
  }
  const byDay = new Map()
  for (const c of chunks) byDay.set(c.day, (byDay.get(c.day) || 0) + c.seconds)
  return [...byDay.entries()]
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

// Convenience for the task views: stored sessions + the live running session,
// so today's figure updates while the timer runs.
export function taskTimeByDay(task, now = Date.now()) {
  const sessions = [...(task?.workLog || [])]
  if (task?.workStartedAt) {
    sessions.push({ start: task.workStartedAt, end: new Date(now).toISOString(), seconds: null })
  }
  return timeByDay(sessions, { now })
}

// (73) MM/DD/YYYY label for a YYYY-MM-DD day key (Manila), zero-padded.
export function dayLabel(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(date || '')
}