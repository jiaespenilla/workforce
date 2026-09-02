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
    // Company accounts only see their own company's attendance.
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany && !email) { conditions.push('company_id = ?'); params.push(callerCompany) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY id DESC'
    const rows = await env.DB.prepare(sql).bind(...params).all().then((r) => r.results)
    const pag = parsePagination(url, 100)
    // Attendance search via q is handled by paginate; date/email filters are SQL-level so skip q for attendance
    const result = paginate(rows, pag, [])
    return json(result)
  }
  if (path === '/api/attendance' && method === 'POST') {
    const { email, company_id, type, time, overtime } = await readJson(request)
    if (!email || !type) return json({ error: 'email and type are required.' }, 400)
    const result = await env.DB.prepare(
      'INSERT INTO attendance (email, company_id, type, time, overtime) VALUES (?, ?, ?, ?, ?)'
    ).bind(email.toLowerCase(), company_id || null, type, time || new Date().toISOString(), overtime ? 1 : 0).run()
    return json({ id: result.meta.last_row_id, email: email.toLowerCase(), type, time: time || new Date().toISOString() }, 201)
  }

  return null
}
