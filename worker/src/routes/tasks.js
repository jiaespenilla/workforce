// Task endpoints — list/create/update/delete with tenant scoping.

import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { mapTask } from '../lib/db.js'
import { parsePagination, paginate } from '../lib/pagination.js'

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
    // Resolve normalized assignee columns (email / company_id / employee id)
    // from the "Name (Company)" display string.
    let assigneeEmail = null
    let assigneeCompanyId = null
    let assigneeId = null
    if (t.assignee) {
      const m = String(t.assignee).match(/^(.*)\s+\((.*)\)\s*$/)
      if (m) {
        const cname = m[2].trim()
        const comp = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(cname).first()
        if (comp) assigneeCompanyId = comp.id
        const emp = await env.DB.prepare('SELECT id, email FROM employees WHERE lower(name) = lower(?) AND company_id = ? LIMIT 1').bind(m[1].trim(), assigneeCompanyId || '').first()
        if (emp?.email) {
          assigneeEmail = emp.email.toLowerCase()
          assigneeId = emp.id
        } else {
          // fallback: try any employee with that name
          const anyEmp = await env.DB.prepare('SELECT id, email FROM employees WHERE lower(name) = lower(?) LIMIT 1').bind(m[1].trim()).first()
          if (anyEmp?.email) {
            assigneeEmail = anyEmp.email.toLowerCase()
            assigneeId = anyEmp.id
          }
        }
      }
    }
    try {
      const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, assignee_email, assignee_company_id, assignee_id, priority, due, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(t.title, t.assignee, assigneeEmail, assigneeCompanyId, assigneeId, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
      return json(mapTask({ id: result.meta.last_row_id, ...t, assignee_email: assigneeEmail, assignee_company_id: assigneeCompanyId, assignee_id: assigneeId, status: t.status || 'pending' }), 201)
    } catch {
      // Fallback for DBs without new columns (should not happen after migration, but keep compat)
      const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, priority, due, status) VALUES (?, ?, ?, ?, ?)')
        .bind(t.title, t.assignee, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
      return json(mapTask({ id: result.meta.last_row_id, ...t, status: t.status || 'pending' }), 201)
    }
  }

  {
    const m = path.match(/^\/api\/tasks\/(\d+)$/)
    if (m && method === 'PUT') {
      const body = await readJson(request)
      // If assignee string is being updated, also refresh normalized columns
      if (body.assignee !== undefined) {
        let assigneeEmail = null
        let assigneeCompanyId = null
        let assigneeId = null
        const str = String(body.assignee || '')
        const match = str.match(/^(.*)\s+\((.*)\)\s*$/)
        if (match) {
          const cname = match[2].trim()
          const comp = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(cname).first()
          if (comp) assigneeCompanyId = comp.id
          const emp = await env.DB.prepare('SELECT id, email FROM employees WHERE lower(name) = lower(?) AND company_id = ? LIMIT 1').bind(match[1].trim(), assigneeCompanyId || '').first()
          if (emp?.email) {
            assigneeEmail = emp.email.toLowerCase()
            assigneeId = emp.id
          }
        }
        try {
          await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), assignee_email = COALESCE(?, assignee_email), assignee_company_id = COALESCE(?, assignee_company_id), assignee_id = COALESCE(?, assignee_id), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
            .bind(body.title ?? null, body.assignee ?? null, assigneeEmail, assigneeCompanyId, assigneeId, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
          return json({ ok: true })
        } catch {
          // fallback without new columns
        }
      }
      await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
        .bind(body.title ?? null, body.assignee ?? null, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      if (!isAdmin && !['ceo','employee'].includes(claims.role)) return json({ error: 'Not authorized to delete tasks.' }, 403)
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  return null
}
