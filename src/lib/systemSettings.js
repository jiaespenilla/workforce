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
      ...(s.idle_timeout !== undefined ? { idle_timeout: s.idle_timeout } : s.idle_timeout_minutes !== undefined ? { idle_timeout: s.idle_timeout_minutes } : {}),
    }
    localStorage.setItem('uw_system_settings', JSON.stringify(_serverSettings))
    if (s.idle_timeout !== undefined || s.idle_timeout_minutes !== undefined) {
      const v = s.idle_timeout ?? s.idle_timeout_minutes
      if (v !== undefined && v !== null && String(v).trim() !== '') localStorage.setItem('uw_session_timeout', String(v))
      else localStorage.removeItem('uw_session_timeout')
    }
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
// Prefers server-synced value (_serverSettings.idle_timeout) so non-admins get admin's setting.
export function getSessionTimeoutMinutes() {
  if (_serverSettings && _serverSettings.idle_timeout !== undefined) {
    const v = Number(_serverSettings.idle_timeout)
    if (Number.isFinite(v) && v > 0) return Math.floor(v)
    if (_serverSettings.idle_timeout === '' || v === 0) return 0
  }
  const value = Number(localStorage.getItem('uw_session_timeout'))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
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
      ...(s.idle_timeout !== undefined ? { idle_timeout: s.idle_timeout } : s.idle_timeout_minutes !== undefined ? { idle_timeout: s.idle_timeout_minutes } : {}),
    }
    const hasIcon = s.system_icon !== undefined
    const hasIdle = s.idle_timeout !== undefined || s.idle_timeout_minutes !== undefined
    if (!Object.keys(mapped).length && !hasIcon && !hasIdle) return
    _serverSettings = { ...(_serverSettings || {}), ...mapped }
    localStorage.setItem('uw_system_settings', JSON.stringify(_serverSettings))
    if (hasIdle) {
      const v = s.idle_timeout ?? s.idle_timeout_minutes
      if (v !== undefined && v !== null && String(v).trim() !== '') localStorage.setItem('uw_session_timeout', String(v))
      else localStorage.removeItem('uw_session_timeout')
    }
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
export async function pushSystemSettingsToServer({ name, version, timezone, system_icon, idle_timeout }) {
  if (!apiEnabled()) return null
  try {
    const body = {}
    if (name !== undefined) body.system_name = name
    if (version !== undefined) body.version = version
    if (timezone !== undefined) body.timezone = timezone
    if (system_icon !== undefined) body.system_icon = system_icon
    if (idle_timeout !== undefined) body.idle_timeout = idle_timeout
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
  const normalized = Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : ''
  if (normalized) localStorage.setItem('uw_session_timeout', normalized)
  else localStorage.removeItem('uw_session_timeout')
  // sync server value so non-admins receive it immediately
  if (_serverSettings) _serverSettings.idle_timeout = normalized || ''
  if (apiEnabled()) {
    // fire-and-forget sync
    api('/api/settings', { method: 'PUT', body: { idle_timeout: normalized } }).catch(()=>{})
  }
}
