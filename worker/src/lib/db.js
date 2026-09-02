// Shared DB helpers — mappers, insert helpers
import { hashPassword } from './crypto.js'

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
      .map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, active: e.active !== 0, locationId: e.location_id || null, location: e.location || null })),
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

export async function insertEmployee(env, companyId, emp) {
  const locId = emp.locationId || emp.location || null
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active, location_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1, locId).run()
  } catch {
    await env.DB.prepare('INSERT OR IGNORE INTO employees (company_id, name, email, role, active) VALUES (?, ?, ?, ?, ?)')
      .bind(companyId, emp.name || 'Unnamed', (emp.email || '').toLowerCase(), emp.role || 'Unassigned', emp.active === false ? 0 : 1).run()
  }
}

export async function ensureUser(env, email, name, role, password) {
  if (!email) return
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
