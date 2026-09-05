// Company and employee endpoints — listing, updates, people management.

import { DEFAULT_EMPLOYEE_PASSWORD } from '../lib/constants.js'
import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { mapCompany, insertEmployee, ensureUser } from '../lib/db.js'
import { parsePagination, paginate } from '../lib/pagination.js'

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  /* companies */
  if (path === '/api/companies' && method === 'GET') {
    // Tenant scoping: company accounts only see their own company.
    const companyId = await callerCompanyId(env, claims)
    const companyRows = companyId
      ? await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().then((r) => r.results)
    const employeeRows = companyId
      ? await env.DB.prepare('SELECT e.*, u.avatar AS user_avatar FROM employees e LEFT JOIN users u ON lower(u.email) = lower(e.email) WHERE e.company_id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT e.*, u.avatar AS user_avatar FROM employees e LEFT JOIN users u ON lower(u.email) = lower(e.email)').all().then((r) => r.results)
    const mapped = companyRows.map((row) => mapCompany(row, employeeRows))
    const pag = parsePagination(url, 50)
    const result = paginate(mapped, pag, ['name', 'industry', 'city'])
    return json(result)
  }
  // NOTE: POST /api/companies is handled by the public registration route above
  // (it must run before requireAuth). No authenticated company-creation route.

  {
    const m = path.match(/^\/api\/companies\/([^/]+)$/)
    if (m && method === 'PUT') {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      const body = await readJson(request)
      await env.DB.prepare(
        `UPDATE companies SET name = COALESCE(?, name), industry = COALESCE(?, industry), address = COALESCE(?, address),
         city = COALESCE(?, city), contact_phone = COALESCE(?, contact_phone), contact_email = COALESCE(?, contact_email),
         status = COALESCE(?, status), active = COALESCE(?, active) WHERE id = ?`
      ).bind(body.name ?? null, body.industry ?? null, body.address ?? null, body.city ?? null,
             body.contactPhone ?? null, body.contactEmail ?? null, body.status ?? null,
             body.active === undefined ? null : body.active ? 1 : 0, m[1]).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      await env.DB.prepare('DELETE FROM companies WHERE id = ?').bind(m[1]).run()
      return json({ ok: true })
    }
  }

  /* employees */
  {
    const m = path.match(/^\/api\/companies\/([^/]+)\/employees$/)
    if (m && method === 'POST') {
      // Company owners may only add people to their own company.
      const callerCompany = await callerCompanyId(env, claims)
      if (!isAdmin && callerCompany !== m[1]) return json({ error: 'You can only manage employees of your own company.' }, 403)
      const emp = await readJson(request)
      await insertEmployee(env, m[1], emp)
      const roleForUser = (emp.role || '').trim().toLowerCase() === 'ceo' ? 'ceo' : 'employee'
      await ensureUser(env, emp.email, emp.name, roleForUser, DEFAULT_EMPLOYEE_PASSWORD)
      return json({ ok: true }, 201)
    }
  }
  {
    const m = path.match(/^\/api\/employees\/(\d+)$/)
    if (m) {
      if (method === 'PUT') {
        // Company owners may only edit people in their own company.
        const callerCompany = await callerCompanyId(env, claims)
        if (!isAdmin) {
          const target = await env.DB.prepare('SELECT company_id FROM employees WHERE id = ?').bind(Number(m[1])).first()
          if (!target || target.company_id !== callerCompany) return json({ error: 'You can only manage employees of your own company.' }, 403)
        }
        const body = await readJson(request)
        const locVal = body.locationId ?? body.location ?? null
        // Payroll fields (49): pay_type 'monthly'|'hourly', pay_rate PHP.
        // Sent as null to clear. Wrapped in try/catch so databases that have
        // not run the employee-pay migration yet still update the basics.
        const payType = body.payType === undefined ? null : (['monthly', 'hourly'].includes(String(body.payType)) ? String(body.payType) : null)
        const payRate = body.payRate === undefined || body.payRate === null || body.payRate === '' ? null : Math.max(0, Number(body.payRate) || 0)
        try {
          await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active), location_id = COALESCE(?, location_id), pay_type = ?, pay_rate = ? WHERE id = ?')
            .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, locVal, payType, payRate, Number(m[1])).run()
        } catch {
          try {
            await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active), location_id = COALESCE(?, location_id) WHERE id = ?')
              .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, locVal, Number(m[1])).run()
          } catch {
            await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?')
              .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, Number(m[1])).run()
          }
        }
        // Sync users.role when role changes (CEO vs Employee) — keep login correct
        if (body.role !== undefined) {
          const roleForUser = (body.role || '').trim().toLowerCase() === 'ceo' ? 'ceo' : 'employee'
          const empRow = await env.DB.prepare('SELECT email FROM employees WHERE id = ?').bind(Number(m[1])).first()
          if (empRow?.email) {
            await env.DB.prepare('UPDATE users SET role = ? WHERE lower(email) = lower(?)').bind(roleForUser, empRow.email).run()
          }
        }
        return json({ ok: true })
      }
      if (method === 'DELETE') {
        // Company owners may only remove people from their own company.
        const callerCompany = await callerCompanyId(env, claims)
        if (!isAdmin) {
          const target = await env.DB.prepare('SELECT company_id FROM employees WHERE id = ?').bind(Number(m[1])).first()
          if (!target || target.company_id !== callerCompany) return json({ error: 'You can only manage employees of your own company.' }, 403)
        }
        await env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(Number(m[1])).run()
        return json({ ok: true })
      }
    }
  }

  return null
}
