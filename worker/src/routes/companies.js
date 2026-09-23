// Company and employee endpoints — listing, updates, people management.

import { getDefaultEmployeePassword } from '../lib/constants.js'
import { json, readJson } from '../lib/http.js'
import { callerCompanyId, callerAccess, canAccessPage, requireActionPermission } from '../lib/auth.js'
import { mapCompany, registerEmployees, escapeLike } from '../lib/db.js'
import { parsePagination, paginate } from '../lib/pagination.js'
import { syncAutomaticMappings } from '../lib/timeClock.js'

// (70) Resignation guard — an employee with active (non-completed) tasks must
// have them transferred (Tasks → staff table → Transfer) or completed before
// they can be set inactive or removed. Returns { n, name }.
async function unassignableTaskGuard(env, empId) {
  const emp = await env.DB.prepare('SELECT email, name, company_id FROM employees WHERE id = ?').bind(Number(empId)).first()
  if (!emp) return { n: 0, name: '' }
  const comp = emp.company_id
    ? await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(emp.company_id).first()
    : null
  const like = `%${escapeLike(`${String(emp.name || '')} (${comp?.name || ''})`)}%`
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM tasks WHERE status != 'completed' AND (assignee_email = ? OR assignee LIKE ? ESCAPE '\\')"
  ).bind(String(emp.email || '').toLowerCase(), like).first()
  return { n: Number(row?.n || 0), name: emp.name || 'This employee' }
}

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  /* companies */
  if (path === '/api/companies' && method === 'GET') {
    // Tenant scoping: company accounts only see their own company.
    const access = await callerAccess(env, claims)
    const companyId = access.companyId
    const companyRows = companyId
      ? await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().then((r) => r.results)
    const employeeRows = companyId
      ? await env.DB.prepare('SELECT e.*, u.avatar AS user_avatar FROM employees e LEFT JOIN users u ON lower(u.email) = lower(e.email) WHERE e.company_id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT e.*, u.avatar AS user_avatar FROM employees e LEFT JOIN users u ON lower(u.email) = lower(e.email)').all().then((r) => r.results)
    const mayViewPeople = isAdmin || claims.role === 'ceo' || canAccessPage(access, claims, 'employees')
    const mayViewPay = isAdmin || claims.role === 'ceo' || canAccessPage(access, claims, 'payroll')
    const visibleEmployees = mayViewPeople
      ? employeeRows
      : employeeRows.filter((employee) => String(employee.email || '').toLowerCase() === String(claims.sub || '').toLowerCase())
    const mapped = companyRows.map((row) => mapCompany(row, visibleEmployees)).map((company) => ({
      ...company,
      employees: company.employees.map((employee) => mayViewPay ? employee : { ...employee, payType: undefined, payRate: undefined }),
    }))
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
      await requireActionPermission(env, claims, 'employees', 'people', 'add', 'You do not have permission to add employees.')
      // Company owners may only add people to their own company.
      const callerCompany = await callerCompanyId(env, claims)
      if (!isAdmin && callerCompany !== m[1]) return json({ error: 'You can only manage employees of your own company.' }, 403)
      const emp = await readJson(request)
      const email = String(emp.email || '').trim().toLowerCase()
      if (!String(emp.name || '').trim()) return json({ error: 'Employee name is required.' }, 400)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid employee email is required.' }, 400)
      if (String(emp.role || '').trim().toLowerCase() === 'ceo' && !isAdmin && claims.role !== 'ceo') {
        return json({ error: 'Only an administrator or company owner can assign the CEO role.' }, 403)
      }
      try {
        await registerEmployees(env, m[1], [{ ...emp, email }], getDefaultEmployeePassword(env))
      } catch (error) {
        const message = String(error?.message || '')
        if (message.includes('DEFAULT_EMPLOYEE_PASSWORD')) return json({ error: 'No default employee password is configured.' }, 500)
        if (message.includes('EMPLOYEE_EMAIL_IN_USE') || /unique/i.test(message)) return json({ error: 'That employee email is already registered.' }, 409)
        throw error
      }
      const added = await env.DB.prepare('SELECT id, active FROM employees WHERE company_id = ? AND lower(email) = lower(?) LIMIT 1')
        .bind(m[1], email).first()
      if (added?.id && added.active === 1) {
        await syncAutomaticMappings(env, { companyId: m[1], employeeId: added.id })
      }
      return json({ ok: true }, 201)
    }
  }
  {
    const m = path.match(/^\/api\/employees\/(\d+)$/)
    if (m) {
      if (method === 'PUT') {
        await requireActionPermission(env, claims, 'employees', 'people', 'edit', 'You do not have permission to edit employees.')
        // Company owners may only edit people in their own company.
        const callerCompany = await callerCompanyId(env, claims)
        let target
        if (!isAdmin) {
          target = await env.DB.prepare('SELECT company_id, role, email, pay_type, pay_rate FROM employees WHERE id = ?').bind(Number(m[1])).first()
          if (!target || target.company_id !== callerCompany) return json({ error: 'You can only manage employees of your own company.' }, 403)
        }
        const body = await readJson(request)
        if (!target) target = await env.DB.prepare('SELECT company_id, role, email, pay_type, pay_rate FROM employees WHERE id = ?').bind(Number(m[1])).first()
        if (!target) return json({ error: 'Employee not found.' }, 404)
        const targetIsCeo = String(target.role || '').trim().toLowerCase() === 'ceo'
        const assigningCeo = body.role !== undefined && String(body.role || '').trim().toLowerCase() === 'ceo'
        if (!isAdmin && claims.role !== 'ceo' && (targetIsCeo || assigningCeo)) {
          return json({ error: 'Only an administrator or company owner can manage the CEO role.' }, 403)
        }
        // (70) Resignation guard: active tasks must be transferred or
        // completed before the employee can be set inactive.
        if (body.active === false) {
          const guard = await unassignableTaskGuard(env, Number(m[1]))
          if (guard.n > 0) {
            return json({ error: `${guard.name} still has ${guard.n} active task${guard.n === 1 ? '' : 's'} — transfer them first (Tasks → staff progress table → Transfer) or mark them completed before setting this employee inactive.` }, 409)
          }
        }
        const locVal = body.locationId ?? body.location ?? null
        // Payroll fields (49): pay_type 'monthly'|'hourly', pay_rate PHP.
        // Sent as null to clear. Wrapped in try/catch so databases that have
        // not run the employee-pay migration yet still update the basics.
        const payType = body.payType === undefined
          ? (target.pay_type ?? null)
          : (['monthly', 'hourly'].includes(String(body.payType)) ? String(body.payType) : null)
        const payRate = body.payRate === undefined
          ? (target.pay_rate ?? null)
          : (body.payRate === null || body.payRate === '' ? null : Math.max(0, Number(body.payRate) || 0))
        try {
          await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active), location_id = COALESCE(?, location_id), pay_type = ?, pay_rate = ? WHERE id = ?')
            .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, locVal, payType, payRate, Number(m[1])).run()
        } catch (e) {
          // Fallback for DBs missing the payroll columns — logged so schema
          // drift is visible instead of silently reduced functionality.
          console.error('PUT /api/employees: payroll columns missing, retrying without them:', e?.message || e)
          try {
            await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active), location_id = COALESCE(?, location_id) WHERE id = ?')
              .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, locVal, Number(m[1])).run()
          } catch (e2) {
            console.error('PUT /api/employees: location column missing, using base columns:', e2?.message || e2)
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
        const updated = await env.DB.prepare('SELECT id, company_id, active FROM employees WHERE id = ?')
          .bind(Number(m[1])).first()
        if (updated?.active === 1) {
          await syncAutomaticMappings(env, { companyId: updated.company_id, employeeId: updated.id })
        }
        return json({ ok: true })
      }
      if (method === 'DELETE') {
        await requireActionPermission(env, claims, 'employees', 'people', 'delete', 'You do not have permission to remove employees.')
        // Company owners may only remove people from their own company.
        const callerCompany = await callerCompanyId(env, claims)
        let target
        if (!isAdmin) {
          target = await env.DB.prepare('SELECT company_id, role, email FROM employees WHERE id = ?').bind(Number(m[1])).first()
          if (!target || target.company_id !== callerCompany) return json({ error: 'You can only manage employees of your own company.' }, 403)
        }
        if (!target) target = await env.DB.prepare('SELECT company_id, role, email FROM employees WHERE id = ?').bind(Number(m[1])).first()
        if (!target) return json({ error: 'Employee not found.' }, 404)
        if (!isAdmin && claims.role !== 'ceo' && String(target.role || '').trim().toLowerCase() === 'ceo') {
          return json({ error: 'Only an administrator or company owner can remove a CEO account.' }, 403)
        }
        if (String(target.email || '').toLowerCase() === String(claims.sub || '').toLowerCase()) {
          return json({ error: 'You cannot remove your own signed-in account.' }, 400)
        }
        // (70) Same guard as deactivation — never orphan active tasks.
        const guard = await unassignableTaskGuard(env, Number(m[1]))
        if (guard.n > 0) {
          return json({ error: `${guard.name} still has ${guard.n} active task${guard.n === 1 ? '' : 's'} — transfer them first (Tasks → staff progress table → Transfer) or mark them completed before removing this employee.` }, 409)
        }
        // Keep the employee row for historical attendance/payroll links, while
        // revoking every way the former employee could sign in or punch.
        await env.DB.batch([
          env.DB.prepare('UPDATE employees SET active = 0 WHERE id = ?').bind(Number(m[1])),
          env.DB.prepare('DELETE FROM users WHERE lower(email) = lower(?) AND role <> ?').bind(target.email, 'administrator'),
          env.DB.prepare('DELETE FROM webauthn_credentials WHERE lower(email) = lower(?)').bind(target.email),
          env.DB.prepare('DELETE FROM terminal_employee_mappings WHERE employee_id = ?').bind(Number(m[1])),
        ])
        return json({ ok: true, archived: true })
      }
    }
  }

  return null
}
