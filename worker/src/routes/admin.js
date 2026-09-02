// Platform administration — tenant data reset (requires confirmation).

import { CEO_EMAIL } from '../lib/constants.js'
import { json, readJson } from '../lib/http.js'

export async function handle({ request, env, path, method, isAdmin }) {
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
      // Clear per-company settings (shifts, locations, kiosk configs)
      env.DB.prepare("DELETE FROM settings WHERE key LIKE 'shift_schedules:%' OR key LIKE 'company_locations:%' OR key LIKE 'kiosk_configs:%' OR key LIKE 'kiosk_device_token:%'"),
    ])
    return json({ ok: true, message: 'All tenant data reset.' })
  }

  return null
}
