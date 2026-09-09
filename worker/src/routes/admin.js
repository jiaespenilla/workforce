// Platform administration — tenant data reset + user account management.

import { CEO_EMAIL, getDefaultEmployeePassword } from '../lib/constants.js'
import { hashPassword } from '../lib/crypto.js'
import { json, readJson } from '../lib/http.js'

export async function handle({ request, env, path, method, isAdmin, claims }) {
  /* admin — reset all tenant data (requires confirmation) */
  if (path === '/api/admin/reset' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Forbidden — administrator only.' }, 403)
    const body = await readJson(request)
    if ((body.confirm || '').trim() !== 'RESET') return json({ error: 'Confirmation must be exactly RESET.' }, 400)
    // One atomic D1 batch — every wipe succeeds or none does.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM attendance'),
      env.DB.prepare('DELETE FROM employee_credentials'),
      env.DB.prepare('DELETE FROM employees'),
      env.DB.prepare('DELETE FROM companies'),
      env.DB.prepare('DELETE FROM tasks'),
      env.DB.prepare('DELETE FROM notifications'),
      // Remove all company login accounts so wiped companies can't still sign in.
      // Keep only the platform accounts (administrator + platform CEO).
      env.DB.prepare(
        "DELETE FROM users WHERE role <> 'administrator' AND lower(email) <> lower(?)"
      ).bind(CEO_EMAIL),
      // Clear per-company settings (shifts, locations, kiosk configs) and
      // orphaned biometric data from the wiped employees.
      env.DB.prepare("DELETE FROM settings WHERE key LIKE 'shift_schedules:%' OR key LIKE 'company_locations:%' OR key LIKE 'kiosk_configs:%' OR key LIKE 'kiosk_device_token:%'"),
      env.DB.prepare('DELETE FROM webauthn_credentials'),
      env.DB.prepare('DELETE FROM webauthn_challenges'),
    ])
    return json({ ok: true, message: 'All tenant data reset.' })
  }

  /* admin — list user accounts (no credential material) */
  if (path === '/api/admin/users' && method === 'GET') {
    if (!isAdmin) return json({ error: 'Forbidden — administrator only.' }, 403)
    const { results } = await env.DB.prepare(
      'SELECT email, name, role, must_change_password, created_at FROM users ORDER BY created_at DESC'
    ).all()
    return json({
      users: results.map((u) => ({ ...u, usingDefaultPassword: !!u.must_change_password })),
    })
  }

  /* admin — the configured default password (so the reset dialog can show it) */
  if (path === '/api/admin/default-password' && method === 'GET') {
    if (!isAdmin) return json({ error: 'Forbidden — administrator only.' }, 403)
    return json({ password: getDefaultEmployeePassword(env) })
  }

  /* admin — reset a user's password to the deployment default (62) */
  if (path === '/api/admin/users/reset-password' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Forbidden — administrator only.' }, 403)
    const { email } = await readJson(request)
    if (!email || !String(email).includes('@')) return json({ error: 'A valid account email is required.' }, 400)
    const target = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?')
      .bind(String(email).toLowerCase()).first()
    if (!target) return json({ error: 'Account not found.' }, 404)
    // Platform accounts keep their dedicated credentials — they are not "user" accounts.
    if (target.role === 'administrator') return json({ error: 'Platform administrator accounts cannot be reset here.' }, 403)
    if (String(target.email).toLowerCase() === String(CEO_EMAIL).toLowerCase()) {
      return json({ error: 'The platform CEO account cannot be reset here.' }, 403)
    }
    // Safety net: admins change their own password via Profile → Change password.
    if (String(target.email).toLowerCase() === String(claims?.sub || '').toLowerCase()) {
      return json({ error: 'Use Profile → Change password to update your own password.' }, 400)
    }
    const password = getDefaultEmployeePassword(env)
    if (!password) return json({ error: 'No default password is configured for this deployment.' }, 500)
    const salt = crypto.randomUUID()
    await env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 1 WHERE id = ?')
      .bind(salt, await hashPassword(password, salt), target.id).run()
    return json({ ok: true, message: `Password for ${target.email} was reset to the default. They must change it at next sign-in.` })
  }

  return null
}
