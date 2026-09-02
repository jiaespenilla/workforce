// Public (unauthenticated) API routes — login, branding, registration,
// kiosk pairing / identification / device-token punches.

import * as webAuthn from '../webauthn.js'
import {
  LOGIN_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_IP_MAX_ATTEMPTS,
  REGISTER_WINDOW_MS,
  REGISTER_MAX_ATTEMPTS,
  KIOSK_WINDOW_MS,
  KIOSK_MAX_ATTEMPTS,
  NOTIFICATION_RECIPIENT,
  DEFAULT_EMPLOYEE_PASSWORD,
  GLOBAL_SETTINGS_SQL,
} from '../lib/constants.js'
import { verifyPassword, upgradeUserPassword, createToken, verifySecret } from '../lib/crypto.js'
import { json, readJson, clientIp } from '../lib/http.js'
import { recentAttempts, recordAttempts, clearAttempts } from '../lib/rateLimit.js'
import { kioskTokenFrom, kioskTokenCompanyId } from '../lib/kiosk.js'
import { mapCompany, insertEmployee, ensureUser, queueNotification, safeParse } from '../lib/db.js'

export async function handle({ request, env, url, path, method }) {
  /* login */
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
      const rows = await env.DB.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)').bind(
        `shift_schedules:${companyId}`, `company_locations:${companyId}`, `kiosk_configs:${companyId}`, `attachment_storage:${companyId}`
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
        'INSERT INTO attendance (email, company_id, type, time, overtime, overtime_minutes) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(email, tokenCompany, body.type, body.time || new Date().toISOString(), body.overtime ? 1 : 0, Number.isFinite(body.overtimeMinutes) ? Math.round(body.overtimeMinutes) : 0).run()
      return json({ id: result.meta.last_row_id, email, type: body.type, time: body.time || new Date().toISOString(), overtimeMinutes: Number.isFinite(body.overtimeMinutes) ? Math.round(body.overtimeMinutes) : 0 }, 201)
    }
    // No kiosk token present — authenticated users fall through to the routes below.
  }

  return null
}

