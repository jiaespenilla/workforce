// Attendance history is readable here. New records are written only through
// the verified personal clock or the signed terminal ingestion route.

import { json } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { parsePagination } from '../lib/pagination.js'

export async function handle({ request, env, url, path, method, claims }) {
  if (path === '/api/attendance' && method === 'GET') {
    const email = url.searchParams.get('email')
    const date = url.searchParams.get('date')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    let sql = 'SELECT * FROM attendance'
    const params = []
    const conditions = []
    if (email) { conditions.push('lower(email) = lower(?)'); params.push(email) }
    if (date) { conditions.push('time LIKE ?'); params.push(`${date}%`) }
    if (from) { conditions.push('time >= ?'); params.push(from) }
    if (to) { conditions.push('time <= ?'); params.push(to) }
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany) { conditions.push('company_id = ?'); params.push(callerCompany) }
    if (claims.role === 'employee') {
      conditions.push('lower(email) = lower(?)')
      params.push(String(claims.sub || ''))
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    const pag = parsePagination(url, 100)
    const whereSql = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
    if (!pag.hasPagination) {
      const rows = await env.DB.prepare(sql + ' ORDER BY id DESC').bind(...params).all().then((result) => result.results)
      return json(rows, 200, request)
    }
    const total = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM attendance${whereSql}`).bind(...params).first())?.n || 0)
    const listSql = pag.limit > 0 ? sql + ' ORDER BY id DESC LIMIT ? OFFSET ?' : sql + ' ORDER BY id DESC'
    const listParams = pag.limit > 0 ? [...params, pag.limit, pag.offset] : params
    const rows = await env.DB.prepare(listSql).bind(...listParams).all().then((result) => result.results)
    return json({ data: rows, total, limit: pag.limit, offset: pag.offset, q: pag.q }, 200, request)
  }
  if (path === '/api/attendance' && method === 'POST') {
    return json({ error: 'Direct attendance entry is disabled. Use the verified personal clock or a registered terminal.' }, 405, request)
  }
  return null
}
