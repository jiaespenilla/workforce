// Authenticated session routes — /api/me, /api/change-password, /api/bootstrap.

import { DEFAULT_EMPLOYEE_PASSWORD, NOTIFICATION_RECIPIENT, GLOBAL_SETTINGS_SQL } from '../lib/constants.js'
import { verifyPassword, hashPassword } from '../lib/crypto.js'
import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { mapCompany, mapTask, mapNotification, safeParse } from '../lib/db.js'

export async function handle({ request, env, _url, path, method, claims }) {
  /* me */
  if (path === '/api/me' && method === 'GET') return json({ email: claims.sub, name: claims.name, role: claims.role })

  /* own profile (50) — read name/phone/avatar so it follows the account */
  if (path === '/api/profile' && method === 'GET') {
    const user = await env.DB.prepare('SELECT name, phone, avatar FROM users WHERE lower(email) = ?')
      .bind(String(claims.sub).toLowerCase()).first()
    if (!user) return json({ error: 'Account not found.' }, 404)
    return json({ name: user.name, phone: user.phone || '', avatar: user.avatar || null })
  }

  /* update own profile (50) — persists across devices; keeps localStorage as cache */
  if (path === '/api/profile' && method === 'PUT') {
    const body = await readJson(request)
    const name = String(body.name || '').trim().slice(0, 120)
    const phone = body.phone === undefined || body.phone === null ? null : String(body.phone).trim().slice(0, 40)
    const avatar = body.avatar === undefined ? null : (body.avatar ? String(body.avatar) : null)
    if (avatar && avatar.length > 700000) return json({ error: 'Avatar image is too large (max ~500KB).' }, 400)
    const user = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?')
      .bind(String(claims.sub).toLowerCase()).first()
    if (!user) return json({ error: 'Account not found.' }, 404)
    await env.DB.prepare('UPDATE users SET name = COALESCE(?, name), phone = ?, avatar = ? WHERE id = ?')
      .bind(name || null, phone, avatar, user.id).run()
    // Best-effort: keep the employee record's display name in sync (used by
    // People/Payroll/TimeKeeping listings).
    if (name) {
      try {
        await env.DB.prepare('UPDATE employees SET name = ? WHERE lower(email) = ?')
          .bind(name, String(claims.sub).toLowerCase()).run()
      } catch { /* employee row may not exist (platform admin) */ }
    }
    return json({ ok: true, name: name || undefined, phone, avatar })
  }

  /* change own password (any authenticated user) */
  if (path === '/api/change-password' && method === 'POST') {
    const { currentPassword, newPassword } = await readJson(request)
    if (!newPassword || String(newPassword).length < 8) return json({ error: 'New password must be at least 8 characters.' }, 400)
    if (newPassword === DEFAULT_EMPLOYEE_PASSWORD) return json({ error: 'New password cannot be the default password.' }, 400)
    const user = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(String(claims.sub).toLowerCase()).first()
    if (!user) return json({ error: 'Account not found.' }, 404)
    const { ok } = await verifyPassword(String(currentPassword || ''), user)
    if (!ok) return json({ error: 'Current password is incorrect.' }, 401)
    const salt = crypto.randomUUID()
    await env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
      .bind(salt, await hashPassword(String(newPassword), salt), user.id).run()
    return json({ ok: true })
  }

  /* bootstrap — everything the app needs in one call */
  if (path === '/api/bootstrap' && method === 'GET') {
    const settingsRows = await env.DB.prepare(GLOBAL_SETTINGS_SQL).all().then((r) => r.results)
    const roleRows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all().then((r) => r.results)
    // Tenant scoping: company accounts only see their own company, employees
    // and tasks; platform accounts (admin / platform CEO) see everything.
    const companyId = await callerCompanyId(env, claims)
    const companyRows = companyId
      ? await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().then((r) => r.results)
    const employeeRows = companyId
      ? await env.DB.prepare('SELECT e.*, u.avatar AS user_avatar FROM employees e LEFT JOIN users u ON lower(u.email) = lower(e.email) WHERE e.company_id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT e.*, u.avatar AS user_avatar FROM employees e LEFT JOIN users u ON lower(u.email) = lower(e.email)').all().then((r) => r.results)
    let taskRows = await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all().then((r) => r.results)
    if (companyId) {
      const own = await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(companyId).first()
      const suffix = `(${own?.name || ''})`
      taskRows = taskRows.filter((t) => {
        if (t.assignee_company_id) return t.assignee_company_id === companyId
        return (t.assignee || '').endsWith(suffix)
      })
    }
    let notifications = []
    if (claims.role === 'administrator') {
      notifications = (await env.DB.prepare('SELECT * FROM notifications ORDER BY id DESC').all().then((r) => r.results))
        .filter((n) => n.to_email === NOTIFICATION_RECIPIENT.toLowerCase() || n.to_email === claims.sub)
        .map(mapNotification)
    } else {
      notifications = (await env.DB.prepare('SELECT * FROM notifications WHERE to_email = ? ORDER BY id DESC').bind(claims.sub).all().then((r) => r.results)).map(mapNotification)
    }
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))
    return json({
      settings,
      roles: roleRows.map((r) => ({ id: r.id, name: r.name, perms: safeParse(r.perms_json) })),
      companies: companyRows.map((row) => mapCompany(row, employeeRows)),
      tasks: taskRows.map(mapTask),
      notifications,
    })
  }

  return null
}
