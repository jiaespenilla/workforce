// API client for the Cloudflare Worker backend (worker/).
//
// The app runs in two modes:
//  - "cloud" mode: when VITE_API_URL is configured (production deployment) —
//    data lives in D1 and is shared between all users.
//  - "local" mode: no API URL configured (local demo) — everything falls back
//    to localStorage so the app keeps working standalone.

const token = () => localStorage.getItem('uw_token') || ''

// Safe under non-Vite environments where import.meta.env may be undefined.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
// In production the app and API are served from the same Worker, so fall back
// to same-origin. Localhost keeps offline/demo mode unless VITE_API_URL is set.
const isLocalhost =
  typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1|\*.localhost)$/.test(location.hostname)
const API_URL = env.VITE_API_URL || (typeof location !== 'undefined' && !isLocalhost ? location.origin : '')

export function apiEnabled() {
  return Boolean(API_URL)
}

// Clear stale localStorage data left over from local-mode usage.
// Only runs once per session via the CLEANED flag.
const CLEANED_KEY = 'uw_local_cleaned'
const DATA_KEYS = [
  'uw_companies', 'uw_ceo_tasks', 'uw_punches', 'uw_roles',
  'uw_org_units', 'uw_shift_schedules', 'uw_company_locations', 'uw_kiosk_configs', 'uw_kiosk_config', 'uw_notifications',
  'uw_profiles', 'uw_passwords', 'uw_ceo_password',
  'uw_legal', 'uw_system_settings', 'uw_pending_system_settings', 'uw_version_history',
  'uw_maintenance', 'uw_session_timeout',
]

export function cleanStaleLocalStorage() {
  if (!apiEnabled()) return
  if (localStorage.getItem(CLEANED_KEY)) return
  for (const key of DATA_KEYS) localStorage.removeItem(key)
  localStorage.setItem(CLEANED_KEY, '1')
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

// Attempt a server login. Returns { token, user } or null when the API is not
// configured/unreachable, letting the caller fall back to local authentication.
export async function tryApiLogin(identifier, password) {
  if (!apiEnabled()) return null
  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Invalid credentials.')
    }
    return await res.json()
  } catch (err) {
    if (err.message && !err.message.includes('Failed to fetch')) throw err
    return null // network unreachable → local fallback
  }
}

// Fetch the full bootstrap payload (settings, roles, companies+employees,
// tasks, notifications). Returns null in local mode.
export async function fetchBootstrap() {
  if (!apiEnabled()) return null
  try {
    return await api('/api/bootstrap')
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem('uw_token')
      localStorage.removeItem('uw_user')
    }
    return null
  }
}
