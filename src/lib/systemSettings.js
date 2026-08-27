import { api, apiEnabled } from './api'

const DEFAULT_SETTINGS = {
  name: 'CadensIQ',
  version: 'v0.1.0',
  timezone: '(GMT+08:00) Asia/Manila',
}

// In-memory cache populated at startup in cloud mode.
let _serverSettings = null

// Pre-fetch server settings once at startup so getActiveSettings() returns
// correct data immediately (no flash of default values).
export async function prefetchServerSettings() {
  if (!apiEnabled()) return
  try {
    const s = await api('/api/settings')
    _serverSettings = {
      ...(s.system_name ? { name: s.system_name } : {}),
      ...(s.version ? { version: s.version } : {}),
      ...(s.timezone ? { timezone: s.timezone } : {}),
    }
    localStorage.setItem('uw_system_settings', JSON.stringify(_serverSettings))
    // Hydrate favicon from D1 (global) — overwrites local if server has value
    if (s.system_icon) {
      localStorage.setItem('uw_system_icon', s.system_icon)
      // applyFavicon will be called on next import; also dispatch for live update
      try { document.querySelector("link[rel~='icon']")?.setAttribute('href', s.system_icon) } catch {}
    } else if (s.system_icon === '') {
      localStorage.removeItem('uw_system_icon')
    }
  } catch {
    // offline — keep localStorage or defaults
  }
}

export function getActiveSettings() {
  if (_serverSettings) return { ...DEFAULT_SETTINGS, ..._serverSettings }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('uw_system_settings')) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function getPendingSettings() {
  try {
    return JSON.parse(localStorage.getItem('uw_pending_system_settings'))
  } catch {
    return null
  }
}

export function queueSystemSettings(settings) {
  localStorage.setItem('uw_pending_system_settings', JSON.stringify(settings))
}

// Called during logout — pending changes become the live system details.
export function commitPendingSystemSettings() {
  const pending = getPendingSettings()
  if (!pending) return
  localStorage.setItem('uw_system_settings', JSON.stringify(pending))
  localStorage.removeItem('uw_pending_system_settings')
}

// IANA time zone derived from the system settings (e.g. "(GMT+08:00) Asia/Manila" -> "Asia/Manila").
export function getSystemTimeZone() {
  const tz = getActiveSettings().timezone || ''
  return tz.split(') ')[1] || 'Asia/Manila'
}

// Maintenance mode — when enabled, only administrators can use the system.
export function isMaintenanceMode() {
  return localStorage.getItem('uw_maintenance') === 'on'
}

export function setMaintenanceMode(on) {
  if (on) localStorage.setItem('uw_maintenance', 'on')
  else localStorage.removeItem('uw_maintenance')
}

// Idle session time-out in minutes. 0 disables auto-logout. Applies immediately.
export function getSessionTimeoutMinutes() {
  const value = Number(localStorage.getItem('uw_session_timeout'))
  return Number.isFinite(value) && value > 0 ? value : 0
}

// Pull server-managed system details (cloud mode) into the active settings.
export async function syncSystemSettingsFromServer() {
  if (!apiEnabled()) return
  try {
    const s = await api('/api/settings')
    const mapped = {
      ...(s.system_name ? { name: s.system_name } : {}),
      ...(s.version ? { version: s.version } : {}),
      ...(s.timezone ? { timezone: s.timezone } : {}),
    }
    if (!Object.keys(mapped).length && !s.system_icon) return
    _serverSettings = mapped
    localStorage.setItem('uw_system_settings', JSON.stringify(mapped))
    if (s.system_icon) {
      localStorage.setItem('uw_system_icon', s.system_icon)
      try { document.querySelector("link[rel~='icon']")?.setAttribute('href', s.system_icon) } catch {}
    } else if (s.system_icon === '') {
      localStorage.removeItem('uw_system_icon')
    }
  } catch {
    /* offline or unauthenticated — keep local settings */
  }
}

// Push system details to the server (cloud mode). Returns an error string or null.
export async function pushSystemSettingsToServer({ name, version, timezone, system_icon }) {
  if (!apiEnabled()) return null
  try {
    const body = {}
    if (name !== undefined) body.system_name = name
    if (version !== undefined) body.version = version
    if (timezone !== undefined) body.timezone = timezone
    if (system_icon !== undefined) body.system_icon = system_icon
    if (!Object.keys(body).length) return null
    await api('/api/settings', { method: 'PUT', body })
    return null
  } catch (err) {
    return err.message || 'Failed to sync system settings.'
  }
}

export async function pushSystemIconToServer(icon) {
  if (!apiEnabled()) return null
  try {
    await api('/api/settings', { method: 'PUT', body: { system_icon: icon || '' } })
    return null
  } catch (err) {
    return err.message || 'Failed to sync icon.'
  }
}

export function setSessionTimeoutMinutes(minutes) {
  const value = Number(minutes)
  if (Number.isFinite(value) && value > 0) localStorage.setItem('uw_session_timeout', String(Math.floor(value)))
  else localStorage.removeItem('uw_session_timeout')
}
