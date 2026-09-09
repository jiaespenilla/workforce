// Task endpoints — list/create/update/delete with tenant scoping.

import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { mapTask, queueNotification, safeParseArray } from '../lib/db.js'
import { parsePagination, paginate } from '../lib/pagination.js'

// Resolve normalized assignee columns (email / company_id / employee id)
// from the "Name (Company)" display string.
async function resolveAssignee(env, assignee) {
  const m = String(assignee || '').match(/^(.*)\s+\((.*)\)\s*$/)
  if (!m) return { assigneeEmail: null, assigneeCompanyId: null, assigneeId: null }
  const cname = m[2].trim()
  const comp = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(cname).first()
  const assigneeCompanyId = comp?.id || null
  const emp = await env.DB.prepare('SELECT id, email FROM employees WHERE lower(name) = lower(?) AND company_id = ? LIMIT 1')
    .bind(m[1].trim(), assigneeCompanyId || '').first()
  // Fallback: try any employee with that name
  const match = emp || await env.DB.prepare('SELECT id, email FROM employees WHERE lower(name) = lower(?) LIMIT 1').bind(m[1].trim()).first()
  if (match?.email) {
    return { assigneeEmail: match.email.toLowerCase(), assigneeCompanyId, assigneeId: match.id }
  }
  return { assigneeEmail: null, assigneeCompanyId, assigneeId: null }
}

// True when the task is visible to the given company (mirrors the GET filter).
async function taskInCompany(env, taskId, companyId) {
  const t = await env.DB.prepare('SELECT assignee, assignee_company_id FROM tasks WHERE id = ?').bind(taskId).first()
  if (!t) return false
  if (t.assignee_company_id) return String(t.assignee_company_id) === String(companyId)
  const own = await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(companyId).first()
  return (t.assignee || '').endsWith(`(${own?.name || ''})`)
}

// Notify the company's CEO and managers when a task is created or updated.
// Never throws — notification failures must not break task writes.
async function notifyTaskUpdate(env, task, actorEmail, verb) {
  try {
    const companyId = task.assignee_company_id
    if (!companyId) return
    const emps = await env.DB.prepare('SELECT name, email, role FROM employees WHERE company_id = ? AND active = 1')
      .bind(companyId).all().then((r) => r.results)
    const recipients = emps
      .filter((e) => {
        const r = (e.role || '').toLowerCase()
        return r === 'ceo' || r.includes('manager') || r.includes('lead')
      })
      .filter((e) => e.email.toLowerCase() !== String(actorEmail || '').toLowerCase())
    if (!recipients.length) return
    const actorRow = await env.DB.prepare('SELECT name FROM users WHERE lower(email) = ?')
      .bind(String(actorEmail || '').toLowerCase()).first()
    const actorName = actorRow?.name || actorEmail || 'Someone'
    for (const r of recipients) {
      await queueNotification(env, {
        to: r.email,
        subject: `Task ${verb}: ${task.title}`,
        body: `${actorName} ${verb} a task.\n\nTitle: ${task.title}\nAssignee: ${task.assignee || '—'}\nPriority: ${task.priority || 'Medium'}\nDue: ${task.due || '—'}\nStatus: ${task.status || 'pending'}\n\nOpen Tasks to review progress.`,
      })
    }
  } catch { /* ignore — notifications must never break task writes */ }
}

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  /* tasks */
  if (path === '/api/tasks' && method === 'GET') {
    let rows = await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all().then((r) => r.results)
    // Company accounts only see their own company's tasks.
    const companyId = await callerCompanyId(env, claims)
    if (companyId) {
      const own = await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(companyId).first()
      const suffix = `(${own?.name || ''})`
      rows = rows.filter((t) => {
        if (t.assignee_company_id) return t.assignee_company_id === companyId
        return (t.assignee || '').endsWith(suffix)
      })
    }
    const mapped = rows.map(mapTask)
    const pag = parsePagination(url, 50)
    const result = paginate(mapped, pag, ['title', 'assignee', 'priority', 'status'])
    return json(result)
  }
  if (path === '/api/tasks' && method === 'POST') {
    // Any authenticated member can create tasks if their role permits it (frontend gates via perms).
    if (!isAdmin && !['ceo','employee'].includes(claims.role)) return json({ error: 'Not authorized to create tasks.' }, 403)
    const t = await readJson(request)
    const { assigneeEmail, assigneeCompanyId, assigneeId } = await resolveAssignee(env, t.assignee)
    try {
      const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, assignee_email, assignee_company_id, assignee_id, priority, due, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(t.title, t.assignee, assigneeEmail, assigneeCompanyId, assigneeId, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
      await notifyTaskUpdate(env, { title: t.title, assignee: t.assignee, assignee_company_id: assigneeCompanyId, priority: t.priority || 'Medium', due: t.due || null, status: t.status || 'pending' }, claims.sub, 'assigned')
      return json(mapTask({ id: result.meta.last_row_id, ...t, assignee_email: assigneeEmail, assignee_company_id: assigneeCompanyId, assignee_id: assigneeId, status: t.status || 'pending' }), 201)
    } catch {
      // Fallback for DBs without new columns (should not happen after migration, but keep compat)
      const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, priority, due, status) VALUES (?, ?, ?, ?, ?)')
        .bind(t.title, t.assignee, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
      return json(mapTask({ id: result.meta.last_row_id, ...t, status: t.status || 'pending' }), 201)
    }
  }

  /* work log timer (63) — the assignee starts/stops a session on their task;
     elapsed time is computed server-side and accumulated per session. */
  {
    const m = path.match(/^\/api\/tasks\/(\d+)\/work-log\/(start|stop)$/)
    if (m && method === 'POST') {
      const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(Number(m[1])).first()
      if (!task) return json({ error: 'Task not found.' }, 404)
      // Only the assignee runs their own work timer.
      const me = String(claims.sub || '').toLowerCase()
      if (String(task.assignee_email || '').toLowerCase() !== me) {
        return json({ error: 'Only the assignee can run this task timer.' }, 403)
      }
      const action = m[2]
      const log = safeParseArray(task.work_log)
      let seconds = Math.max(0, Number(task.work_seconds || 0))
      let startedAt = task.work_started_at || null
      let statusChanged = false
      if (action === 'start') {
        if (startedAt) return json({ error: 'Timer is already running for this task.' }, 409)
        startedAt = new Date().toISOString()
        // Starting the timer moves a pending task into progress.
        if (task.status === 'pending') {
          statusChanged = true
          task.status = 'inprogress'
        }
      } else {
        if (!startedAt) return json({ error: 'Timer is not running for this task.' }, 409)
        const end = new Date()
        const sessionSeconds = Math.max(0, Math.round((end.getTime() - new Date(startedAt).getTime()) / 1000))
        seconds += sessionSeconds
        log.push({ start: startedAt, end: end.toISOString(), seconds: sessionSeconds })
        startedAt = null
      }
      try {
        // Keep the stored session history bounded (last 100 sessions).
        await env.DB.prepare('UPDATE tasks SET work_seconds = ?, work_started_at = ?, work_log = ? WHERE id = ?')
          .bind(Math.round(seconds), startedAt, JSON.stringify(log.slice(-100)), task.id).run()
        if (statusChanged) {
          await env.DB.prepare('UPDATE tasks SET status = ? WHERE id = ?').bind('inprogress', task.id).run()
        }
      } catch {
        return json({ error: 'Work log is not supported by this database yet. Try again in a moment.' }, 500)
      }
      const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(task.id).first()
      return json(mapTask(row))
    }
  }

  {
    const m = path.match(/^\/api\/tasks\/(\d+)$/)
    if (m && method === 'PUT') {
      const body = await readJson(request)
      // Tenant scoping: company accounts may only update their own tasks.
      const callerCompany = await callerCompanyId(env, claims)
      if (callerCompany && !(await taskInCompany(env, Number(m[1]), callerCompany))) {
        return json({ error: 'Not authorized to modify this task.' }, 403)
      }
      // Work progress notes (57): client sends the full array; the server
      // sanitizes, stamps and caps it. Only the assignee, their managers,
      // CEO or admin may add notes.
      if (body.notes !== undefined) {
        if (!Array.isArray(body.notes)) return json({ error: 'notes must be an array.' }, 400)
        const row0 = await env.DB.prepare('SELECT assignee_email FROM tasks WHERE id = ?').bind(Number(m[1])).first()
        if (!row0) return json({ error: 'Task not found.' }, 404)
        const mine = String(row0.assignee_email || '').toLowerCase() === String(claims.sub || '').toLowerCase()
        if (!isAdmin && claims.role !== 'ceo' && !mine) return json({ error: 'Not authorized to add notes to this task.' }, 403)
        const actorRow = await env.DB.prepare('SELECT name FROM users WHERE lower(email) = ?').bind(String(claims.sub || '').toLowerCase()).first()
        const actorName = actorRow?.name || claims.sub
        const clean = body.notes.slice(-50).map((n) => ({
          at: n?.at || new Date().toISOString(),
          by: String(n?.by || actorName || 'Someone').slice(0, 80),
          text: String(n?.text || '').slice(0, 1000),
        })).filter((n) => n.text.trim())
        try {
          await env.DB.prepare('UPDATE tasks SET notes = ? WHERE id = ?').bind(JSON.stringify(clean), Number(m[1])).run()
        } catch {
          return json({ error: 'Notes are not supported by this database yet. Try again in a moment.' }, 500)
        }
        const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(Number(m[1])).first()
        return json(mapTask(row))
      }
      // If assignee string is being updated, also refresh normalized columns
      if (body.assignee !== undefined) {
        const { assigneeEmail, assigneeCompanyId, assigneeId } = await resolveAssignee(env, body.assignee)
        try {
          await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), assignee_email = COALESCE(?, assignee_email), assignee_company_id = COALESCE(?, assignee_company_id), assignee_id = COALESCE(?, assignee_id), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
            .bind(body.title ?? null, body.assignee ?? null, assigneeEmail, assigneeCompanyId, assigneeId, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
          const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(Number(m[1])).first()
          if (row) await notifyTaskUpdate(env, row, claims.sub, body.status === 'completed' ? 'completed' : 'updated')
          return json({ ok: true })
        } catch {
          // fallback without new columns
        }
      }
      await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
        .bind(body.title ?? null, body.assignee ?? null, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
      const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(Number(m[1])).first()
      if (row) await notifyTaskUpdate(env, row, claims.sub, body.status === 'completed' ? 'completed' : 'updated')
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      if (!isAdmin && !['ceo','employee'].includes(claims.role)) return json({ error: 'Not authorized to delete tasks.' }, 403)
      // Tenant scoping: company accounts may only delete their own tasks.
      const callerCompany = await callerCompanyId(env, claims)
      if (callerCompany && !(await taskInCompany(env, Number(m[1]), callerCompany))) {
        return json({ error: 'Not authorized to delete this task.' }, 403)
      }
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  return null
}
