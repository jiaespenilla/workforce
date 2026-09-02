-- Unified Workforce — D1 schema (run with: npx wrangler d1 execute workforce --file=./schema.sql --remote)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,                -- administrator | ceo | employee
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,       -- SHA-256(salt + ':' + password)
  must_change_password INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  address TEXT,
  city TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  logo_name TEXT,
  status TEXT DEFAULT 'pending',     -- pending | approved | rejected
  active INTEGER DEFAULT 1,
  owner_name TEXT,
  owner_title TEXT,
  owner_email TEXT,
  registered TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT,
  active INTEGER DEFAULT 1,
  -- People & Organization extensions (Phase 3)
  department_id INTEGER,
  business_unit_id INTEGER,
  location_id INTEGER,
  cost_center_id INTEGER,
  position_id INTEGER,
  job_level_id INTEGER,
  employment_type_id INTEGER,
  manager_email TEXT,
  hire_date TEXT,
  employment_status TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  assignee TEXT NOT NULL,            -- "Name (Company)" — legacy display string, kept for backward compat
  assignee_email TEXT,                -- normalized FK to employees.email (lowercase)
  assignee_company_id TEXT REFERENCES companies(id),
  priority TEXT DEFAULT 'Medium',
  due TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_email ON tasks (assignee_email);
CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks (assignee_company_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'pending-smtp',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  perms_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Phase 2 readiness: organization reference tables
CREATE TABLE IF NOT EXISTS org_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                -- department | business_unit | location | cost_center | position | job_level | employment_type
  name TEXT NOT NULL,
  code TEXT,
  parent_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                -- employment | salary | status
  payload_json TEXT NOT NULL,        -- { amount, currency, raise_pct, reason, ... }
  effective_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT,                     -- contract | id | certificate | other
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_type TEXT,
  expires_on TEXT,
  uploaded_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_credentials (
  email TEXT PRIMARY KEY,
  pin_salt TEXT,
  pin_hash TEXT,
  fp_token TEXT,
  qr_code TEXT UNIQUE,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  company_id TEXT,
  type TEXT NOT NULL,                -- in | out
  time TEXT NOT NULL,
  overtime INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0, -- minutes of overtime for the worked session (open shifts: beyond 8h; timed: flagged session)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Brute-force protection counters (failed logins, registrations, kiosk attempts)
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,                 -- e.g. "login:id:<email>", "login:ip:<ip>", "register:<ip>", "kiosk:<ip>"
  attempt_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time ON login_attempts (key, attempt_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts (attempt_at);

-- WebAuthn biometric (fingerprint/passkey) credentials for kiosk devices
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  company_id TEXT,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  transports TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wcred_email ON webauthn_credentials (email);

-- One-time WebAuthn challenges (register + authenticate)
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                -- register | authentication
  email TEXT,
  rp_id TEXT,
  origin TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wchallenge_time ON webauthn_challenges (expires_at);