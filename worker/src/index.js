// Unified Workforce API — Cloudflare Worker (D1 + R2)

const ADMIN = { username: 'admin_celestine', password: 'Celest!ne2026!', name: 'Aizl Jo Bornillo' }
const CEO_EMAIL = 'ceo@celestsolutions.com'
const CEO_PASSWORD = 'P@ssw0rd2026!'
const CEO_NAME = 'Celestine Espenilla'
const DEFAULT_EMPLOYEE_PASSWORD = 'P@ssw0rd2026!'
const NOTIFICATION_RECIPIENT = 'jiaespenilla@gmail.com'

/* ---------------- helpers ---------------- */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }
}

const enc = new TextEncoder()

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password, salt) {
  return sha256(`${salt}:${password}`)
}

function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function createToken(user, secret) {
  const payload = b64url(JSON.stringify({ sub: user.email, role: user.role, name: user.name, exp: Date.now() + 1000 * 60 * 60 * 12 }))
  const sig = await hmac(payload, secret)
  return `${payload}.${sig}`
}

async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if ((await hmac(payload, secret)) !== sig) return null
  try {
    const data = JSON.parse(atob(payload))
    if (!data.exp || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

async function requireAuth(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const claims = await verifyToken(token, env.AUTH_SECRET)
  if (!claims) throw HttpError(401, 'Unauthorized')
  return claims
}

async function requireAdmin(request, env) {
  const claims = await requireAuth(request, env)
  if (claims.role !== 'administrator') throw HttpError(403, 'Forbidden')
  return claims
}

function HttpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

/* ---------------- lazy seed ---------------- */

async function ensureSeed(env) {
  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first()
  if (count > 0) return

  async function addUser(email, name, role, password) {
    const salt = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO users (email, name, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, name, role, salt, await hashPassword(password, salt)).run()
  }

  await addUser(ADMIN.username, ADMIN.name, 'administrator', ADMIN.password)
  await addUser(CEO_EMAIL, CEO_NAME, 'ceo', CEO_PASSWORD)

  // Default role set so registration works out of the box.
  const defaults = [
    ['CEO', { dashboard: true, timekeeping: true, tasks: true, payroll: true, employees: true, kiosk: false, settings: false }],
    ['HR Manager', { dashboard: true, timekeeping: true, tasks: true, payroll: false, employees: true, kiosk: true, settings: false }],
    ['Team Lead', { dashboard: true, timekeeping: true, tasks: true, payroll: false, employees: false, kiosk: true, settings: false }],
    ['Employee', { dashboard: true, timekeeping: true, tasks: true, payroll: false, employees: false, kiosk: true, settings: false }],
  ]
  for (const [name, perms] of defaults) {
    await env.DB.prepare('INSERT INTO roles (name, perms_json) VALUES (?, ?)').bind(name, JSON.stringify(perms)).run()
  }

  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('system_name', 'Unified Workforce').run()
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('version', 'v2.4.1').run()
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('timezone', '(GMT+08:00) Asia/Manila').run()
}

/* ---------------- mapping ---------------- */

function mapCompany(row, employees) {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    address: row.address,
    city: row.city,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    logoName: row.logo_name,
    status: row.status,
    active: row.active !== 0,
    registered: row.registered,
    owner: row.owner_name ? { name: row.owner_name, title: row.owner_title, email: row.owner_email } : undefined,
    employees: employees
      .filter((e) => e.company_id === row.id)
      .map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, active: e.active !== 0 })),
  }
}

/* ---------------- router ---------------- */

export default {
  async fetch(request, env) {
    try {
      await ensureSeed(env)
      return await route(request, env)
    } catch (err) {
      return json({ error: err.message || 'Server error' }, err.status || 500)
    }
  },
}

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })

  /* ---- public ---- */
  if (path === '/api/login' && method === 'POST') {
    const { identifier, password } = await readJson(request)
    const id = (identifier || '').trim().toLowerCase()
    const user = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ? OR lower(email) = ?').bind(id, id).first()
    if (!user) return json({ error: 'Invalid credentials.' }, 401)
    const hash = await hashPassword(password || '', user.password_salt)
    if (hash !== user.password_hash) return json({ error: 'Invalid credentials.' }, 401)
    const token = await createToken({ email: user.email, role: user.role, name: user.name }, env.AUTH_SECRET)
    return json({
      token,
      user: { email: user.email, name: user.name, role: user.role, usingDefaultPassword: false },
    })
  }

  /* ---- authenticated ---- */
  if (path.startsWith('/api/')) {
    const claims = await requireAuth(request, env)
    return apiRoutes(path, method, request, env, url, claims)
  }

  return json({ error: 'Not found' }, 404)
}

async function apiRoutes(path, method, request, env, url, claims) {
  const isAdmin = claims.role === 'administrator'

  /* me */
  if (path === '/api/me' && method === 'GET') return json({ email: claims.sub, name: claims.name, role: claims.role })

  /* bootstrap — everything the app needs in one call */
  if (path === '/api/bootstrap' && method === 'GET') {
    const settingsRows = await env.DB.prepare('SELECT key, value FROM settings').all()
    const roleRows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all()
    const companyRows = await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all()
    const employeeRows = await env.DB.prepare('SELECT * FROM employees').all()
    const taskRows = await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all()
    let notifications = []
    if (isAdmin) {
      notifications = (await env.DB.prepare('SELECT * FROM notifications ORDER BY id DESC').all())
        .filter((n) => n.to_email === NOTIFICATION_RECIPIENT.toLowerCase() || n.to_email === claims.sub)
        .map(mapNotification)
    } else {
      notifications = (await env.DB.prepare('SELECT * FROM notifications WHERE to_email = ? ORDER BY id DESC').bind(claims.sub).all()).map(mapNotification)
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

  /* settings */
  if (path === '/api/settings' && method === 'PUT') {
    const body = await readJson(request)
    for (const [key, value] of Object.entries(body)) {
      await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run()
    }
    return json({ ok: true })
  }

  /* roles */
  if (path === '/api/roles' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all()
    return json(rows.map((r) => ({ id: r.id, name: r.name, perms: safeParse(r.perms_json) })))
  }
  if (path === '/api/roles' && method === 'POST') {
    const { name, perms } = await readJson(request)
    if (!name?.trim()) return json({ error: 'Role name is required.' }, 400)
    const result = await env.DB.prepare('INSERT INTO roles (name, perms_json) VALUES (?, ?)').bind(name.trim(), JSON.stringify(perms || {})).run()
    return json({ id: result.meta.last_row_id, name: name.trim(), perms: perms || {} }, 201)
  }
  {
    const m = path.match(/^\/api\/roles\/(\d+)$/)
    if (m && method === 'PUT') {
      const { name, perms } = await readJson(request)
      await env.DB.prepare('UPDATE roles SET name = ?, perms_json = ? WHERE id = ?').bind(name ?? '', JSON.stringify(perms ?? {}), Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM roles WHERE id = ?').run(Number(m[1]))
      return json({ ok: true })
    }
  }

  /* companies */
  if (path === '/api/companies' && method === 'GET') {
    const companyRows = await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all()
    const employeeRows = await env.DB.prepare('SELECT * FROM employees').all()
    return json(companyRows.map((row) => mapCompany(row, employeeRows)))
  }
  if (path === '/api/companies' && method === 'POST') {
    const body = await readJson(request)
    const id = body.id || `reg-${Date.now()}`
    await env.DB.prepare(
      `INSERT INTO companies (id, name, industry, address, city, contact_phone, contact_email, logo_name, status, active, owner_name, owner_title, owner_email, registered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.name || 'Unnamed Company', body.industry || null, body.address || null, body.city || null,
      body.contactPhone || null, body.contactEmail || null, body.logoName || null,
      body.status || 'pending', body.active === false ? 0 : 1,
      body.owner?.name || null, body.owner?.title || null, body.owner?.email || null,
      body.registered || new Date().toISOString().slice(0, 10)
    ).run()
    for (const emp of body.employees || []) {
      await insertEmployee(env, id, emp)
      // Every registered team member gets a login account with the default password.
      await ensureUser(env, emp.email, emp.name, 'employee', DEFAULT_EMPLOYEE_PASSWORD)
    }
    // Notify the administrator recipient about the new registration.
    await queueNotification(env, {
      to: NOTIFICATION_RECIPIENT,
      subject: `New company registration: ${body.name || 'Unnamed Company'}`,
      body: `Company: ${body.name}\nIndustry: ${body.industry}\nRegistered: ${body.registered}\nTeam size: ${(body.employees || []).length}`,
    })
    const employeeRows = await env.DB.prepare('SELECT * FROM employees WHERE company_id = ?').bind(id).all()
    const row = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first()
    return json(mapCompany(row, employeeRows), 201)
  }
  {
    const m = path.match(/^\/api\/companies\/([^/]+)$/)
    if (m && method === 'PUT') {
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
      await env.DB.prepare('DELETE FROM companies WHERE id = ?').bind(m[1]).run()
      return json({ ok: true })
    }
  }

  /* employees */
  {
    const m = path.match(/^\/api\/companies\/([^/]+)\/employees$/)
    if (m && method === 'POST') {
      const emp = await readJson(request)
      await insertEmployee(env, m[1], emp)
      await ensureUser(env, emp.email, emp.name, 'employee', DEFAULT_EMPLOYEE_PASSWORD)
      return json({ ok: true }, 201)
    }
  }
  {
    const m = path.match(/^\/api\/employees\/(\d+)$/)
    if (m) {
      if (method === 'PUT') {
        const body = await readJson(request)
        await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?')
          .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, Number(m[1])).run()
        return json({ ok: true })
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM employees WHERE id = ?').run(Number(m[1]))
        return json({ ok: true })
      }
    }
  }

  /* tasks */
  if (path === '/api/tasks' && method === 'GET') return json((await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all()).map(mapTask))
  if (path === '/api/tasks' && method === 'POST') {
    const t = await readJson(request)
    const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, priority, due, status) VALUES (?, ?, ?, ?, ?)')
      .bind(t.title, t.assignee, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
    return json(mapTask({ id: result.meta.last_row_id, ...t, status: t.status || 'pending' }), 201)
  }
  {
    const m = path.match(/^\/api\/tasks\/(\d+)$/)
    if (m && method === 'PUT') {
      const body = await readJson(request)
      await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
        .bind(body.title ?? null, body.assignee ?? null, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').run(Number(m[1]))
      return json({ ok: true })
    }
  }

  /* notifications */
  if (path === '/api/notifications' && method === 'GET') {
    const rows = isAdmin
      ? await env.DB.prepare('SELECT * FROM notifications ORDER BY id DESC').all()
      : await env.DB.prepare('SELECT * FROM notifications WHERE to_email = ? ORDER BY id DESC').bind(claims.sub).all()
    return json(rows.map(mapNotification))
  }
  if (path === '/api/notifications' && method === 'POST') {
    const n = await readJson(request)
    await queueNotification(env, n)
    return json({ ok: true }, 201)
  }
  if (path === '/api/notifications' && method === 'DELETE') {
    if (isAdmin) await env.DB.prepare('DELETE FROM notifications').run()
    else await env.DB.prepare('DELETE FROM notifications WHERE to_email = ?').bind(claims.sub).run()
    return json({ ok: true })
  }

  return json({ error: 'Not found' }, 404)
}

/* ---------------- shared db helpers ---------------- */

async function insertEmployee(env, companyId, emp) {
  await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active) VALUES (?, ?, ?, ?, ?)')
    .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1).run()
}

async function ensureUser(env, email, name, role, password) {
  if (!email) return
  const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email.toLowerCase()).first()
  if (existing) return
  const salt = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO users (email, name, role, password_salt, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(email.toLowerCase(), name || email, role, salt, await hashPassword(password, salt)).run()
}

async function queueNotification(env, { to, subject, body }) {
  if (!to) return
  await env.DB.prepare('INSERT INTO notifications (to_email, subject, body) VALUES (?, ?, ?)').bind(to.toLowerCase(), subject, body || '').run()
}

function mapTask(row) {
  return { id: row.id, title: row.title, assignee: row.assignee, priority: row.priority, due: row.due, status: row.status }
}

function mapNotification(row) {
  return { id: row.id, to: row.to_email, subject: row.subject, body: row.body, status: row.status, createdAt: row.created_at }
}

function safeParse(text) {
  try {
    return JSON.parse(text) || {}
  } catch {
    return {}
  }
}
