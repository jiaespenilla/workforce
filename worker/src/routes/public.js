// Public API routes are intentionally limited to sign-in, public branding,
// company registration, and the role list needed by the registration form.

import {
  LOGIN_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_IP_MAX_ATTEMPTS,
  REGISTER_WINDOW_MS,
  REGISTER_MAX_ATTEMPTS,
  NOTIFICATION_RECIPIENT,
  GLOBAL_SETTINGS_SQL,
  getDefaultEmployeePassword,
} from '../lib/constants.js'
import { verifyPassword, upgradeUserPassword, createToken, pbkdf2 } from '../lib/crypto.js'
import { json, readJson, clientIp, clampText } from '../lib/http.js'
import { recentAttempts, recordAttempts, clearAttempts } from '../lib/rateLimit.js'
import { mapCompany, registerEmployees, queueNotification, safeParse } from '../lib/db.js'

export async function handle({ request, env, url, path, method }) {
  const retiredPrefix = ['/api/kiosk/', '/api/webauthn/', '/api/kiosk-token/', '/api/credentials/']
  if (retiredPrefix.some((prefix) => path.startsWith(prefix)) ||
      path === '/api/credentials' ||
      (path === '/api/attendance' && request.headers.get('X-Kiosk-Token'))) {
    return json({ error: 'The shared mobile kiosk has been retired. Sign in and use Time Keeping instead.' }, 410, request)
  }

  if (path === '/api/login' && method === 'POST') {
    const { identifier, password } = await readJson(request)
    const id = String(identifier || '').trim().toLowerCase()
    const idKey = `login:id:${id}`
    const ipKey = `login:ip:${clientIp(request)}`
    const [byId, byIp] = await Promise.all([
      recentAttempts(env, idKey, LOGIN_WINDOW_MS),
      recentAttempts(env, ipKey, LOGIN_WINDOW_MS),
    ])
    if (byId >= LOGIN_MAX_ATTEMPTS || byIp >= LOGIN_IP_MAX_ATTEMPTS) {
      return json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429, request)
    }
    const fail = async () => {
      await recordAttempts(env, [idKey, ipKey])
      return json({ error: 'Invalid credentials.' }, 401, request)
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(id).first()
    if (!user) {
      await pbkdf2(password || 'dummy', 'dummy-salt').catch(() => {})
      return fail()
    }
    const { ok, legacy } = await verifyPassword(password || '', user)
    if (!ok) return fail()
    if (legacy) await upgradeUserPassword(env, user.id, password || '')
    await clearAttempts(env, idKey)
    if (user.role !== 'administrator') {
      const owner = await env.DB.prepare(
        `SELECT c.active AS company_active, c.status AS company_status, e.active AS emp_active
         FROM employees e JOIN companies c ON c.id = e.company_id WHERE lower(e.email) = ? LIMIT 1`
      ).bind(id).first()
      if (!owner) return json({ error: 'This account is no longer linked to an active employee. Contact an administrator.' }, 403, request)
      if (owner && (owner.company_active === 0 || owner.company_status === 'rejected')) return json({ error: 'Company is not active. Contact administrator.' }, 403, request)
      if (owner?.emp_active === 0) return json({ error: 'Your account is deactivated. Contact administrator.' }, 403, request)
    }
    const token = await createToken({ email: user.email, role: user.role, name: user.name }, env.AUTH_SECRET)
    return json({ token, user: { email: user.email, name: user.name, role: user.role, usingDefaultPassword: !!user.must_change_password } }, 200, request)
  }

  if ((path === '/api/settings' || path === '/api/public/settings') && method === 'GET') {
    const rows = await env.DB.prepare(GLOBAL_SETTINGS_SQL).all().then((result) => result.results)
    return json(Object.fromEntries(rows.map((row) => [row.key, row.value])), 200, request)
  }

  if (path === '/api/companies' && method === 'POST') {
    const regKey = `register:${clientIp(request)}`
    if (await recentAttempts(env, regKey, REGISTER_WINDOW_MS) >= REGISTER_MAX_ATTEMPTS) {
      return json({ error: 'Too many registrations from this network. Please try again later.' }, 429, request)
    }
    await recordAttempts(env, [regKey])
    const body = await readJson(request)
    const trimmedName = String(body.name || '').trim()
    if (!trimmedName) return json({ error: 'Company name is required.' }, 400, request)
    const employees = Array.isArray(body.employees) ? body.employees.filter(Boolean) : []
    if (!employees.length) return json({ error: 'Add at least one employee account.' }, 400, request)
    if (employees.length > 100) return json({ error: 'A company can register up to 100 initial employees at a time.' }, 400, request)
    const seenEmails = new Set()
    for (const employee of employees) {
      const employeeName = String(employee?.name || '').trim()
      const email = String(employee?.email || '').trim().toLowerCase()
      if (!employeeName) return json({ error: 'Every employee must have a name.' }, 400, request)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Every employee must have a valid email address.' }, 400, request)
      if (seenEmails.has(email)) return json({ error: `Employee email "${email}" is listed more than once.` }, 400, request)
      seenEmails.add(email)
    }
    if (trimmedName) {
      const duplicate = await env.DB.prepare('SELECT id, name FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(trimmedName).first()
      if (duplicate) return json({ error: `Company name "${duplicate.name}" is already registered. Please choose a different name.` }, 409, request)
    }
    const id = `reg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const companyStatement = env.DB.prepare(
        `INSERT INTO companies (id, name, industry, address, city, contact_phone, contact_email, logo_name, status, active, owner_name, owner_title, owner_email, registered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, clampText(trimmedName, 200) || 'Unnamed Company', clampText(body.industry, 100), clampText(body.address, 300), clampText(body.city, 100),
        clampText(body.contactPhone, 50), clampText(body.contactEmail, 200), clampText(body.logoName, 300),
        'pending', 1, clampText(body.owner?.name, 100), clampText(body.owner?.title, 100), clampText(body.owner?.email, 200),
        clampText(body.registered, 10) || new Date().toISOString().slice(0, 10),
      )
    try {
      // One D1 batch: the company, employees and login accounts all commit or
      // all roll back. A failed account can never leave an orphaned company.
      await registerEmployees(env, id, employees, getDefaultEmployeePassword(env), [companyStatement])
    } catch (error) {
      const message = String(error?.message || '')
      if (message.includes('DEFAULT_EMPLOYEE_PASSWORD')) {
        return json({ error: 'Team accounts could not be created: no default password is configured for this deployment.' }, 500, request)
      }
      if (message.includes('EMPLOYEE_EMAIL_IN_USE')) return json({ error: 'One of the employee email addresses is already registered.' }, 409, request)
      if (/unique|primary/i.test(message)) return json({ error: 'The company name or an employee email address is already registered.' }, 409, request)
      throw error
    }
    await queueNotification(env, {
      to: NOTIFICATION_RECIPIENT,
      subject: `New company registration: ${trimmedName || 'Unnamed Company'}`,
      body: `Company: ${trimmedName || 'Unnamed Company'}\nIndustry: ${body.industry || ''}\nRegistered: ${body.registered || ''}\nTeam size: ${(body.employees || []).length}`,
    })
    const registeredEmployees = await env.DB.prepare('SELECT * FROM employees WHERE company_id = ?').bind(id).all().then((result) => result.results)
    const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first()
    return json(mapCompany(company, registeredEmployees), 201, request)
  }

  if (path === '/api/companies/check' && method === 'GET') {
    const name = String(url.searchParams.get('name') || '').trim()
    if (!name) return json({ exists: false }, 200, request)
    const row = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(name).first()
    return json({ exists: !!row, name }, 200, request)
  }

  if (path === '/api/roles' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM roles ORDER BY id').all().then((result) => result.results)
    return json(rows.map((row) => ({ id: row.id, name: row.name, perms: safeParse(row.perms_json) })), 200, request)
  }

  return null
}
