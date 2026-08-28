// Shared constants for the Worker
export const ADMIN = { username: 'admin_celestine', password: 'Celest!ne2026!', name: 'Aizl Jo Bornillo' }
export const CEO_EMAIL = 'ceo@celestsolutions.com'
export const CEO_PASSWORD = 'P@ssw0rd2026!'
export const CEO_NAME = 'Celestine Espenilla'
export const DEFAULT_EMPLOYEE_PASSWORD = 'P@ssw0rd2026!'
export const NOTIFICATION_RECIPIENT = 'jiaespenilla@gmail.com'

export const PBKDF2_ITERATIONS = 25000

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
