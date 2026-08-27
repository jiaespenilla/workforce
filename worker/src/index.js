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

  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('system_name', 'CadensIQ').run()
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('version', 'v0.1.0').run()
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
      .map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, active: e.active !== 0, locationId: e.location_id || null, location: e.location || null })),
  }
}

/* ---------------- router ---------------- */

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      // API requests → router (seeds the database on first use)
      if (url.pathname.startsWith('/api/')) {
        await ensureSeed(env)
        return await route(request, env)
      }

      // Static assets (JS/CSS/images) → let Cloudflare cache them (fingerprinted filenames)
      if (url.pathname.match(/\.\w{2,5}$/)) {
        return env.ASSETS.fetch(request)
      }

      // HTML pages (/, /login, /register, etc.) → always fetch fresh, no CDN cache.
      // This prevents stale "Unified Workforce" after deploys.
      const assetRequest = new Request(request.url, request)
      assetRequest.headers.set('Cache-Control', 'no-store')
      const assetResponse = await env.ASSETS.fetch(assetRequest)
      const body = await assetResponse.arrayBuffer()
      return new Response(body, {
        status: assetResponse.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'CDN-Cache-Control': 'no-store',
        },
      })
    } catch (err) {
      return json({ error: err.message || 'Server error' }, err.status || 500)
    }
  },
}

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
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
    // Block inactive company/employee logins (admin/ceo have no company row)
    if (user.role !== 'administrator' && user.role !== 'ceo') {
      const empCompany = await env.DB.prepare('SELECT c.active as company_active, e.active as emp_active FROM employees e JOIN companies c ON c.id = e.company_id WHERE lower(e.email) = ? LIMIT 1').bind(id).first()
      if (empCompany) {
        if (empCompany.company_active === 0) return json({ error: 'Company is deactivated. Contact administrator.' }, 403)
        if (empCompany.emp_active === 0) return json({ error: 'Your account is deactivated. Contact administrator.' }, 403)
      }
    }
    const token = await createToken({ email: user.email, role: user.role, name: user.name }, env.AUTH_SECRET)
    return json({
      token,
      user: { email: user.email, name: user.name, role: user.role, usingDefaultPassword: false },
    })
  }

  // Public branding — login page fetches this before any token exists.
  // Must be public so incognito/mobile (no localStorage) shows "CadensIQ".
  if ((path === '/api/settings' || path === '/api/public/settings') && method === 'GET') {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all().then((r) => r.results)
    return json(Object.fromEntries(rows.map((r) => [r.key, r.value])))
  }

  // Public company registration — no auth required so new customers can sign up.
  // Must run before requireAuth, otherwise unauthenticated POST returns 401 "Unauthorized".
  if (path === '/api/companies' && method === 'POST') {
    const body = await readJson(request)
    const trimmedName = (body.name || '').trim()
    if (trimmedName) {
      const dup = await env.DB.prepare('SELECT id, name FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(trimmedName).first()
      if (dup) return json({ error: `Company name "${dup.name}" is already registered. Please choose a different name.` }, 409)
    }
    const id = body.id || `reg-${Date.now()}`
    await env.DB.prepare(
      `INSERT INTO companies (id, name, industry, address, city, contact_phone, contact_email, logo_name, status, active, owner_name, owner_title, owner_email, registered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, trimmedName || 'Unnamed Company', body.industry || null, body.address || null, body.city || null,
      body.contactPhone || null, body.contactEmail || null, body.logoName || null,
      body.status || 'pending', body.active === false ? 0 : 1,
      body.owner?.name || null, body.owner?.title || null, body.owner?.email || null,
      body.registered || new Date().toISOString().slice(0, 10)
    ).run()
    for (const emp of body.employees || []) {
      await insertEmployee(env, id, emp)
      const roleForUser = (emp.role || '').trim().toLowerCase() === 'ceo' ? 'ceo' : 'employee'
      await ensureUser(env, emp.email, emp.name, roleForUser, DEFAULT_EMPLOYEE_PASSWORD)
    }
    await queueNotification(env, {
      to: NOTIFICATION_RECIPIENT,
      subject: `New company registration: ${body.name || 'Unnamed Company'}`,
      body: `Company: ${body.name}\nIndustry: ${body.industry}\nRegistered: ${body.registered}\nTeam size: ${(body.employees || []).length}`,
    })
    const employeeRows = await env.DB.prepare('SELECT * FROM employees WHERE company_id = ?').bind(id).all().then((r) => r.results)
    const row = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first()
    return json(mapCompany(row, employeeRows), 201)
  }

  // Public duplicate-name check for registration — lightweight, no auth needed.
  if (path === '/api/companies/check' && method === 'GET') {
    const name = (url.searchParams.get('name') || '').trim()
    if (!name) return json({ exists: false })
    const row = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(name).first()
    return json({ exists: !!row, name })
  }

  // Public roles for the registration form (unauthenticated users need to pick a role).
  if (path === '/api/roles' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all().then((r) => r.results)
    return json(rows.map((r) => ({ id: r.id, name: r.name, perms: safeParse(r.perms_json) })))
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
    const settingsRows = await env.DB.prepare('SELECT key, value FROM settings').all().then((r) => r.results)
    const roleRows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all().then((r) => r.results)
    const companyRows = await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().then((r) => r.results)
    const employeeRows = await env.DB.prepare('SELECT * FROM employees').all().then((r) => r.results)
    const taskRows = await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all().then((r) => r.results)
    let notifications = []
    if (isAdmin) {
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

  /* settings */
  if (path === '/api/settings' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all().then((r) => r.results)
    return json(Object.fromEntries(rows.map((r) => [r.key, r.value])))
  }
  if (path === '/api/settings' && method === 'PUT') {
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
      await env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  /* companies */
  if (path === '/api/companies' && method === 'GET') {
    const companyRows = await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().then((r) => r.results)
    const employeeRows = await env.DB.prepare('SELECT * FROM employees').all().then((r) => r.results)
    return json(companyRows.map((row) => mapCompany(row, employeeRows)))
  }
  if (path === '/api/companies' && method === 'POST') {
    const body = await readJson(request)
    const trimmedName = (body.name || '').trim()
    if (trimmedName) {
      const dup = await env.DB.prepare('SELECT id, name FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(trimmedName).first()
      if (dup) return json({ error: `Company name "${dup.name}" is already registered. Please choose a different name.` }, 409)
    }
    const id = body.id || `reg-${Date.now()}`
    await env.DB.prepare(
      `INSERT INTO companies (id, name, industry, address, city, contact_phone, contact_email, logo_name, status, active, owner_name, owner_title, owner_email, registered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, trimmedName || 'Unnamed Company', body.industry || null, body.address || null, body.city || null,
      body.contactPhone || null, body.contactEmail || null, body.logoName || null,
      body.status || 'pending', body.active === false ? 0 : 1,
      body.owner?.name || null, body.owner?.title || null, body.owner?.email || null,
      body.registered || new Date().toISOString().slice(0, 10)
    ).run()
    for (const emp of body.employees || []) {
      await insertEmployee(env, id, emp)
      // Every registered team member gets a login account — respect CEO role
      const roleForUser = (emp.role || '').trim().toLowerCase() === 'ceo' ? 'ceo' : 'employee'
      await ensureUser(env, emp.email, emp.name, roleForUser, DEFAULT_EMPLOYEE_PASSWORD)
    }
    // Notify the administrator recipient about the new registration.
    await queueNotification(env, {
      to: NOTIFICATION_RECIPIENT,
      subject: `New company registration: ${body.name || 'Unnamed Company'}`,
      body: `Company: ${body.name}\nIndustry: ${body.industry}\nRegistered: ${body.registered}\nTeam size: ${(body.employees || []).length}`,
    })
    const employeeRows = await env.DB.prepare('SELECT * FROM employees WHERE company_id = ?').bind(id).all().then((r) => r.results)
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
      const roleForUser = (emp.role || '').trim().toLowerCase() === 'ceo' ? 'ceo' : 'employee'
      await ensureUser(env, emp.email, emp.name, roleForUser, DEFAULT_EMPLOYEE_PASSWORD)
      return json({ ok: true }, 201)
    }
  }
  {
    const m = path.match(/^\/api\/employees\/(\d+)$/)
    if (m) {
      if (method === 'PUT') {
        const body = await readJson(request)
        const locVal = body.locationId ?? body.location ?? null
        try {
          await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active), location_id = COALESCE(?, location_id) WHERE id = ?')
            .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, locVal, Number(m[1])).run()
        } catch {
          await env.DB.prepare('UPDATE employees SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?')
            .bind(body.name ?? null, body.role ?? null, body.active === undefined ? null : body.active ? 1 : 0, Number(m[1])).run()
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
        await env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(Number(m[1])).run()
        return json({ ok: true })
      }
    }
  }

  /* tasks */
  if (path === '/api/tasks' && method === 'GET') return json((await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all().then((r) => r.results)).map(mapTask))
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
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  /* kiosk credential identification — public, used by the stand-alone kiosk */
  if (path === '/api/kiosk/identify' && method === 'POST') {
    const { method: credMethod, value } = await readJson(request)
    const v = (value || '').trim()
    if (!v) return json({ error: 'Credential is required.' }, 400)
    const rows = await env.DB.prepare(
      `SELECT ec.*, e.name AS emp_name, e.company_id, e.active as emp_active, c.active as company_active
       FROM employee_credentials ec JOIN employees e ON e.email = ec.email JOIN companies c ON c.id = e.company_id WHERE e.active = 1 AND c.active = 1`
    ).all().then((r) => r.results)
    let match = null
    for (const row of rows) {
      if (credMethod === 'fingerprint' && row.fp_token && row.fp_token === v) match = row
      if (credMethod === 'qr' && row.qr_code && row.qr_code === v) match = row
      if (credMethod === 'pin' && row.pin_hash && (await hashPassword(v, row.pin_salt)) === row.pin_hash) match = row
      if (match) break
    }
    // Simulated hardware: touching the sensor with no scanner present matches
    // the only registered fingerprint (if exactly one exists).
    if (!match && credMethod === 'fingerprint' && v === 'SIM_FP') {
      const fpRows = rows.filter((r) => r.fp_token)
      if (fpRows.length === 1) match = fpRows[0]
    }
    if (!match) return json({ error: 'Not recognized. Please register your credential first.' }, 404)
    const emp = await env.DB.prepare('SELECT name, company_id FROM employees WHERE email = ?').bind(match.email).first()
    const company = await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(emp.company_id).first()
    return json({ email: match.email, name: emp.name, role: 'employee', company: company?.name || '', companyId: emp.company_id })
  }

  /* kiosk employee directory fallback */
  if (path === '/api/kiosk/directory' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT e.id, e.name, e.email, c.name AS company FROM employees e JOIN companies c ON c.id = e.company_id WHERE e.active = 1 AND c.active = 1`
    ).all().then((r) => r.results)
    return json(rows)
  }

  /* attendance — clock-in/out punches */
  if (path === '/api/attendance' && method === 'GET') {
    const email = url.searchParams.get('email')
    const date = url.searchParams.get('date')
    let sql = 'SELECT * FROM attendance'
    const params = []
    const conditions = []
    if (email) { conditions.push('email = ?'); params.push(email.toLowerCase()) }
    if (date) { conditions.push("time LIKE ?"); params.push(`${date}%`) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY id DESC'
    const rows = await env.DB.prepare(sql).bind(...params).all().then((r) => r.results)
    return json(rows)
  }
  if (path === '/api/attendance' && method === 'POST') {
    const { email, company_id, type, time, overtime } = await readJson(request)
    if (!email || !type) return json({ error: 'email and type are required.' }, 400)
    const result = await env.DB.prepare(
      'INSERT INTO attendance (email, company_id, type, time, overtime) VALUES (?, ?, ?, ?, ?)'
    ).bind(email.toLowerCase(), company_id || null, type, time || new Date().toISOString(), overtime ? 1 : 0).run()
    return json({ id: result.meta.last_row_id, email: email.toLowerCase(), type, time: time || new Date().toISOString() }, 201)
  }

  /* credentials management — admins manage anyone; users manage their own */
  if (path === '/api/credentials/qr' && method === 'POST') {
    const { email } = await readJson(request)
    if (!email) return json({ error: 'Email is required.' }, 400)
    const target = email.toLowerCase()
    if (!isAdmin && claims.sub !== target) return json({ error: 'Forbidden' }, 403)
    const existing = await env.DB.prepare('SELECT qr_code FROM employee_credentials WHERE email = ?').bind(target).first()
    if (existing?.qr_code) return json({ code: existing.qr_code })
    const code = 'UWQ-' + (await sha256(target)).slice(0, 16).toUpperCase()
    await env.DB.prepare(
      `INSERT INTO employee_credentials (email, qr_code) VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET qr_code = excluded.qr_code`
    ).bind(target, code).run()
    return json({ code })
  }
  if (path === '/api/credentials' && method === 'POST') {
    const { email, kind, value } = await readJson(request)
    if (!email || !kind || !value) return json({ error: 'email, kind and value are required.' }, 400)
    const e = email.toLowerCase()
    // Users may only register their own credentials; admins can register anyone.
    if (!isAdmin && claims.sub !== e) return json({ error: 'Forbidden' }, 403)
    if (kind === 'fingerprint') {
      await env.DB.prepare(
        `INSERT INTO employee_credentials (email, fp_token) VALUES (?, ?)
         ON CONFLICT(email) DO UPDATE SET fp_token = excluded.fp_token`
      ).bind(e, value).run()
    } else if (kind === 'pin') {
      const salt = crypto.randomUUID()
      await env.DB.prepare(
        `INSERT INTO employee_credentials (email, pin_salt, pin_hash) VALUES (?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET pin_salt = excluded.pin_salt, pin_hash = excluded.pin_hash`
      ).bind(e, salt, await hashPassword(value, salt)).run()
    } else {
      return json({ error: 'Unknown credential kind.' }, 400)
    }
    return json({ ok: true })
  }

  {
    const m = path.match(/^\/api\/credentials\/([^/]+)$/)
    if (m && method === 'GET') {
      const targetEmail = decodeURIComponent(m[1]).toLowerCase()
      // Users may only view their own credentials; admins can view any.
      if (!isAdmin && claims.sub !== targetEmail) return json({ error: 'Forbidden' }, 403)
      const row = await env.DB.prepare('SELECT * FROM employee_credentials WHERE email = ?').bind(targetEmail).first()
      return json({
        fpToken: row?.fp_token || null,
        pinSet: !!row?.pin_hash,
        qrCode: row?.qr_code || null,
      })
    }
  }

  /* organization reference lists (departments, positions, etc.) */  if (path === '/api/org-units' && method === 'GET') {
    const kind = url.searchParams.get('kind')
    const rows = kind
      ? await env.DB.prepare('SELECT * FROM org_units WHERE kind = ? ORDER BY name').bind(kind).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM org_units ORDER BY kind, name').all().then((r) => r.results)
    return json(rows)
  }
  if (path === '/api/org-units' && method === 'POST') {
    const { kind, name, code, parent_id } = await readJson(request)
    if (!kind || !name?.trim()) return json({ error: 'kind and name are required.' }, 400)
    const result = await env.DB.prepare('INSERT INTO org_units (kind, name, code, parent_id) VALUES (?, ?, ?, ?)')
      .bind(kind, name.trim(), code || null, parent_id ?? null).run()
    return json({ id: result.meta.last_row_id, kind, name: name.trim(), code: code || null }, 201)
  }
  {
    const m = path.match(/^\/api\/org-units\/(\d+)$/)
    if (m && method === 'PUT') {
      const { name, code } = await readJson(request)
      await env.DB.prepare('UPDATE org_units SET name = COALESCE(?, name), code = COALESCE(?, code) WHERE id = ?')
        .bind(name ?? null, code ?? null, Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM org_units WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
  }

  /* notifications */
  if (path === '/api/notifications' && method === 'GET') {
    const rows = isAdmin
      ? await env.DB.prepare('SELECT * FROM notifications ORDER BY id DESC').all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM notifications WHERE to_email = ? ORDER BY id DESC').bind(claims.sub).all().then((r) => r.results)
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

  /* admin — reset all tenant data (requires confirmation) */
  if (path === '/api/admin/reset' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Forbidden — administrator only.' }, 403)
    const body = await readJson(request)
    if ((body.confirm || '').trim() !== 'RESET') return json({ error: 'Confirmation must be exactly RESET.' }, 400)
    await env.DB.prepare('DELETE FROM attendance').run()
    await env.DB.prepare('DELETE FROM employee_credentials').run()
    await env.DB.prepare('DELETE FROM employees').run()
    await env.DB.prepare('DELETE FROM companies').run()
    await env.DB.prepare('DELETE FROM tasks').run()
    await env.DB.prepare('DELETE FROM notifications').run()
    // Remove all company login accounts so wiped companies can't still sign in.
    // Keep only the platform accounts (administrator + platform CEO).
    await env.DB.prepare(
      "DELETE FROM users WHERE role <> 'administrator' AND lower(email) <> lower(?)"
    ).bind(CEO_EMAIL).run()
    // Clear per-company blobs stored in settings (shifts, locations, kiosk configs)
    await env.DB.prepare("DELETE FROM settings WHERE key IN ('shift_schedules','company_locations','kiosk_configs')").run()
    return json({ ok: true, message: 'All tenant data reset.' })
  }

  return json({ error: 'Not found' }, 404)
}

/* ---------------- shared db helpers ---------------- */

async function insertEmployee(env, companyId, emp) {
  const locId = emp.locationId || emp.location || null
  // Try with location_id column (may be INTEGER affinity but SQLite accepts TEXT); fallback to without if schema old
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active, location_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1, locId).run()
  } catch {
    await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active) VALUES (?, ?, ?, ?, ?)')
      .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1).run()
  }
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
  // Best-effort transactional email via Cloudflare Email Service (requires send_email binding + verified domain).
  // Falls back to in-app notification if Email Service not configured — notification is always stored in DB.
  if (env.EMAIL) {
    try {
      await env.EMAIL.send({
        from: { email: 'noreply@celestsolutions.workers.dev', name: 'CadensIQ' },
        to,
        subject,
        text: body || '',
        html: `<div style="font-family:sans-serif;white-space:pre-line">${(body || '').replace(/</g, '&lt;')}</div>`,
      })
    } catch (e) {
      console.error('EMAIL send failed (check wrangler email sending enable + verified domain):', e.message)
    }
  }
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
