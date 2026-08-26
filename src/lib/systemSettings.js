import { api, apiEnabled } from './api'

const DEFAULT_SETTINGS = {
  name: 'Unified Workforce',
  version: 'v2.4.1',
  timezone: '(GMT+08:00) Asia/Manila',
}

export function getActiveSettings() {
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
    if (!Object.keys(mapped).length) return
    localStorage.setItem('uw_system_settings', JSON.stringify({ ...getActiveSettings(), ...mapped }))
  } catch {
    /* offline or unauthenticated — keep local settings */
  }
}

// Push system details to the server (cloud mode). Returns an error string or null.
export async function pushSystemSettingsToServer({ name, version, timezone }) {
  if (!apiEnabled()) return null
  try {
    await api('/api/settings', { method: 'PUT', body: { system_name: name, version, timezone } })
    return null
  } catch (err) {
    return err.message || 'Failed to sync system settings.'
  }
}

export function setSessionTimeoutMinutes(minutes) {
  const value = Number(minutes)
  if (Number.isFinite(value) && value > 0) localStorage.setItem('uw_session_timeout', String(Math.floor(value)))
  else localStorage.removeItem('uw_session_timeout')
}
