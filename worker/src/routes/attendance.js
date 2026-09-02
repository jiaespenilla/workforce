// Authenticated attendance (clock-in/out punches) endpoints.

import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { parsePagination, paginate } from '../lib/pagination.js'

export async function handle({ request, env, url, path, method, claims }) {
  /* attendance — clock-in/out punches */
  if (path === '/api/attendance' && method === 'GET') {
    const email = url.searchParams.get('email')
    const date = url.searchParams.get('date')
    let sql = 'SELECT * FROM attendance'
    const params = []
    const conditions = []
    if (email) { conditions.push('email = ?'); params.push(email.toLowerCase()) }
    if (date) { conditions.push("time LIKE ?"); params.push(`${date}%`) }
    // Company accounts are ALWAYS restricted to their own company — even when
    // an explicit email is passed (prevents cross-tenant reads by email).
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany) { conditions.push('company_id = ?'); params.push(callerCompany) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY id DESC'
    const rows = await env.DB.prepare(sql).bind(...params).all().then((r) => r.results)
    const pag = parsePagination(url, 100)
    // Attendance search via q is handled by paginate; date/email filters are SQL-level so skip q for attendance
    const result = paginate(rows, pag, [])
    return json(result)
  }
  if (path === '/api/attendance' && method === 'POST') {
    const { email, company_id, type, time, overtime, overtimeMinutes } = await readJson(request)
    if (!email || !type) return json({ error: 'email and type are required.' }, 400)
    // Tenant scoping: company accounts may only punch for employees of their
    // own company (prevents punching for arbitrary people/companies).
    let companyId = company_id || null
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany) {
      companyId = callerCompany
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
