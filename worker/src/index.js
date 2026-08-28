// Unified Workforce API � Cloudflare Worker (D1 + R2)

import * as webAuthn from './webauthn.js'
import {
  CEO_EMAIL,
  DEFAULT_EMPLOYEE_PASSWORD,
  NOTIFICATION_RECIPIENT,
  LOGIN_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_IP_MAX_ATTEMPTS,
  REGISTER_WINDOW_MS,
  REGISTER_MAX_ATTEMPTS,
  KIOSK_WINDOW_MS,
  KIOSK_MAX_ATTEMPTS,
  COMPANY_SETTING_KEYS,
  GLOBAL_SETTINGS_SQL,
} from './lib/constants.js'
import { sha256, hashPassword, verifyPassword, upgradeUserPassword, createToken, verifySecret } from './lib/crypto.js'
import { json, cors, readJson, clientIp } from './lib/http.js'
import { requireAuth, callerCompanyId } from './lib/auth.js'
import { recentAttempts, recordAttempts, clearAttempts } from './lib/rateLimit.js'
import { kioskTokenFrom, kioskTokenCompanyId, generateKioskToken } from './lib/kiosk.js'
import { ensureSeed, migrateCompanySettings, migrateTaskColumns } from './lib/seed.js'
import { mapCompany, mapTask, mapNotification, safeParse, insertEmployee, ensureUser, queueNotification } from './lib/db.js'

function parsePagination(url, maxLimit = 50) {
  const rawLimit = url.searchParams.get('limit')
  const rawOffset = url.searchParams.get('offset')
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const hasPagination = rawLimit !== null || rawOffset !== null || q
  let limit = rawLimit !== null ? Math.max(0, parseInt(rawLimit, 10) || 0) : 0
  let offset = rawOffset !== null ? Math.max(0, parseInt(rawOffset, 10) || 0) : 0
  if (limit > maxLimit) limit = maxLimit
  return { limit, offset, q, hasPagination }
}

function paginate(data, { limit, offset, q, hasPagination }, searchFields = []) {
  let filtered = data
  if (q && searchFields.length) {
    filtered = data.filter((row) =>
      searchFields.some((f) => String(row[f] || '').toLowerCase().includes(q))
    )
  }
  const total = filtered.length
  if (!hasPagination) return filtered
  // hasPagination true: return paginated envelope even if limit==0 (means filtered set)
  if (limit > 0) filtered = filtered.slice(offset, offset + limit)
  return { data: filtered, total, limit, offset, q }
}

/* ---------------- router ---------------- */

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      // API requests → router (seeds the database on first use)
      if (url.pathname.startsWith('/api/')) {
        await ensureSeed(env)
        await migrateCompanySettings(env)
        await migrateTaskColumns(env)
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
    // Brute-force protection: cap failed attempts per account and per IP.
    const idKey = `login:id:${id}`
    const ipKey = `login:ip:${clientIp(request)}`
    const [byId, byIp] = await Promise.all([
      recentAttempts(env, idKey, LOGIN_WINDOW_MS),
      recentAttempts(env, ipKey, LOGIN_WINDOW_MS),
    ])
    if (byId >= LOGIN_MAX_ATTEMPTS || byIp >= LOGIN_IP_MAX_ATTEMPTS) {
      return json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429)
    }
    const fail = async () => {
      await recordAttempts(env, [idKey, ipKey])
      return json({ error: 'Invalid credentials.' }, 401)
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(id).first()
    if (!user) return fail()
    const { ok: passwordOk, legacy } = await verifyPassword(password || '', user)
    if (!passwordOk) return fail()
    // Transparently upgrade legacy single-pass SHA-256 hashes to PBKDF2.
    if (legacy) await upgradeUserPassword(env, user.id, password || '')
    // Successful sign-in — reset the failure counter for this account.
    await clearAttempts(env, idKey)
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
      user: { email: user.email, name: user.name, role: user.role, usingDefaultPassword: !!user.must_change_password },
    })
  }

  // Public branding — login page fetches this before any token exists.
  // Must be public so incognito/mobile (no localStorage) shows "CadensIQ".
  if ((path === '/api/settings' || path === '/api/public/settings') && method === 'GET') {
    const rows = await env.DB.prepare(GLOBAL_SETTINGS_SQL).all().then((r) => r.results)
    return json(Object.fromEntries(rows.map((r) => [r.key, r.value])))
  }

  // Per-company data (shift schedules, locations, kiosk config). Public read
  // because the stand-alone kiosk needs it without signing in — but scoped to
  // ONE company per call, so no cross-company data is exposed.
  {
    const m = path.match(/^\/api\/company-settings\/([^/]+)$/)
    if (m && method === 'GET') {
      const companyId = decodeURIComponent(m[1])
      const rows = await env.DB.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?)').bind(
        `shift_schedules:${companyId}`, `company_locations:${companyId}`, `kiosk_configs:${companyId}`
      ).all().then((r) => r.results)
      const out = {}
      for (const row of rows) {
        const base = row.key.slice(0, row.key.lastIndexOf(':'))
        try { out[base] = JSON.parse(row.value) } catch { out[base] = null }
      }
      return json(out)
    }
  }

  // Public company registration — no auth required so new customers can sign up.
  // Must run before requireAuth, otherwise unauthenticated POST returns 401 "Unauthorized".
  if (path === '/api/companies' && method === 'POST') {
    // Registration spam protection: max 5 registrations per IP per hour.
    const regKey = `register:${clientIp(request)}`
    if (await recentAttempts(env, regKey, REGISTER_WINDOW_MS) >= REGISTER_MAX_ATTEMPTS) {
      return json({ error: 'Too many registrations from this network. Please try again later.' }, 429)
    }
    await recordAttempts(env, [regKey])
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

  // Kiosk device pairing — verifies a token without a user login.
  if (path === '/api/kiosk/verify-token' && method === 'POST') {
    const { token } = await readJson(request)
    const companyId = await kioskTokenCompanyId(env, (token || '').trim())
    if (!companyId) return json({ error: 'Invalid kiosk device token.' }, 401)
    const c = await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(companyId).first()
    return json({ ok: true, companyId, companyName: c?.name || '' })
  }

  /* ---- kiosk biometric (WebAuthn) — public: the kiosk scans a fingerprint without logging in ---- */
  if (path === '/api/webauthn/authentication/options' && method === 'POST') {
    const { origin } = await readJson(request)
    try {
      return json(await webAuthn.buildAuthenticationOptions(env, { origin }))
    } catch (err) {
      return json({ error: err.message || 'Could not start fingerprint scan.' }, 400)
    }
  }
  if (path === '/api/webauthn/authentication' && method === 'POST') {
    const { response } = await readJson(request)
    try {
      const { email } = await webAuthn.verifyAuthentication(env, { response })
      const emp = await env.DB.prepare(
        'SELECT e.name, e.company_id, c.name AS company FROM employees e JOIN companies c ON c.id = e.company_id WHERE lower(e.email) = ? AND e.active = 1 AND c.active = 1'
      ).bind(String(email).toLowerCase()).first()
      if (!emp) return json({ error: 'Account not found or inactive.' }, 404)
      return json({ email, name: emp.name, role: 'employee', company: emp.company, companyId: emp.company_id, method: 'fingerprint' })
    } catch (err) {
      return json({ error: err.message || 'Fingerprint verification failed.' }, err.status || 401)
    }
  }

  /* kiosk credential identification — public, used by the stand-alone kiosk */
  if (path === '/api/kiosk/identify' && method === 'POST') {
    // Slow down credential (PIN) guessing from any single network.
    const kioskKey = `kiosk:${clientIp(request)}`
    if (await recentAttempts(env, kioskKey, KIOSK_WINDOW_MS) >= KIOSK_MAX_ATTEMPTS) {
      return json({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429)
    }
    await recordAttempts(env, [kioskKey])
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
      if (credMethod === 'pin' && row.pin_hash && (await verifySecret(v, row.pin_salt, row.pin_hash))) match = row
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
  // Kiosk device: read punches for a single employee (to decide next clock action)
  if (path === '/api/attendance' && method === 'GET') {
    const kioskToken = kioskTokenFrom(request)
    if (kioskToken) {
      const tokenCompany = await kioskTokenCompanyId(env, kioskToken)
      if (!tokenCompany) return json({ error: 'Invalid kiosk device token.' }, 401)
      const email = (url.searchParams.get('email') || '').trim().toLowerCase()
      if (!email) return json([])
      const rows = await env.DB.prepare('SELECT * FROM attendance WHERE email = ? AND company_id = ? ORDER BY id DESC').bind(email, tokenCompany).all().then((r) => r.results)
      return json(rows)
    }
  }
  // Kiosk devices record punches with a per-company device token (X-Kiosk-Token)
  // instead of a user login. App users keep using Bearer auth (handled below).
  if (path === '/api/attendance' && method === 'POST') {
    const kioskToken = kioskTokenFrom(request)
    if (kioskToken) {
      const tokenCompany = await kioskTokenCompanyId(env, kioskToken)
      if (!tokenCompany) return json({ error: 'Invalid kiosk device token.' }, 401)
      const body = await readJson(request)
      const email = String(body.email || '').trim().toLowerCase()
      if (!email || !body.type) return json({ error: 'email and type are required.' }, 400)
      // The punched employee must belong to the company this kiosk is paired with.
      const emp = await env.DB.prepare('SELECT id FROM employees WHERE lower(email) = ? AND company_id = ?').bind(email, tokenCompany).first()
      if (!emp) return json({ error: 'Employee does not belong to this kiosk company.' }, 403)
      const result = await env.DB.prepare(
        'INSERT INTO attendance (email, company_id, type, time, overtime) VALUES (?, ?, ?, ?, ?)'
      ).bind(email, tokenCompany, body.type, body.time || new Date().toISOString(), body.overtime ? 1 : 0).run()
      return json({ id: result.meta.last_row_id, email, type: body.type, time: body.time || new Date().toISOString() }, 201)
    }
    // No kiosk token present — authenticated users fall through to the routes below.
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
      ? await env.DB.prepare('SELECT * FROM employees WHERE company_id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM employees').all().then((r) => r.results)
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

  /* companies */
  if (path === '/api/companies' && method === 'GET') {
    // Tenant scoping: company accounts only see their own company.
    const companyId = await callerCompanyId(env, claims)
    const companyRows = companyId
      ? await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().then((r) => r.results)
    const employeeRows = companyId
      ? await env.DB.prepare('SELECT * FROM employees WHERE company_id = ?').bind(companyId).all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM employees').all().then((r) => r.results)
    const mapped = companyRows.map((row) => mapCompany(row, employeeRows))
    const pag = parsePagination(url, 50)
    const result = paginate(mapped, pag, ['name', 'industry', 'city'])
    if (Array.isArray(result)) return json(result)
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

  /* tasks */
  if (path === '/api/tasks' && method === 'GET') {
    let rows = await env.DB.prepare('SELECT * FROM tasks ORDER BY id DESC').all().then((r) => r.results)
    // Company accounts only see their own company's tasks.
    const companyId = await callerCompanyId(env, claims)
    if (companyId) {
      const own = await env.DB.prepare('SELECT name FROM companies WHERE id = ?').bind(companyId).first()
      const suffix = `(${own?.name || ''})`
      rows = rows.filter((t) => {
        if (t.assignee_company_id) return t.assignee_company_id === companyId
        return (t.assignee || '').endsWith(suffix)
      })
    }
    const mapped = rows.map(mapTask)
    const pag = parsePagination(url, 50)
    const result = paginate(mapped, pag, ['title', 'assignee', 'priority', 'status'])
    if (Array.isArray(result)) return json(result)
    return json(result)
  }
  if (path === '/api/tasks' && method === 'POST') {
    // Any authenticated member can create tasks if their role permits it (frontend gates via perms).
    if (!isAdmin && !['ceo','employee'].includes(claims.role)) return json({ error: 'Not authorized to create tasks.' }, 403)
    const t = await readJson(request)
    // Resolve assignee_email / company_id from "Name (Company)" string
    let assigneeEmail = null
    let assigneeCompanyId = null
    if (t.assignee) {
      const m = String(t.assignee).match(/^(.*)\s+\((.*)\)\s*$/)
      if (m) {
        const cname = m[2].trim()
        const comp = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(cname).first()
        if (comp) assigneeCompanyId = comp.id
        const emp = await env.DB.prepare('SELECT email FROM employees WHERE lower(name) = lower(?) AND company_id = ? LIMIT 1').bind(m[1].trim(), assigneeCompanyId || '').first()
        if (emp?.email) assigneeEmail = emp.email.toLowerCase()
        else {
          // fallback: try any employee with that name
          const anyEmp = await env.DB.prepare('SELECT email FROM employees WHERE lower(name) = lower(?) LIMIT 1').bind(m[1].trim()).first()
          if (anyEmp?.email) assigneeEmail = anyEmp.email.toLowerCase()
        }
      }
    }
    try {
      const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, assignee_email, assignee_company_id, priority, due, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(t.title, t.assignee, assigneeEmail, assigneeCompanyId, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
      return json(mapTask({ id: result.meta.last_row_id, ...t, assignee_email: assigneeEmail, assignee_company_id: assigneeCompanyId, status: t.status || 'pending' }), 201)
    } catch {
      // Fallback for DBs without new columns (should not happen after migration, but keep compat)
      const result = await env.DB.prepare('INSERT INTO tasks (title, assignee, priority, due, status) VALUES (?, ?, ?, ?, ?)')
        .bind(t.title, t.assignee, t.priority || 'Medium', t.due || null, t.status || 'pending').run()
      return json(mapTask({ id: result.meta.last_row_id, ...t, status: t.status || 'pending' }), 201)
    }
  }
  {
    const m = path.match(/^\/api\/tasks\/(\d+)$/)
    if (m && method === 'PUT') {
      const body = await readJson(request)
      // If assignee string is being updated, also refresh normalized columns
      if (body.assignee !== undefined) {
        let assigneeEmail = null
        let assigneeCompanyId = null
        const str = String(body.assignee || '')
        const match = str.match(/^(.*)\s+\((.*)\)\s*$/)
        if (match) {
          const cname = match[2].trim()
          const comp = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(cname).first()
          if (comp) assigneeCompanyId = comp.id
          const emp = await env.DB.prepare('SELECT email FROM employees WHERE lower(name) = lower(?) AND company_id = ? LIMIT 1').bind(match[1].trim(), assigneeCompanyId || '').first()
          if (emp?.email) assigneeEmail = emp.email.toLowerCase()
        }
        try {
          await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), assignee_email = COALESCE(?, assignee_email), assignee_company_id = COALESCE(?, assignee_company_id), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
            .bind(body.title ?? null, body.assignee ?? null, assigneeEmail, assigneeCompanyId, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
          return json({ ok: true })
        } catch {
          // fallback without new columns
        }
      }
      await env.DB.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), priority = COALESCE(?, priority), due = COALESCE(?, due), status = COALESCE(?, status) WHERE id = ?')
        .bind(body.title ?? null, body.assignee ?? null, body.priority ?? null, body.due ?? null, body.status ?? null, Number(m[1])).run()
      return json({ ok: true })
    }
    if (m && method === 'DELETE') {
      if (!isAdmin && !['ceo','employee'].includes(claims.role)) return json({ error: 'Not authorized to delete tasks.' }, 403)
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(Number(m[1])).run()
      return json({ ok: true })
    }
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
    // Company accounts only see their own company's attendance.
    const callerCompany = await callerCompanyId(env, claims)
    if (callerCompany && !email) { conditions.push('company_id = ?'); params.push(callerCompany) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY id DESC'
    const rows = await env.DB.prepare(sql).bind(...params).all().then((r) => r.results)
    const pag = parsePagination(url, 100)
    // Attendance search via q is handled by paginate; date/email filters are SQL-level so skip q for attendance
    const result = paginate(rows, pag, [])
    if (Array.isArray(result)) return json(result)
    return json(result)
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

  /* kiosk device tokens (administrator) */
  {
    const m = path.match(/^\/api\/kiosk-token\/([^/]+)$/)
    if (m) {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      const companyId = decodeURIComponent(m[1])
      if (method === 'GET') {
        // Get-or-create: each company has exactly one active kiosk token.
        const row = await env.DB.prepare("SELECT key FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?").bind(companyId).first()
        let token = row ? row.key.slice('kiosk_device_token:'.length) : null
        if (!token) {
          token = generateKioskToken()
          await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`kiosk_device_token:${token}`, companyId).run()
        }
        return json({ token, companyId })
      }
      if (method === 'DELETE') {
        await env.DB.prepare("DELETE FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?").bind(companyId).run()
        return json({ ok: true })
      }
    }
  }

  /* kiosk biometric registration (administrator) */
  if (path === '/api/webauthn/register/options' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const { email, origin } = await readJson(request)
    if (!email) return json({ error: 'email is required.' }, 400)
    try {
      return json(await webAuthn.buildRegistrationOptions(env, { username: email.trim().toLowerCase(), origin }))
    } catch (err) {
      return json({ error: err.message || 'Could not start biometric registration.' }, 400)
    }
  }
  if (path === '/api/webauthn/register' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const { email, companyId, response } = await readJson(request)
    if (!email || !companyId || !response) return json({ error: 'email, companyId and response are required.' }, 400)
    try {
      const reg = await webAuthn.registerCredential(env, { response })
      // Only one fingerprint credential per employee (simplest for a shared kiosk).
      await env.DB.prepare('DELETE FROM webauthn_credentials WHERE email = ?').bind(reg.email.toLowerCase()).run()
      await env.DB.prepare(
        'INSERT INTO webauthn_credentials (email, company_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(reg.email.toLowerCase(), companyId, reg.credentialId, reg.publicKey, reg.counter, JSON.stringify(reg.transports || [])).run()
      return json({ ok: true, email: reg.email })
    } catch (err) {
      return json({ error: err.message || 'Biometric registration failed.' }, err.status || 400)
    }
  }
  if (path === '/api/webauthn/credentials' && method === 'GET') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const email = (url.searchParams.get('email') || '').trim().toLowerCase()
    const row = await env.DB.prepare('SELECT credential_id FROM webauthn_credentials WHERE email = ?').bind(email).first()
    return json({ registered: !!row })
  }

  /* notifications */
  if (path === '/api/notifications' && method === 'GET') {
    const rows = isAdmin
      ? await env.DB.prepare('SELECT * FROM notifications ORDER BY id DESC').all().then((r) => r.results)
      : await env.DB.prepare('SELECT * FROM notifications WHERE to_email = ? ORDER BY id DESC').bind(claims.sub).all().then((r) => r.results)
    const mapped = rows.map(mapNotification)
    const pag = parsePagination(url, 50)
    const result = paginate(mapped, pag, ['subject', 'body', 'to'])
    if (Array.isArray(result)) return json(result)
    return json(result)
  }
  if (path === '/api/notifications' && method === 'POST') {
    // Sending platform notifications/email is an administrator action.
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
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

  return json({ error: 'Not found' }, 404)
}
