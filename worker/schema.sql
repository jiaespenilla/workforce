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
  assignee TEXT NOT NULL,            -- "Name (Company)"
  priority TEXT DEFAULT 'Medium',
  due TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

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
  created_at TEXT DEFAULT (datetime('now'))
);