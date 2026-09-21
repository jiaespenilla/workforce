-- Pair a standalone browser kiosk without requiring an employee account.
-- Only keyed token hashes are stored; raw pairing codes and session tokens
-- are returned once and remain on the paired kiosk computer.

CREATE TABLE IF NOT EXISTS time_clock_pairing_codes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES time_clock_devices(id) ON DELETE CASCADE,
  code_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clock_pairing_device ON time_clock_pairing_codes(device_id, expires_at);

CREATE TABLE IF NOT EXISTS time_clock_kiosk_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES time_clock_devices(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  paired_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_clock_kiosk_device ON time_clock_kiosk_sessions(device_id, active);
