// Seed and migration helpers
import { ADMIN, CEO_EMAIL, CEO_NAME, CEO_PASSWORD, COMPANY_SETTING_KEYS, GLOBAL_SETTINGS_SQL } from './constants.js'
import { hashPassword } from './crypto.js'

let seedVerified = false

export async function ensureSeed(env) {
  if (seedVerified) return
  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first()
  if (count > 0) {
    seedVerified = true
    return
  }

  async function addUser(email, name, role, password) {
    const salt = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO users (email, name, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, name, role, salt, await hashPassword(password, salt)).run()
  }

  await addUser(ADMIN.username, ADMIN.name, 'administrator', ADMIN.password)
  await addUser(CEO_EMAIL, CEO_NAME, 'ceo', CEO_PASSWORD)

  const defaults = [
    ['CEO', { dashboard: true, timekeeping: true, tasks: true, payroll: true, employees: true, shifts: true, kiosk: false, settings: false }],
    ['HR Manager', { dashboard: true, timekeeping: true, tasks: true, payroll: false, employees: true, shifts: true, kiosk: true, settings: false }],
    ['Team Lead', { dashboard: true, timekeeping: true, tasks: true, payroll: false, employees: false, shifts: true, kiosk: true, settings: false }],
    ['Employee', { dashboard: true, timekeeping: true, tasks: true, payroll: false, employees: false, shifts: true, kiosk: true, settings: false }],
  ]
  for (const [name, perms] of defaults) {
    await env.DB.prepare('INSERT INTO roles (name, perms_json) VALUES (?, ?)').bind(name, JSON.stringify(perms)).run()
  }

  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('system_name', 'CadensIQ').run()
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('version', 'v0.1.0').run()
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('timezone', '(GMT+08:00) Asia/Manila').run()
}

let taskColumnsMigrated = false
export async function migrateTaskColumns(env) {
  if (taskColumnsMigrated) return
  try {
    await env.DB.prepare('SELECT assignee_email FROM tasks LIMIT 1').first()
    taskColumnsMigrated = true
    return
  } catch {
    // column missing — add it
  }
  const stmts = []
  try {
    stmts.push(env.DB.prepare('ALTER TABLE tasks ADD COLUMN assignee_email TEXT'))
  } catch {}
  try {
    stmts.push(env.DB.prepare('ALTER TABLE tasks ADD COLUMN assignee_company_id TEXT'))
  } catch {}
  try {
    stmts.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_assignee_email ON tasks (assignee_email)'))
  } catch {}
  try {
    stmts.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks (assignee_company_id)'))
  } catch {}
  if (stmts.length) {
    try { await env.DB.batch(stmts) } catch {}
  }
  // Best-effort backfill: parse "Name (Company)" -> email + company_id
  try {
    const rows = await env.DB.prepare('SELECT id, assignee FROM tasks WHERE assignee_email IS NULL').all().then((r) => r.results)
    for (const r of rows) {
      const m = String(r.assignee || '').match(/^(.*)\s+\((.*)\)\s*$/)
      if (!m) continue
      const companyName = m[2].trim()
      const comp = await env.DB.prepare('SELECT id FROM companies WHERE lower(name) = lower(?) LIMIT 1').bind(companyName).first()
      const emailRow = await env.DB.prepare('SELECT email FROM employees WHERE lower(name) = lower(?) AND company_id = ? LIMIT 1').bind(m[1].trim(), comp?.id || '').first()
      // Fallback: try to find any employee with that name anywhere
      const email = emailRow?.email || null
      await env.DB.prepare('UPDATE tasks SET assignee_email = ?, assignee_company_id = ? WHERE id = ?').bind(email ? email.toLowerCase() : null, comp?.id || null, r.id).run()
    }
  } catch {}
  taskColumnsMigrated = true
}

let taskAssigneeIdMigrated = false
// Normalize tasks.assignee to a stable employee id (employees.id). The
// display string ("Name (Company)") stays as-is for the UI, but every task
// also gets assignee_id so reports/scoping don't break on renames.
export async function migrateTaskAssigneeId(env) {
  if (taskAssigneeIdMigrated) return
  try {
    await env.DB.prepare('SELECT assignee_id FROM tasks LIMIT 1').first()
    taskAssigneeIdMigrated = true
    return
  } catch {
    // column missing — add it
  }
  const stmts = []
  try {
    stmts.push(env.DB.prepare('ALTER TABLE tasks ADD COLUMN assignee_id INTEGER'))
  } catch {}
  try {
    stmts.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks (assignee_id)'))
  } catch {}
  if (stmts.length) {
    try { await env.DB.batch(stmts) } catch {}
  }
  // Best-effort backfill: resolve assignee_id from the normalized email.
  try {
    await env.DB.prepare(
      'UPDATE tasks SET assignee_id = (SELECT e.id FROM employees e WHERE lower(e.email) = lower(tasks.assignee_email) LIMIT 1) WHERE assignee_id IS NULL AND assignee_email IS NOT NULL'
    ).run()
  } catch {}
  taskAssigneeIdMigrated = true
}


let companySettingsMigrated = false
export async function migrateCompanySettings(env) {
  if (companySettingsMigrated) return
  const marker = await env.DB.prepare("SELECT key FROM settings WHERE key = 'company_settings_v2'").first()
  if (marker) {
    companySettingsMigrated = true
    return
  }
  const rows = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('shift_schedules','company_locations','kiosk_configs')"
  ).all().then((r) => r.results)
  const statements = []
  for (const row of rows) {
    try {
      const all = JSON.parse(row.value || '{}')
      for (const [companyId, payload] of Object.entries(all)) {
        if (companyId === '_legacy' || payload === undefined || payload === null) continue
        statements.push(
          env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`${row.key}:${companyId}`, JSON.stringify(payload))
        )
      }
    } catch { /* corrupt legacy blob — skip */ }
  }
  statements.push(env.DB.prepare("DELETE FROM settings WHERE key IN ('shift_schedules','company_locations','kiosk_configs')"))
  statements.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES ('company_settings_v2', '1') ON CONFLICT(key) DO NOTHING"))
  await env.DB.batch(statements)
  companySettingsMigrated = true
}

export { COMPANY_SETTING_KEYS, GLOBAL_SETTINGS_SQL }
