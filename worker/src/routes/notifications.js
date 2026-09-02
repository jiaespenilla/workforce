// Notification endpoints — inbox listing, creation, clearing.

import { json, readJson } from '../lib/http.js'
import { mapNotification, queueNotification } from '../lib/db.js'
import { parsePagination, paginate } from '../lib/pagination.js'

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  /* notifications */
  if (path === '/api/notifications' && method === 'GET') {
    const rows = isAdmin
      ? await env.DB.prepare('SELECT * FROM notifications ORDER BY id DESC').all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM notifications WHERE to_email = ? ORDER BY id DESC').bind(claims.sub).all().then((r) => r.results)
    const mapped = rows.map(mapNotification)
    const pag = parsePagination(url, 50)
    const result = paginate(mapped, pag, ['subject', 'body', 'to'])
    return json(result)
  }
  if (path === '/api/notifications' && method === 'POST') {
    const n = await readJson(request)
    // Strict: only admins may create notifications. Task-completed notifications
    // are auto-generated server-side via tasks route; client-initiated 'completed'
    // subjects are not trusted.
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    // Validate payload
    if (!n.to || !n.subject) return json({ error: 'to and subject are required.' }, 400)
    await queueNotification(env, n)
    return json({ ok: true }, 201)
  }
  if (path === '/api/notifications' && method === 'DELETE') {
    if (isAdmin) await env.DB.prepare('DELETE FROM notifications').run()
    else await env.DB.prepare('DELETE FROM notifications WHERE to_email = ?').bind(claims.sub).run()
    return json({ ok: true })
  }

  return null
}
