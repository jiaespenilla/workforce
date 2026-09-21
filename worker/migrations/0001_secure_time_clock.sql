-- Secure personal passkeys and vendor-neutral terminal ingestion.
-- Existing attendance rows are preserved; new metadata columns are nullable.

ALTER TABLE webauthn_credentials ADD COLUMN label TEXT;
ALTER TABLE webauthn_credentials ADD COLUMN last_used_at TEXT;
ALTER TABLE webauthn_credentials ADD COLUMN revoked_at TEXT;

ALTER TABLE attendance ADD COLUMN source_event_id TEXT;
ALTER TABLE attendance ADD COLUMN source TEXT;
ALTER TABLE attendance ADD COLUMN device_id TEXT;
ALTER TABLE attendance ADD COLUMN site_id TEXT;
ALTER TABLE attendance ADD COLUMN received_at TEXT;
ALTER TABLE attendance ADD COLUMN latitude REAL;
ALTER TABLE attendance ADD COLUMN longitude REAL;
ALTER TABLE attendance ADD COLUMN accuracy REAL;
ALTER TABLE attendance ADD COLUMN location_status TEXT;
ALTER TABLE attendance ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS time_clock_devices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id TEXT,
  name TEXT NOT NULL,
  vendor TEXT,
  model TEXT,
  adapter TEXT NOT NULL DEFAULT 'generic-v1',
  secret_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  last_sequence INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clock_devices_company ON time_clock_devices(company_id);

CREATE TABLE IF NOT EXISTS terminal_employee_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES time_clock_devices(id) ON DELETE CASCADE,
  terminal_user_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(device_id, terminal_user_id)
);
CREATE INDEX IF NOT EXISTS idx_terminal_mapping_employee ON terminal_employee_mappings(employee_id);

CREATE TABLE IF NOT EXISTS time_clock_nonces (
  device_id TEXT NOT NULL REFERENCES time_clock_devices(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_clock_nonces_expiry ON time_clock_nonces(expires_at);

CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  source TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  email TEXT,
  company_id TEXT NOT NULL,
  device_id TEXT,
  site_id TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  punch_type TEXT,
  sequence INTEGER,
  status TEXT NOT NULL,
  rejection_reason TEXT,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  location_status TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, device_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_events_company_received ON attendance_events(company_id, received_at);
CREATE INDEX IF NOT EXISTS idx_attendance_events_device_sequence ON attendance_events(device_id, sequence);
CREATE INDEX IF NOT EXISTS idx_attendance_source_event ON attendance(source_event_id);

-- Retire every legacy shared-kiosk token immediately.
DELETE FROM settings WHERE key LIKE 'kiosk_device_token:%' OR key LIKE 'kiosk_token_expiry:%';
DELETE FROM employee_credentials;
