// Seed and migration helpers
import { getAdminCredentials, getCeoCredentials, COMPANY_SETTING_KEYS, GLOBAL_SETTINGS_SQL } from './constants.js'
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

  const adminCreds = getAdminCredentials(env)
  const ceoCreds = getCeoCredentials(env)
  await addUser(adminCreds.username, adminCreds.name, 'administrator', adminCreds.password)
  await addUser(ceoCreds.email, ceoCreds.name, 'ceo', ceoCreds.password)

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

let attendanceOvertimeMigrated = false
// Store overtime as exact minutes (open shifts: beyond 8h; timed shifts: the
// flagged session). Back-fills the column for databases created before it.
export async function migrateAttendanceOvertime(env) {
  if (attendanceOvertimeMigrated) return
  try {
    await env.DB.prepare('SELECT overtime_minutes FROM attendance LIMIT 1').first()
    attendanceOvertimeMigrated = true
    return
  } catch {
    // column missing — add it below
  }
  try {
    await env.DB.prepare('ALTER TABLE attendance ADD COLUMN overtime_minutes INTEGER NOT NULL DEFAULT 0').run()
  } catch {}
  attendanceOvertimeMigrated = true
}

let employeePayMigrated = false
// Payroll fields on employees — pay_type ('monthly' | 'hourly') and pay_rate
// (PHP per month / per hour). NULL means "salary not configured yet" and the
// Payroll page flags the employee until it is set.
export async function migrateEmployeePay(env) {
  if (employeePayMigrated) return
  try {
    await env.DB.prepare('SELECT pay_type, pay_rate FROM employees LIMIT 1').first()
    employeePayMigrated = true
    return
  } catch {
    // column missing — add it below
  }
  try {
    await env.DB.prepare('ALTER TABLE employees ADD COLUMN pay_type TEXT').run()
  } catch {}
  try {
    await env.DB.prepare('ALTER TABLE employees ADD COLUMN pay_rate REAL').run()
  } catch {}
  employeePayMigrated = true
}

let payrollRunsMigrated = false
// Saved payroll runs — one row per executed run with the totals that were
// disbursed plus a per-employee snapshot for audit/payslip reprinting.
export async function migratePayrollRuns(env) {
  if (payrollRunsMigrated) return
  try {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT,
        frequency TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        employee_count INTEGER NOT NULL DEFAULT 0,
        gross REAL NOT NULL DEFAULT 0,
        deductions REAL NOT NULL DEFAULT 0,
        net REAL NOT NULL DEFAULT 0,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON payroll_runs (company_id)'),
    ])
  } catch {}
  payrollRunsMigrated = true
}

let userProfileMigrated = false
// Profile fields on users (50) — phone + avatar persist server-side so the
// profile follows the account across devices (was localStorage-only).
export async function migrateUserProfile(env) {
  if (userProfileMigrated) return
  try {
    await env.DB.prepare('SELECT phone, avatar FROM users LIMIT 1').first()
    userProfileMigrated = true
    return
  } catch {
    // column missing — add it below
  }
  try { await env.DB.prepare('ALTER TABLE users ADD COLUMN phone TEXT').run() } catch {}
  try { await env.DB.prepare('ALTER TABLE users ADD COLUMN avatar TEXT').run() } catch {}
  userProfileMigrated = true
}

export { COMPANY_SETTING_KEYS, GLOBAL_SETTINGS_SQL }
