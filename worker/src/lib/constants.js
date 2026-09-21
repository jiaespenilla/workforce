// Shared constants for the Worker
// SECURITY: Real secrets must be set via `wrangler secret put` / env vars.
// Values below are ONLY fallbacks for local dev / tests — never use in production.
export const ADMIN = {
  username: 'admin_celestine',
  // Overridable via env.ADMIN_PASSWORD at runtime (see getAdminCredentials)
  password: '___REPLACE_VIA_ENV_ADMIN_PASSWORD___',
  name: 'Aizl Jo Bornillo',
}
export const CEO_EMAIL = 'ceo@celestsolutions.com'
export const CEO_PASSWORD = '___REPLACE_VIA_ENV_CEO_PASSWORD___'
export const CEO_NAME = 'Celestine Espenilla'
// SECURITY: no real password is committed to source. When DEFAULT_EMPLOYEE_PASSWORD
// is not configured, this placeholder is returned and refused by ensureUser and
// the admin reset flow (fail closed), so an unconfigured deployment can never
// mint accounts with a known password.
export const DEFAULT_EMPLOYEE_PASSWORD = '___REPLACE_VIA_ENV_DEFAULT_EMPLOYEE_PASSWORD___'
export const NOTIFICATION_RECIPIENT = 'jiaespenilla@gmail.com'

export function getAdminCredentials(env) {
  return {
    username: env.ADMIN_USERNAME || ADMIN.username,
    password: env.ADMIN_PASSWORD || ADMIN.password,
    name: env.ADMIN_NAME || ADMIN.name,
  }
}
export function getCeoCredentials(env) {
  return {
    email: env.CEO_EMAIL || CEO_EMAIL,
    password: env.CEO_PASSWORD || CEO_PASSWORD,
    name: env.CEO_NAME || CEO_NAME,
  }
}
let defaultEmployeePasswordWarned = false
export function getDefaultEmployeePassword(env) {
  if (env.DEFAULT_EMPLOYEE_PASSWORD) return env.DEFAULT_EMPLOYEE_PASSWORD
  // SECURITY: never ship a real fallback password in source — warn so an
  // unconfigured deployment is visible in logs instead of silently weak.
  if (!defaultEmployeePasswordWarned) {
    defaultEmployeePasswordWarned = true
    console.warn('DEFAULT_EMPLOYEE_PASSWORD is not configured — new accounts cannot be created and password resets are disabled. Set it via `wrangler secret put DEFAULT_EMPLOYEE_PASSWORD`.')
  }
  return DEFAULT_EMPLOYEE_PASSWORD
}

// True when no usable deployment default password is configured (empty or the
// source placeholder). Used to fail closed in ensureUser and admin reset.
export const isPlaceholderPassword = (pw) => !pw || pw === DEFAULT_EMPLOYEE_PASSWORD

export const PBKDF2_ITERATIONS = 100000

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_ATTEMPTS = 8
export const LOGIN_IP_MAX_ATTEMPTS = 24
export const REGISTER_WINDOW_MS = 60 * 60 * 1000
export const REGISTER_MAX_ATTEMPTS = 5
export const KIOSK_WINDOW_MS = 15 * 60 * 1000
export const KIOSK_MAX_ATTEMPTS = 200

export const COMPANY_SETTING_KEYS = ['shift_schedules', 'company_locations', 'attachment_storage']
// Public settings are an allowlist. A denylist previously risked exposing new
// secret-bearing settings (including legacy kiosk tokens) as features grew.
export const GLOBAL_SETTINGS_SQL =
  "SELECT key, value FROM settings WHERE key IN ('system_name', 'version', 'timezone', 'system_icon', 'idle_timeout', 'idle_timeout_minutes', 'maintenance_mode')"
