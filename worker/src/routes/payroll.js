// Authenticated payroll endpoints — saved payroll runs (history/audit).

import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export async function handle({ request, env, url, path, method, claims }) {
  /* payroll runs — list / create / delete (company-scoped) */
  if (path === '/api/payroll/runs' && method === 'GET') {
    const callerCompany = await callerCompanyId(env, claims)
    let rows
    if (callerCompany) {
      rows = await env.DB.prepare('SELECT * FROM payroll_runs WHERE company_id = ? ORDER BY id DESC LIMIT 100')
        .bind(callerCompany).all().then((r) => r.results)
    } else {
      rows = await env.DB.prepare('SELECT * FROM payroll_runs ORDER BY id DESC LIMIT 100').all().then((r) => r.results)
    }
    return json(rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      frequency: r.frequency,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      employeeCount: r.employee_count,
      gross: r.gross,
      deductions: r.deductions,
      net: r.net,
      details: r.details_json ? JSON.parse(r.details_json) : [],
      createdAt: r.created_at,
    })))
  }

  if (path === '/api/payroll/runs' && method === 'POST') {
    const callerCompany = await callerCompanyId(env, claims)
    const body = await readJson(request)
    const periodStart = String(body.periodStart || '').slice(0, 40)
    const periodEnd = String(body.periodEnd || '').slice(0, 40)
    if (!periodStart || !periodEnd) return json({ error: 'periodStart and periodEnd are required.' }, 400)
    const details = Array.isArray(body.details) ? body.details.slice(0, 500) : []
    const result = await env.DB.prepare(
      'INSERT INTO payroll_runs (company_id, frequency, period_start, period_end, employee_count, gross, deductions, net, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      callerCompany,
      String(body.frequency || 'custom').slice(0, 30),
      periodStart,
      periodEnd,
      Math.max(0, Math.round(num(body.employeeCount))),
      num(body.gross),
      num(body.deductions),
      num(body.net),
      JSON.stringify(details)
    ).run()
    return json({ id: result.meta.last_row_id, ok: true }, 201)
  }

  {
    const m = path.match(/^\/api\/payroll\/runs\/(\d+)$/)
    if (m && method === 'DELETE') {
      const callerCompany = await callerCompanyId(env, claims)
      const target = callerCompany
        ? await env.DB.prepare('SELECT company_id FROM payroll_runs WHERE id = ?').bind(Number(m[1])).first()
        : { company_id: callerCompany }
      if (!target) return json({ error: 'Payroll run not found.' }, 404)
      if (callerCompany && target.company_id !== callerCompany) return json({ error: 'You can only delete payroll runs of your own company.' }, 403)
      await env.DB.prepare('DELETE FROM payroll_runs WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  return null
}