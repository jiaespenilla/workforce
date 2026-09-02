// Settings and role endpoints — global settings, per-company settings, roles.

import { COMPANY_SETTING_KEYS, GLOBAL_SETTINGS_SQL } from '../lib/constants.js'
import { json, readJson } from '../lib/http.js'
import { callerCompanyId } from '../lib/auth.js'
import { safeParse } from '../lib/db.js'

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  /* settings */
  if (path === '/api/settings' && method === 'GET') {
    const rows = await env.DB.prepare(GLOBAL_SETTINGS_SQL).all().then((r) => r.results)
    return json(Object.fromEntries(rows.map((r) => [r.key, r.value])))
  }
  /* per-company settings (shift schedules, locations, kiosk configs) */
  {
    const m = path.match(/^\/api\/company-settings\/([^/]+)$/)
    if (m && method === 'PUT') {
      const companyId = decodeURIComponent(m[1])
      // Company owners may only change their own company's settings.
      const callerCompany = await callerCompanyId(env, claims)
      if (!isAdmin && callerCompany !== companyId) return json({ error: 'You can only change settings for your own company.' }, 403)
      const body = await readJson(request)
      const statements = []
      for (const [key, value] of Object.entries(body)) {
        if (!COMPANY_SETTING_KEYS.includes(key)) return json({ error: `Key "${key}" is not company-scoped.` }, 400)
        statements.push(
          env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`${key}:${companyId}`, typeof value === 'string' ? value : JSON.stringify(value))
        )
      }
      if (statements.length) await env.DB.batch(statements)
      return json({ ok: true })
    }
  }
  if (path === '/api/settings' && method === 'PUT') {
    // Only administrators and company owners may change settings.
    if (!isAdmin && claims.role !== 'ceo') return json({ error: 'Only administrators and company owners can change settings.' }, 403)
    const body = await readJson(request)
    for (const [key, value] of Object.entries(body)) {
      await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run()
    }
    return json({ ok: true })
  }

  /* roles */
  if (path === '/api/roles' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all().then((r) => r.results)
    return json(rows.map((r) => ({ id: r.id, name: r.name, perms: safeParse(r.perms_json) })))
  }
  if (path === '/api/roles' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const { name, perms } = await readJson(request)
    if (!name?.trim()) return json({ error: 'Role name is required.' }, 400)
    const result = await env.DB.prepare('INSERT INTO roles (name, perms_json) VALUES (?, ?)').bind(name.trim(), JSON.stringify(perms || {})).run()
    return json({ id: result.meta.last_row_id, name: name.trim(), perms: perms || {} }, 201)
  }
  {
    const m = path.match(/^\/api\/roles\/(\d+)$/)
    if (m && method === 'PUT') {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      const { name, perms } = await readJson(request)
      await env.DB.prepare('UPDATE roles SET name = COALESCE(?, name), perms_json = COALESCE(?, perms_json) WHERE id = ?').bind(name ?? null, perms === undefined ? null : JSON.stringify(perms ?? {}), Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      await env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  return null
}
