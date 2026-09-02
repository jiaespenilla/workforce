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
export const DEFAULT_EMPLOYEE_PASSWORD = '___REPLACE_VIA_ENV_DEFAULT_PASSWORD___'
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
export function getDefaultEmployeePassword(env) {
  return env.DEFAULT_EMPLOYEE_PASSWORD || DEFAULT_EMPLOYEE_PASSWORD
}

export const PBKDF2_ITERATIONS = 100000

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_ATTEMPTS = 8
export const LOGIN_IP_MAX_ATTEMPTS = 24
export const REGISTER_WINDOW_MS = 60 * 60 * 1000
export const REGISTER_MAX_ATTEMPTS = 5
export const KIOSK_WINDOW_MS = 15 * 60 * 1000
export const KIOSK_MAX_ATTEMPTS = 200

export const COMPANY_SETTING_KEYS = ['shift_schedules', 'company_locations', 'kiosk_configs', 'attachment_storage']
export const GLOBAL_SETTINGS_SQL =
  "SELECT key, value FROM settings WHERE key NOT LIKE 'shift_schedules:%' AND key NOT LIKE 'company_locations:%' AND key NOT LIKE 'kiosk_configs:%' AND key NOT LIKE 'attachment_storage:%'"
