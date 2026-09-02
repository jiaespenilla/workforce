// Organization reference lists — departments, positions, locations, etc.

import { json, readJson } from '../lib/http.js'

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  /* organization reference lists (departments, positions, etc.) */
  if (path === '/api/org-units' && method === 'GET') {
    const kind = url.searchParams.get('kind')
    const rows = kind
      ? await env.DB.prepare('SELECT * FROM org_units WHERE kind = ? ORDER BY name').bind(kind).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM org_units ORDER BY kind, name').all().then((r) => r.results)
    return json(rows)
  }
  if (path === '/api/org-units' && method === 'POST') {
    if (!isAdmin && claims.role !== 'ceo') return json({ error: 'Only administrators and company owners can manage organization units.' }, 403)
    const { kind, name, code, parent_id } = await readJson(request)
    if (!kind || !name?.trim()) return json({ error: 'kind and name are required.' }, 400)
    const result = await env.DB.prepare('INSERT INTO org_units (kind, name, code, parent_id) VALUES (?, ?, ?, ?)')
      .bind(kind, name.trim(), code || null, parent_id ?? null).run()
    return json({ id: result.meta.last_row_id, kind, name: name.trim(), code: code || null }, 201)
  }
  {
    const m = path.match(/^\/api\/org-units\/(\d+)$/)
    if (m && method === 'PUT') {
      if (!isAdmin && claims.role !== 'ceo') return json({ error: 'Only administrators and company owners can manage organization units.' }, 403)
      const { name, code } = await readJson(request)
      await env.DB.prepare('UPDATE org_units SET name = COALESCE(?, name), code = COALESCE(?, code) WHERE id = ?')
        .bind(name ?? null, code ?? null, Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      if (!isAdmin && claims.role !== 'ceo') return json({ error: 'Only administrators and company owners can manage organization units.' }, 403)
      await env.DB.prepare('DELETE FROM org_units WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  return null
}
