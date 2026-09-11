// Authenticated attendance (clock-in/out punches) endpoints.

import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { parsePagination } from '../lib/pagination.js'

export async function handle({ request, env, url, path, method, claims }) {
  /* attendance — clock-in/out punches */
  if (path === '/api/attendance' && method === 'GET') {
    const email = url.searchParams.get('email')
    const date = url.searchParams.get('date')
    // Optional range filter (full ISO timestamps, lexicographic compare):
    // from=2026-09-01T00:00:00.000Z&to=2026-09-15T23:59:59.999Z
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    let sql = 'SELECT * FROM attendance'
    const params = []
    const conditions = []
    if (email) { conditions.push('email = ?'); params.push(email.toLowerCase()) }
    if (date) { conditions.push("time LIKE ?"); params.push(`${date}%`) }
    if (from) { conditions.push('time >= ?'); params.push(from) }
    if (to) { conditions.push('time <= ?'); params.push(to) }
    // Company accounts are ALWAYS restricted to their own company — even when
    // an explicit email is passed (prevents cross-tenant reads by email).
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany) { conditions.push('company_id = ?'); params.push(callerCompany) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    // SQL-level pagination (LIMIT/OFFSET) + a COUNT for the envelope total —
    // previously the whole matching history was loaded just to slice it.
    const pag = parsePagination(url, 100)
    const whereSql = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
    if (!pag.hasPagination) {
      const rows = await env.DB.prepare(sql + ' ORDER BY id DESC').bind(...params).all().then((r) => r.results)
      return json(rows)
    }
    const total = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM attendance${whereSql}`).bind(...params).first())?.n || 0)
    const listSql = pag.limit > 0 ? sql + ' ORDER BY id DESC LIMIT ? OFFSET ?' : sql + ' ORDER BY id DESC'
    const listParams = pag.limit > 0 ? [...params, pag.limit, pag.offset] : params
    const rows = await env.DB.prepare(listSql).bind(...listParams).all().then((r) => r.results)
    return json({ data: rows, total, limit: pag.limit, offset: pag.offset, q: pag.q })
  }
  if (path === '/api/attendance' && method === 'POST') {
    const { email, company_id, type, time, overtime, overtimeMinutes } = await readJson(request)
    if (!email || !type) return json({ error: 'email and type are required.' }, 400)
    if (!['in','out'].includes(String(type).toLowerCase())) return json({ error: 'type must be in or out.' }, 400)
    // Tenant scoping: company accounts may only punch for employees of their
    // own company (prevents punching for arbitrary people/companies).
    let companyId = company_id || null
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany) {
      companyId = callerCompany
      // Integrity: signed-in (non-admin) accounts may only punch for
      // themselves — an employee token must never punch for a coworker.
      const self = String(claims.sub || '').toLowerCase()
      if (self && email.toLowerCase() !== self) {
        return json({ error: 'You can only record attendance for your own account.' }, 403)
      }
      const emp = await env.DB.prepare('SELECT id FROM employees WHERE lower(email) = ? AND company_id = ?')
        .bind(email.toLowerCase(), callerCompany).first()
      if (!emp) return json({ error: 'Employee does not belong to your company.' }, 403)
    }
    const result = await env.DB.prepare(
      'INSERT INTO attendance (email, company_id, type, time, overtime, overtime_minutes) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(email.toLowerCase(), companyId, type, time || new Date().toISOString(), overtime ? 1 : 0, Number.isFinite(overtimeMinutes) ? Math.round(overtimeMinutes) : 0).run()
    return json({ id: result.meta.last_row_id, email: email.toLowerCase(), type, time: time || new Date().toISOString(), overtimeMinutes: Number.isFinite(overtimeMinutes) ? Math.round(overtimeMinutes) : 0 }, 201)
  }

  return null
}
