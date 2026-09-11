// Shared DB helpers — mappers, insert helpers
import { hashPassword } from './crypto.js'
import { isPlaceholderPassword } from './constants.js'

export function mapCompany(row, employees) {
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
      .map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, active: e.active !== 0, locationId: e.location_id || null, location: e.location || null, payType: e.pay_type || null, payRate: e.pay_rate ?? null, avatar: e.user_avatar || null })),
  }
}

function parseNotes(raw) {
  if (Array.isArray(raw)) return raw.filter((n) => n && typeof n === 'object')
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((n) => n && typeof n === 'object') : []
  } catch {
    return []
  }
}

export function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    assigneeId: row.assignee_id ?? null,
    assigneeEmail: row.assignee_email || null,
    assigneeCompanyId: row.assignee_company_id || null,
    priority: row.priority,
    due: row.due,
    status: row.status,
    notes: parseNotes(row.notes),
    // Work log timer (63): accumulated seconds, running session start and
    // the session history [{start, end, seconds}].
    workSeconds: row.work_seconds || 0,
    workStartedAt: row.work_started_at || null,
    workLog: safeParseArray(row.work_log),
  }
}

// Parse a JSON column that must hold an array (work log sessions).
export function safeParseArray(text) {
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function mapNotification(row) {
  return { id: row.id, to: row.to_email, subject: row.subject, body: row.body, status: row.status, createdAt: row.created_at }
}

export function safeParse(text) {
  try {
    return JSON.parse(text) || {}
  } catch {
    return {}
  }
}

// Escape LIKE wildcards so user-derived strings match literally
// (use together with `LIKE ? ESCAPE '\'`).
export function escapeLike(text) {
  return String(text || '').replace(/[\\%_]/g, '\\$&')
}

// Canonical employee insert (migration guarantees pay_type/pay_rate exist).
// Exported for the atomic registration batch below.
function employeeInsertStatement(env, companyId, emp) {
  const locId = emp.locationId || emp.location || null
  // Payroll fields (49/50): pay_type 'monthly'|'hourly', pay_rate — optional at creation.
  const payType = emp.payType && ['monthly', 'hourly'].includes(String(emp.payType)) ? String(emp.payType) : null
  const payRate = emp.payRate === undefined || emp.payRate === null || emp.payRate === '' ? null : Math.max(0, Number(emp.payRate) || 0)
  return env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active, location_id, pay_type, pay_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1, locId, payType, payRate)
}

export async function insertEmployee(env, companyId, emp) {
  try {
    await employeeInsertStatement(env, companyId, emp).run()
  } catch (e) {
    // Fallback for databases missing the optional columns — logged so schema
    // drift is visible in Worker logs instead of silently reduced features.
    console.error('insertEmployee: canonical insert failed, retrying without payroll columns:', e?.message || e)
    const locId = emp.locationId || emp.location || null
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active, location_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1, locId).run()
    } catch (e2) {
      console.error('insertEmployee: retry failed, using base columns only:', e2?.message || e2)
      await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active) VALUES (?, ?, ?, ?, ?)')
        .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1).run()
    }
  }
}

// Atomic team creation for public registration: every employee row and its
// login account are inserted in a single D1 batch, so a failure cannot leave
// a half-registered company behind (the old sequential loop could).
export async function registerEmployees(env, companyId, employees, defaultPassword) {
  const list = (Array.isArray(employees) ? employees : []).filter((e) => e && (e.name || e.email))
  if (!list.length) return 0
  // SECURITY: fail closed — same rule as ensureUser.
  if (isPlaceholderPassword(defaultPassword)) {
    throw new Error('registerEmployees: no usable DEFAULT_EMPLOYEE_PASSWORD is configured')
  }
  // Skip login accounts that already exist (mirrors ensureUser's behavior).
  const emails = list.map((e) => String(e.email || '').toLowerCase()).filter(Boolean)
  const existing = new Set()
  if (emails.length) {
    const placeholders = emails.map(() => '?').join(', ')
    const rows = await env.DB.prepare(`SELECT lower(email) AS email FROM users WHERE lower(email) IN (${placeholders})`)
      .bind(...emails).all().then((r) => r.results)
    for (const r of rows) existing.add(String(r.email || '').toLowerCase())
  }
  const stmts = []
  for (const emp of list) {
    stmts.push(employeeInsertStatement(env, companyId, emp))
    const email = String(emp.email || '').toLowerCase()
    if (email && !existing.has(email)) {
      const roleForUser = (emp.role || '').trim().toLowerCase() === 'ceo' ? 'ceo' : 'employee'
      const salt = crypto.randomUUID()
      stmts.push(env.DB.prepare('INSERT INTO users (email, name, role, password_salt, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, 1)')
        .bind(email, emp.name || email, roleForUser, salt, await hashPassword(defaultPassword, salt)))
      existing.add(email)
    }
  }
  await env.DB.batch(stmts)
  return list.length
}

export async function ensureUser(env, email, name, role, password) {
  if (!email) return
  // SECURITY: fail closed — refuse to mint accounts whose password is empty or
  // a known source placeholder. Configure DEFAULT_EMPLOYEE_PASSWORD first.
  if (isPlaceholderPassword(password)) {
    throw new Error('ensureUser: no usable DEFAULT_EMPLOYEE_PASSWORD is configured')
  }
  const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email.toLowerCase()).first()
  if (existing) return
  const salt = crypto.randomUUID()
  try {
    await env.DB.prepare('INSERT INTO users (email, name, role, password_salt, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(email.toLowerCase(), name || email, role, salt, await hashPassword(password, salt)).run()
  } catch (e) {
    // Race: another request inserted same email concurrently — ignore UNIQUE violation
    if (!String(e.message || '').includes('UNIQUE') && !String(e.message || '').includes('unique')) throw e
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function queueNotification(env, { to, subject, body }) {
  if (!to) return
  // Basic email validation to prevent open relay
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())
  if (!emailOk) return
  const safeSubject = String(subject || '').slice(0, 200)
  const safeBody = String(body || '').slice(0, 5000)
  await env.DB.prepare('INSERT INTO notifications (to_email, subject, body) VALUES (?, ?, ?)').bind(to.toLowerCase(), safeSubject, safeBody).run()
  if (env.EMAIL) {
    try {
      await env.EMAIL.send({
        from: { email: 'noreply@celestsolutions.workers.dev', name: 'CadensIQ' },
        to,
        subject: safeSubject,
        text: safeBody,
        html: `<div style="font-family:sans-serif;white-space:pre-line">${escapeHtml(safeBody)}</div>`,
      })
    } catch (e) {
      console.error('EMAIL send failed (check wrangler email sending enable + verified domain):', e.message)
    }
  }
}
