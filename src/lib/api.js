// API client for the Cloudflare Worker backend (worker/).
//
// The app runs in two modes:
//  - "cloud" mode: when VITE_API_URL is configured (production deployment) —
//    data lives in D1 and is shared between all users.
//  - "local" mode: no API URL configured (local demo) — everything falls back
//    to localStorage so the app keeps working standalone.

const token = () => localStorage.getItem('uw_token') || ''

export function apiEnabled() {
  return Boolean(import.meta.env.VITE_API_URL)
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
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
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
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
